import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MODULE_TYPES,
  channelKind,
  tr,
  wallRange,
  type BoardAnalysis,
  type Device,
  type Level,
  type Solution,
} from '@zyklus/sim-core';
import { t } from '../i18n';
import { connect, disconnect, moveModule, placeModule, removeModule } from '../state/edit';
import { G, colX, layout, terminalPos } from './cabinet/geometry';
import {
  CpuFront,
  Duct,
  HardwareDefs,
  IoFront,
  Plate,
  Rail,
  WallPart,
  type CpuStatus,
} from './cabinet/Hardware';

export type { CpuStatus } from './cabinet/Hardware';

type Tool = { kind: 'place'; type: string } | { kind: 'wire'; device: string } | null;

interface Props {
  level: Level;
  solution: Solution;
  analysis: BoardAnalysis;
  onChange: (s: Solution) => void;
  /** Live-Werte der Feldgeräte während der Simulation */
  values?: Map<string, boolean | number>;
  /** Zustand je CPU während der Simulation */
  cpuStatus?: Map<string, CpuStatus>;
  /** Peripheriewert einer Adresse (Kanal-LEDs, Analogbalken) */
  readIo?: (cpu: string, address: string) => boolean | number | undefined;
  /** Betriebsartenschalter bedienbar (Sandkasten) */
  canSwitch?: boolean;
  onCpuSwitch?: (cpu: string, mode: 'RUN' | 'STOP') => void;
}

