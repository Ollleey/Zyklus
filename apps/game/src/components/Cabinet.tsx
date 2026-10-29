import { useEffect, useMemo, useState } from 'react';
import {
  MODULE_TYPES,
  channelKind,
  tr,
  type BoardAnalysis,
  type Device,
  type Level,
  type Solution,
} from '@zyklus/sim-core';
import { t } from '../i18n';
import { connect, disconnect, moveModule, placeModule, removeModule } from '../state/edit';

const CW = 62; // Spaltenbreite
const STRIP = 170; // Breite der Klemmleisten links/rechts
const DUCT_Y = 28;
const DUCT_H = 34;
const MOD_Y = 96;
const MOD_H = 232;
const CH_Y = MOD_Y + 52;
const CH_STEP = 21;
const DEV_Y = MOD_Y + 6;
const DEV_STEP = 44;

type Tool = { kind: 'place'; type: string } | { kind: 'wire'; device: string } | null;

interface Props {
  level: Level;
  solution: Solution;
  analysis: BoardAnalysis;
  onChange: (s: Solution) => void;
  /** Live-Werte während der Simulation */
  values?: Map<string, boolean | number>;
  cpuModes?: Map<string, 'RUN' | 'STOP'>;
}

export function Cabinet({ level, solution, analysis, onChange, values, cpuModes }: Props) {
  const [tool, setTool] = useState<Tool>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const width = level.board.width;
  const boardLeft = STRIP;
  const boardRight = STRIP + width * CW;
  const svgW = boardRight + STRIP;
  const left = level.devices.filter((d) => d.side === 'left');
  const right = level.devices.filter((d) => d.side === 'right');
  const svgH = Math.max(
    MOD_Y + MOD_H + 24,
    DEV_Y + Math.max(left.length, right.length) * DEV_STEP + 20,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTool(null);
        setSelected(null);
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selected &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target as HTMLElement).closest?.('.monaco-editor')
      ) {
        onChange(removeModule(level, solution, selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, level, solution, onChange]);

  const occupied = useMemo(() => {
    const occ: (string | undefined)[] = new Array(width).fill(undefined);
    for (const m of solution.modules) {
      const w = MODULE_TYPES[m.type]?.width ?? 1;
      for (let c = m.x; c < m.x + w && c < width; c++) if (c >= 0) occ[c] = m.id;
    }
    return occ;
  }, [solution.modules, width]);

  const wall = level.board.wall;
  const fits = (type: string, x: number, ignore?: string) => {
    const w = MODULE_TYPES[type]!.width;
    if (x < 0 || x + w > width) return false;
    if (wall !== undefined && x <= wall && wall < x + w) return false;
    for (let c = x; c < x + w; c++) if (occupied[c] && occupied[c] !== ignore) return false;
    return true;
  };

  const devicePos = (d: Device) => {
    const list = d.side === 'left' ? left : right;
    const i = list.indexOf(d);
    const y = DEV_Y + i * DEV_STEP + 16;
    return { x: d.side === 'left' ? STRIP - 14 : boardRight + 14, y };
  };
  const channelPos = (moduleId: string, ch: number) => {
    const m = solution.modules.find((x) => x.id === moduleId)!;
    return { x: boardLeft + m.x * CW + 14, y: CH_Y + ch * CH_STEP };
  };

  const clickSlot = (col: number) => {
    if (tool?.kind === 'place') {
      if (fits(tool.type, col)) onChange(placeModule(level, solution, tool.type, col));
      return;
    }
    if (selected) {
      const m = solution.modules.find((x) => x.id === selected)!;
      if (fits(m.type, col, m.id)) onChange(moveModule(level, solution, m.id, col));
    }
  };

  const clickDevice = (d: Device) => {
    if (tool?.kind === 'wire' && tool.device === d.id) {
      setTool(null);
      return;
    }
    setSelected(null);
    setTool({ kind: 'wire', device: d.id });
  };

  const clickChannel = (moduleId: string, ch: number) => {
    if (tool?.kind !== 'wire') return;
    onChange(connect(level, solution, tool.device, moduleId, ch));
    setTool(null);
  };

  const wireDevice =
    tool?.kind === 'wire' ? level.devices.find((d) => d.id === tool.device) : undefined;
  const hint =
    tool?.kind === 'place'
      ? t('cabinet.hint.place')
      : tool?.kind === 'wire'
        ? `${tr(wireDevice?.name)}: ${t('cabinet.hint.wire')}`
        : t('cabinet.hint.idle');

  const selectedModule = solution.modules.find((m) => m.id === selected);
  const errors = analysis.issues.filter((i) => i.severity === 'error');

  return (
    <div className="cabinet">
      <div className="palette">
        <span className="palette-title">{t('cabinet.palette')}</span>
        {level.allowedModules.map((id) => {
          const mt = MODULE_TYPES[id]!;
          const active = tool?.kind === 'place' && tool.type === id;
          return (
            <button
              key={id}
              className={`palette-item ${active ? 'active' : ''}`}
              title={tr(mt.description)}
              onClick={() => {
                setSelected(null);
                setTool(active ? null : { kind: 'place', type: id });
              }}
            >
              <span className={`chip chip-${mt.kind}`} />
              <span className="palette-name">{tr(mt.name)}</span>
              <span className="palette-meta">
                ¤{mt.price} · {mt.width}
              </span>
            </button>
          );
        })}
      </div>

      <svg
        className="cabinet-svg"
        viewBox={`0 0 ${svgW} ${svgH}`}
        onMouseLeave={() => setHoverCol(null)}
        role="img"
        aria-label={t('cabinet.title')}
      >
        <defs>
          <pattern id="rail" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="var(--rail)" />
            <rect x="0" y="3" width="8" height="2" fill="var(--rail-slot)" />
          </pattern>
        </defs>

        {/* Kabelkanal */}
        {analysis.ductLoad.map((n, c) => {
          const over = n > level.board.ductCapacity;
          return (
            <g key={`duct${c}`}>
              <rect
                x={boardLeft + c * CW + 1}
                y={DUCT_Y}
                width={CW - 2}
                height={DUCT_H}
                className={`duct ${over ? 'duct-over' : ''}`}
              />
              <text x={boardLeft + c * CW + CW / 2} y={DUCT_Y - 8} className="duct-label">
                {n}/{level.board.ductCapacity}
              </text>
            </g>
          );
        })}
        <text x={boardLeft - 8} y={DUCT_Y + DUCT_H / 2 + 4} className="label-right">
          {t('cabinet.duct')}
        </text>

        {/* Hutschiene und Steckplätze */}
        <rect
          x={boardLeft}
          y={MOD_Y + MOD_H / 2 - 14}
          width={width * CW}
          height={28}
          fill="url(#rail)"
        />
        {Array.from({ length: width }, (_, c) => {
          const free = !occupied[c];
          const placeable =
            tool?.kind === 'place'
              ? fits(tool.type, c)
              : selectedModule
                ? fits(selectedModule.type, c, selectedModule.id)
                : false;
          return (
            <rect
              key={`slot${c}`}
              x={boardLeft + c * CW + 1}
              y={MOD_Y}
              width={CW - 2}
              height={MOD_H}
              className={`slot ${free ? 'slot-free' : ''} ${placeable && hoverCol === c ? 'slot-target' : ''} ${placeable ? 'slot-ok' : ''}`}
              onMouseEnter={() => setHoverCol(c)}
              onClick={() => clickSlot(c)}
            />
          );
        })}

        {/* Trennwand: kein Modul, keine Leitung */}
        {wall !== undefined && (
          <g className="wall">
            <rect
              x={boardLeft + wall * CW + 6}
              y={DUCT_Y - 16}
              width={CW - 12}
              height={MOD_Y + MOD_H - DUCT_Y + 16}
              className="wall-body"
            />
            <text
              x={boardLeft + wall * CW + CW / 2}
              y={MOD_Y + MOD_H / 2}
              className="wall-label"
              transform={`rotate(-90 ${boardLeft + wall * CW + CW / 2} ${MOD_Y + MOD_H / 2})`}
            >
              {t('cabinet.wall')}
            </text>
          </g>
        )}

        {/* Buskabel zwischen gekoppelten Koppelmodulen */}
        {analysis.links.map(([a, b]) => {
          const ka = solution.modules.find(
            (m) => MODULE_TYPES[m.type]?.kind === 'cp' && analysis.cpuOf.get(m.id) === a,
          );
          const kb = solution.modules.find(
            (m) => MODULE_TYPES[m.type]?.kind === 'cp' && analysis.cpuOf.get(m.id) === b,
          );
          if (!ka || !kb) return null;
          const xa = boardLeft + ka.x * CW + CW / 2;
          const xb = boardLeft + kb.x * CW + CW / 2;
          const y = MOD_Y + MOD_H + 10;
          return (
            <path
              key={`bus${a}${b}`}
              d={`M${xa},${MOD_Y + MOD_H - 30} V${y} H${xb} V${MOD_Y + MOD_H - 30}`}
              className="bus-link"
            />
          );
        })}

        {/* Baugruppen */}
        {solution.modules.map((m) => {
          const mt = MODULE_TYPES[m.type];
          if (!mt) return null;
          const x = boardLeft + m.x * CW + 3;
          const w = mt.width * CW - 6;
          const isSel = selected === m.id;
          const mode = cpuModes?.get(m.id);
          const kind = channelKind(mt.kind);
          return (
            <g
              key={m.id}
              className={`module module-${mt.kind} ${isSel ? 'module-selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (tool?.kind === 'wire') return;
                setTool(null);
                setSelected(isSel ? null : m.id);
              }}
            >
              <rect
                x={x}
                y={MOD_Y + 4}
                width={w}
                height={MOD_H - 8}
                rx={4}
                className="module-body"
              />
              <rect x={x} y={MOD_Y + 4} width={w} height={8} rx={2} className="module-stripe" />
              <text x={x + w / 2} y={MOD_Y + 30} className="module-name">
                {tr(mt.name)}
              </text>
              <text x={x + w / 2} y={MOD_Y + 44} className="module-id">
                {m.id}
              </text>
              {mt.kind === 'cpu' && (
                <>
                  <text x={x + w / 2} y={MOD_Y + 80} className="module-detail">
                    {mt.cpu!.cycleMs} ms
                  </text>
                  <circle
                    cx={x + 16}
                    cy={MOD_Y + 110}
                    r={5}
                    className={`led ${mode === 'RUN' ? 'led-run' : mode === 'STOP' ? 'led-stop' : ''}`}
                  />
                  <text x={x + 26} y={MOD_Y + 114} className="module-detail-left">
                    RUN
                  </text>
                  <circle
                    cx={x + 16}
                    cy={MOD_Y + 128}
                    r={5}
                    className={`led ${mode === 'STOP' ? 'led-stop' : ''}`}
                  />
                  <text x={x + 26} y={MOD_Y + 132} className="module-detail-left">
                    STOP
                  </text>
                </>
              )}
              {mt.kind === 'cp' && (
                <>
                  <text x={x + w / 2} y={MOD_Y + 80} className="module-detail">
                    ⇄ QW100
                  </text>
                  <text x={x + w / 2} y={MOD_Y + 96} className="module-detail">
                    IW100
                  </text>
                  <circle
                    cx={x + w / 2}
                    cy={MOD_Y + 120}
                    r={5}
                    className={`led ${analysis.links.some((l) => l.includes(analysis.cpuOf.get(m.id) ?? '')) ? 'led-run' : ''}`}
                  />
                </>
              )}
              {mt.alarms && (
                <text x={x + w / 2} y={MOD_Y + MOD_H - 14} className="module-detail">
                  ⚡ Alarm
                </text>
              )}
              {kind &&
                Array.from({ length: mt.channels }, (_, ch) => {
                  const p = channelPos(m.id, ch);
                  const addr = analysis.channelAddress.get(`${m.id}:${ch}`);
                  const wire = solution.wires.find((wi) => wi.module === m.id && wi.channel === ch);
                  const v = wire ? values?.get(wire.device) : undefined;
                  const target = wireDevice && wireDevice.kind === kind;
                  return (
                    <g
                      key={ch}
                      className={`channel ${target ? 'channel-target' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        clickChannel(m.id, ch);
                      }}
                    >
                      <rect
                        x={p.x - 10}
                        y={p.y - 9}
                        width={w - 2}
                        height={18}
                        className="channel-hit"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={5}
                        className={`terminal ${v === true ? 'terminal-on' : ''}`}
                      />
                      <text x={p.x + 10} y={p.y + 4} className="channel-label">
                        {addr?.replace('%', '') ?? ch}
                      </text>
                    </g>
                  );
                })}
            </g>
          );
        })}

        {/* Leitungen */}
        {solution.wires.map((w, i) => {
          const d = level.devices.find((x) => x.id === w.device);
          const m = solution.modules.find((x) => x.id === w.module);
          if (!d || !m || !MODULE_TYPES[m.type]) return null;
          const a = devicePos(d);
          const b = channelPos(m.id, w.channel);
          const dy = DUCT_Y + 6 + (i % 6) * 4;
          const edgeX =
            d.side === 'left' ? boardLeft - 6 - (i % 4) * 3 : boardRight + 6 + (i % 4) * 3;
          const on = values?.get(d.id) === true;
          return (
            <path
              key={`w${i}`}
              d={`M${a.x},${a.y} H${edgeX} V${dy} H${b.x - 8} V${b.y} H${b.x - 5}`}
              className={`wire wire-${d.kind.toLowerCase()} ${on ? 'wire-on' : ''}`}
            />
          );
        })}

        {/* Feldgeräte */}
        {[...left, ...right].map((d) => {
          const p = devicePos(d);
          const isLeft = d.side === 'left';
          const x = isLeft ? 8 : boardRight + 22;
          const wired = solution.wires.some((w) => w.device === d.id);
          const active = tool?.kind === 'wire' && tool.device === d.id;
          const v = values?.get(d.id);
          return (
            <g
              key={d.id}
              className={`device ${active ? 'device-active' : ''}`}
              onClick={() => clickDevice(d)}
            >
              <rect
                x={x}
                y={p.y - 17}
                width={STRIP - 30}
                height={34}
                rx={4}
                className="device-body"
              />
              <circle
                cx={isLeft ? x + 14 : x + STRIP - 44}
                cy={p.y}
                r={6}
                className={`led ${v === true ? 'led-on' : ''}`}
              />
              <text x={isLeft ? x + 26 : x + 8} y={p.y - 2} className="device-id">
                {d.id} · {d.kind}
                {d.nc ? ' · Öffner' : ''}
              </text>
              <text x={isLeft ? x + 26 : x + 8} y={p.y + 11} className="device-name">
                {tr(d.name).replace(/\s*\([^)]*\)$/, '')}
              </text>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                className={`terminal ${wired ? 'terminal-wired' : ''}`}
              />
              {wired && active && (
                <text
                  x={isLeft ? x + STRIP - 40 : x + STRIP - 70}
                  y={p.y - 20}
                  className="device-unwire"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(disconnect(level, solution, d.id));
                    setTool(null);
                  }}
                >
                  ✕ trennen
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="cabinet-info">
        <span className="hint">{hint}</span>
        {selectedModule && (
          <button
            className="btn btn-small btn-danger"
            onClick={() => {
              onChange(removeModule(level, solution, selectedModule.id));
              setSelected(null);
            }}
          >
            {t('cabinet.remove')} {selectedModule.id}
          </button>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="issues">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