interface View {
  z: number;
  x: number;
  y: number;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 12;

export function Cabinet({
  level,
  solution,
  analysis,
  onChange,
  values,
  cpuStatus,
  readIo,
  canSwitch = false,
  onCpuSwitch,
}: Props) {
  const [tool, setTool] = useState<Tool>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const width = level.board.width;
  const l = useMemo(() => layout(level), [level]);
  const left = level.devices.filter((d) => d.side === 'left');
  const right = level.devices.filter((d) => d.side === 'right');
  const wr = wallRange(level.board);

  // ---------- Zoom und Verschieben ----------
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const autoFit = useRef(true);

  const fit = useCallback(() => {
    const z = Math.max(ZOOM_MIN, Math.min((size.w - 16) / l.width, (size.h - 16) / l.height));
    setView({ z, x: (size.w - l.width * z) / 2, y: (size.h - l.height * z) / 2 });
    autoFit.current = true;
  }, [size, l]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({ w: Math.max(200, r.width), h: Math.max(160, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (autoFit.current) fit();
  }, [fit]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * Math.exp(-e.deltaY * 0.0015)));
        // Punkt unter dem Mauszeiger bleibt stehen
        return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z };
      });
      autoFit.current = false;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const background = (e.target as Element).closest('.hw-pan') !== null;
    if (e.button === 1 || (e.button === 0 && background && !tool)) {
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    autoFit.current = false;
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    // kleiner Weg = Klick auf den Hintergrund: Auswahl aufheben
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) setSelected(null);
  };

  // ---------- Tastatur ----------
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

  // ---------- Einrasten frisch gesteckter Baugruppen ----------
  const known = useRef(new Set(solution.modules.map((m) => m.id)));
  const [snapping, setSnapping] = useState<string[]>([]);
  useEffect(() => {
    const fresh = solution.modules.filter((m) => !known.current.has(m.id)).map((m) => m.id);
    known.current = new Set(solution.modules.map((m) => m.id));
    if (!fresh.length) return;
    setSnapping(fresh);
    const timer = setTimeout(() => setSnapping([]), 320);
    return () => clearTimeout(timer);
  }, [solution.modules]);

  // ---------- Belegung ----------
  const occupied = useMemo(() => {
    const occ: (string | undefined)[] = new Array(width).fill(undefined);
    for (const m of solution.modules) {
      const w = MODULE_TYPES[m.type]?.width ?? 1;
      for (let c = m.x; c < m.x + w && c < width; c++) if (c >= 0) occ[c] = m.id;
    }
    return occ;
  }, [solution.modules, width]);

  const fits = (type: string, x: number, ignore?: string) => {
    const w = MODULE_TYPES[type]!.width;
    if (x < 0 || x + w > width) return false;
    if (wr && x < wr[1] && wr[0] < x + w) return false;
    for (let c = x; c < x + w; c++) if (occupied[c] && occupied[c] !== ignore) return false;
    return true;
  };

  const devicePos = (d: Device) => {
    const list = d.side === 'left' ? left : right;
    const i = list.indexOf(d);
    const y = G.device.y + i * G.device.step + G.device.h / 2;
    return { x: d.side === 'left' ? G.side - 6 : l.plateX + l.plateW + 6, y };
  };
  const channelPos = (moduleId: string, ch: number) => {
    const m = solution.modules.find((x) => x.id === moduleId)!;
    const mt = MODULE_TYPES[m.type]!;
    return terminalPos(l, m, mt.width, mt.channels, ch);
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
    if (tool?.kind !== 'wire') {
      setSelected(moduleId);
      return;
    }
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
  const ghostType = tool?.kind === 'place' ? tool.type : selectedModule?.type;
  const ghostOk =
    ghostType !== undefined &&
    hoverCol !== null &&
    fits(ghostType, hoverCol, selected ?? undefined);

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
              aria-pressed={active}
              onClick={() => {
                setSelected(null);
                setTool(active ? null : { kind: 'place', type: id });
              }}
            >
              <span className={`chip chip-${mt.kind}`} />
              <span className="palette-name">{tr(mt.name)}</span>
              <span className="palette-meta">
                ¤{mt.price} · {mt.width * G.te} mm
              </span>
            </button>
          );
        })}
      </div>

      <div className="cabinet-view" ref={box}>
        <svg
          className={`cabinet-svg ${tool?.kind === 'wire' ? 'cabinet-wiring' : ''}`}
          width={size.w}
          height={size.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onMouseLeave={() => setHoverCol(null)}
          role="img"
          aria-label={t('cabinet.title')}
        >
          <HardwareDefs />
          <rect className="hw-pan" width={size.w} height={size.h} fill="transparent" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
            <g className="hw-pan">
              <Plate l={l} />
            </g>
            <Duct l={l} y={G.ductTop.y} h={G.ductTop.h} layer="base" label="" />
            <Duct l={l} y={G.ductBottom.y} h={G.ductBottom.h} layer="base" label="" />
            <Rail l={l} />
            {wr && <WallPart l={l} from={wr[0]} to={wr[1]} />}

            {/* Steckplätze */}
            {Array.from({ length: width }, (_, c) => (
              <rect
                key={`slot${c}`}
                x={colX(l, c)}
                y={G.module.y}
                width={G.te}
                height={G.module.h}
                className={`slot ${ghostType ? 'slot-active' : ''}`}
                onMouseEnter={() => setHoverCol(c)}
                onClick={() => clickSlot(c)}
              />
            ))}
            {ghostType && hoverCol !== null && (
              <rect
                x={colX(l, hoverCol) + G.gap / 2}
                y={G.module.y}
                width={MODULE_TYPES[ghostType]!.width * G.te - G.gap}
                height={G.module.h}
                rx={2}
                className={`hw-ghost ${ghostOk ? '' : 'hw-ghost-bad'}`}
              />
            )}

            {/* Buskabel zwischen gekoppelten Koppelmodulen (oberer Kanal) */}
            {analysis.links.map(([a, b]) => {
              const k = (cpu: string) =>
                solution.modules.find(
                  (m) => MODULE_TYPES[m.type]?.kind === 'cp' && analysis.cpuOf.get(m.id) === cpu,
                );
              const ka = k(a);
              const kb = k(b);
              if (!ka || !kb) return null;
              const xa = colX(l, ka.x) + G.te;
              const xb = colX(l, kb.x) + G.te;
              const yTop = G.module.y + 34;
              const yd = G.ductTop.y + G.ductTop.h / 2;
              return (
                <path
                  key={`bus${a}${b}`}
                  d={`M${xa},${yTop} V${yd} H${xb} V${yTop}`}
                  className="bus-link"
                />
              );
            })}

            {/* Leitungen: vom Gerät zum Plattenrand, durch den unteren Kanal, von unten in die Baugruppe
                (hinter der Front, damit sie nicht über fremde Klemmen laufen; Führung folgt in D3) */}
            {solution.wires.map((w, i) => {
              const d = level.devices.find((x) => x.id === w.device);
              const m = solution.modules.find((x) => x.id === w.module);
              if (!d || !m || !MODULE_TYPES[m.type]) return null;
              const a = devicePos(d);
              const b = channelPos(m.id, w.channel);
              const lane = G.ductBottom.y + 6 + (i % 9) * 1.8;
              const edge =
                d.side === 'left' ? l.plateX + 3 + (i % 4) : l.plateX + l.plateW - 3 - (i % 4);
              const on = values?.get(d.id) === true;
              const analog = d.kind === 'AI' || d.kind === 'AO';
              return (
                <path
                  key={`w${w.device}`}
                  d={`M${a.x},${a.y} H${edge} V${lane} H${b.x} V${b.y}`}
                  className={`wire ${analog ? 'wire-analog' : 'wire-dc'} ${on ? 'wire-on' : ''} ${hoverWire === d.id ? 'wire-hover' : ''}`}
                />
              );
            })}

            {/* Baugruppen */}
            {solution.modules.map((m) => {
              const mt = MODULE_TYPES[m.type];
              if (!mt) return null;
              const isSel = selected === m.id;
              const cpu = analysis.cpuOf.get(m.id);
              const kind = channelKind(mt.kind);
              const addresses = Array.from({ length: mt.channels }, (_, ch) =>
                analysis.channelAddress.get(`${m.id}:${ch}`),
              );
              const tags = cpu ? solution.projects[cpu]?.tags : undefined;
              const symbols = addresses.map((a) => tags?.find((tg) => tg.address === a)?.name);
              const states = addresses.map((a) => (cpu && a ? readIo?.(cpu, a) : undefined));
              const wired = addresses.map((_, ch) =>
                solution.wires.some((w) => w.module === m.id && w.channel === ch),
              );
              const target = !!wireDevice && wireDevice.kind === kind;
              return (
                <g
                  key={m.id}
                  className={`module module-${mt.kind} ${isSel ? 'module-selected' : ''} ${snapping.includes(m.id) ? 'hw-snap' : ''}`}
                  filter="url(#hw-shadow)"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool?.kind === 'wire') return;
                    setTool(null);
                    setSelected(isSel ? null : m.id);
                  }}
                >
                  {mt.kind === 'cpu' ? (
                    <CpuFront
                      l={l}
                      x={m.x}
                      t={mt}
                      id={m.id}
                      status={cpuStatus?.get(m.id)}
                      powered={!!cpuStatus}
                      canSwitch={canSwitch && !!cpuStatus}
                      onSwitch={(mode) => onCpuSwitch?.(m.id, mode)}
                    />
                  ) : (
                    <IoFront
                      l={l}
                      x={m.x}
                      t={mt}
                      id={m.id}
                      addresses={addresses}
                      symbols={symbols}
                      states={states}
                      wired={wired}
                      target={target}
                      onChannel={(ch) => clickChannel(m.id, ch)}
                    />
                  )}
                  {isSel && (
                    <rect
                      x={colX(l, m.x) - 0.4}
                      y={G.module.y - 0.8}
                      width={mt.width * G.te + 0.2}
                      height={G.module.h + 1.6}
                      rx={2.6}
                      className="hw-selection"
                    />
                  )}
                </g>
              );
            })}

            {/* Kanaldeckel über den Leitungen */}
            <Duct
              l={l}
              y={G.ductTop.y}
              h={G.ductTop.h}
              layer="cover"
              label={t('cabinet.ductTop')}
            />
            <Duct
              l={l}
              y={G.ductBottom.y}
              h={G.ductBottom.h}
              layer="cover"
              load={analysis.ductLoad}
              capacity={level.board.ductCapacity}
              label={t('cabinet.duct')}
            />

            {/* Feldgeräte */}
            {[...left, ...right].map((d) => {
              const p = devicePos(d);
              const isLeft = d.side === 'left';
              const x = isLeft ? 4 : l.plateX + l.plateW + 8;
              const wired = solution.wires.some((w) => w.device === d.id);
              const active = tool?.kind === 'wire' && tool.device === d.id;
              const v = values?.get(d.id);
              return (
                <g
                  key={d.id}
                  className={`device ${active ? 'device-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    clickDevice(d);
                  }}
                  onMouseEnter={() => setHoverWire(d.id)}
                  onMouseLeave={() => setHoverWire(null)}
                >
                  <title>{tr(d.name)}</title>
                  <rect
                    x={x}
                    y={p.y - G.device.h / 2}
                    width={G.device.w}
                    height={G.device.h}
                    rx={1.6}
                    className="device-body"
                  />
                  <circle
                    cx={isLeft ? x + 5 : x + G.device.w - 5}
                    cy={p.y}
                    r={1.8}
                    className={`led ${v === true ? 'led-on' : ''}`}
                  />
                  <text x={isLeft ? x + 9 : x + 3} y={p.y - 1.4} className="device-id">
                    {d.id} · {d.kind}
                    {d.nc ? ' · Öffner' : ''}
                  </text>
                  <text x={isLeft ? x + 9 : x + 3} y={p.y + 4} className="device-name">
                    {tr(d.name).replace(/\s*\([^)]*\)$/, '')}
                  </text>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={1.6}
                    className={`terminal ${wired ? 'terminal-wired' : ''}`}
                  />
                  {wired && active && (
                    <text
                      x={isLeft ? x + G.device.w - 2 : x + 2}
                      y={p.y - G.device.h / 2 - 1.5}
                      className={`device-unwire ${isLeft ? 'end' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(disconnect(level, solution, d.id));
                        setTool(null);
                      }}
                    >
                      ✕ {t('cabinet.unwire')}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="cabinet-zoom">
          <button
            className="btn btn-small"
            onClick={() =>
              setView((v) => {
                autoFit.current = false;
                const z = Math.min(ZOOM_MAX, v.z * 1.25);
                return {
                  z,
                  x: size.w / 2 - ((size.w / 2 - v.x) * z) / v.z,
                  y: size.h / 2 - ((size.h / 2 - v.y) * z) / v.z,
                };
              })
            }
            aria-label={t('cabinet.zoomIn')}
          >
            +
          </button>
          <button
            className="btn btn-small"
            onClick={() =>
              setView((v) => {
                autoFit.current = false;
                const z = Math.max(ZOOM_MIN, v.z / 1.25);
                return {
                  z,
                  x: size.w / 2 - ((size.w / 2 - v.x) * z) / v.z,
                  y: size.h / 2 - ((size.h / 2 - v.y) * z) / v.z,
                };
              })
            }
            aria-label={t('cabinet.zoomOut')}
          >
            −
          </button>
          <button className="btn btn-small" onClick={fit}>
            {t('cabinet.fit')}
          </button>
        </div>
      </div>

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
