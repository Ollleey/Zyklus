import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { fupValues, liveText, type LiveValue } from './liveFlow';
import type { Block, CodeBlock, PlcProject } from '@zyklus/sim-core';
import { LIBRARY, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import { t, tx } from '../i18n';
import { boxDescription } from '../i18n/boxes-en';
import {
  BOX_SPECS,
  CATEGORIES,
  boxSpec,
  callType,
  isCallType,
  setCallSignatures,
  inputPins,
  isFupBody,
  outputPins,
  type FupBody,
  type FupBox,
  type FupNetwork,
  type PinRef,
  type PinSpec,
} from '@zyklus/fup-model';

// Geometrie (px)
const HEAD = 24;
const PITCH = 24;
const STUB = 14;
const OPW = 124;
const SNAP = 10;

function boxWidth(type: string): number {
  const k = boxSpec(type).kind;
  return k === 'logic' || k === 'assign'
    ? 64
    : k === 'compare' && type.startsWith('CMP')
      ? 84
      : 112;
}

function boxHeight(b: FupBox): number {
  const rows = Math.max(inputPins(b.type, b.count).length, outputPins(b.type).length, 1);
  return HEAD + rows * PITCH + 6;
}

function pinPos(b: FupBox, pin: string, side: 'in' | 'out'): { x: number; y: number } {
  const pins = side === 'in' ? inputPins(b.type, b.count) : outputPins(b.type);
  const i = Math.max(
    0,
    pins.findIndex((p) => p.name === pin),
  );
  const y = b.y + HEAD + i * PITCH + PITCH / 2;
  return side === 'in' ? { x: b.x - STUB, y } : { x: b.x + boxWidth(b.type) + STUB, y };
}

const CATEGORY_EN: Record<string, string> = {
  Bitverknüpfungen: 'Bit logic',
  Zeiten: 'Timers',
  Zähler: 'Counters',
  Vergleicher: 'Comparators',
  Mathematik: 'Math',
  Übertragen: 'Move',
  Kommunikation: 'Communication',
};

/** Name einer Palettenkategorie in der Anzeigesprache */
export function categoryLabel(cat: string): string {
  return tx(cat, CATEGORY_EN[cat] ?? cat);
}

/** Bibliotheksbausteine (Technologie), soweit das Projekt keinen gleichnamigen Baustein hat */
export function libraryFor(project: PlcProject): CodeBlock[] {
  const own = new Set(project.blocks.map((b) => b.name.toLowerCase()));
  return LIBRARY.filter((b) => !own.has(b.name.toLowerCase()));
}

/** Name eines neuen Instanz-DBs wie in TIA („IEC_Timer_0_DB“, „R_TRIG_DB“). */
export function newInstanceName(blocks: Block[], type: string): string {
  const spec = boxSpec(type);
  const base =
    spec.instanceType === 'IEC_TIMER'
      ? 'IEC_Timer'
      : spec.instanceType === 'IEC_COUNTER'
        ? 'IEC_Counter'
        : isCallType(type)
          ? spec.label
          : type;
  const taken = new Set(blocks.map((b) => b.name.toLowerCase()));
  if (
    spec.instanceType !== 'IEC_TIMER' &&
    spec.instanceType !== 'IEC_COUNTER' &&
    !taken.has(`${base}_db`.toLowerCase())
  ) {
    return `${base}_DB`;
  }
  for (let n = 0; ; n++) if (!taken.has(`${base}_${n}_DB`.toLowerCase())) return `${base}_${n}_DB`;
}

export function nextDbNumber(blocks: Block[]): number {
  const used = new Set(
    blocks.filter((b) => b.kind === 'DB' || b.kind === 'IDB').map((b) => b.number),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

interface Props {
  project: PlcProject;
  block: CodeBlock;
  diagnostics: ProjectDiagnostic[];
  onChange: (p: PlcProject) => void;
  focus?: { network?: number; box?: string; nonce: number };
  /** Beobachten: Wert eines Operanden (während der Simulation) */
  live?: (operand: string) => boolean | number | string | undefined;
}

/** Auswahl: mehrere Boxen eines Netzwerks oder eine Verbindung */
type Selection = { network: number; boxes?: string[]; wire?: number } | null;

/** Box aus der Liste ins Netzwerk ziehen (Zeiger-Ereignisse – HTML5-Ziehen fängt die Desktop-App ab) */
type PaletteDrag = { type: string; label: string; x: number; y: number; started: boolean };

export function FupEditor({ project, block, diagnostics, onChange, focus, live }: Props) {
  const body: FupBody = isFupBody(block.fup) ? block.fup : { networks: [] };
  // eigene FB/FC als Boxen (ohne den Baustein selbst – keine Rekursion)
  setCallSignatures(project);
  const ownBlocks = project.blocks.filter(
    (b): b is CodeBlock => (b.kind === 'FB' || b.kind === 'FC') && b.name !== block.name,
  );
  const CALL_GROUPS: [string, string, CodeBlock[]][] = [
    ['Technologie', tx('Technologie', 'Technology'), libraryFor(project)],
    ['Bausteine', tx('Eigene Bausteine', 'Own blocks'), ownBlocks],
  ];
  const [selection, setSelection] = useState<Selection>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(['Bitverknüpfungen', 'Zeiten']));
  const netRefs = useRef<(HTMLDivElement | null)[]>([]);

  const setBody = (next: FupBody, extraBlocks: Block[] = []) =>
    onChange({
      ...project,
      blocks: [
        ...project.blocks.map((b) => (b === block ? { ...block, fup: next } : b)),
        ...extraBlocks,
      ],
    });
  const setNetwork = (i: number, nw: FupNetwork, extra: Block[] = []) =>
    setBody({ networks: body.networks.map((x, k) => (k === i ? nw : x)) }, extra);

  useEffect(() => {
    if (!focus || focus.network === undefined) return;
    setSelection({ network: focus.network, boxes: focus.box ? [focus.box] : [] });
    netRefs.current[focus.network]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  // Entf löscht die markierten Boxen bzw. die Verbindung; Strg+A markiert alle Boxen des
  // Netzwerks; Pfeiltasten verschieben die markierten Boxen (mit Umschalt in größeren Schritten)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selection) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.closest('.monaco-editor')
      )
        return;
      const nw = body.networks[selection.network];
      if (!nw) return;
      const ids = new Set(selection.boxes ?? []);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.size) {
          setNetwork(selection.network, {
            ...nw,
            boxes: nw.boxes.filter((b) => !ids.has(b.id)),
            wires: nw.wires.filter((w) => !ids.has(w.from.box) && !ids.has(w.to.box)),
          });
        } else if (selection.wire !== undefined) {
          setNetwork(selection.network, {
            ...nw,
            wires: nw.wires.filter((_, k) => k !== selection.wire),
          });
        }
        setSelection(null);
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        setSelection({ network: selection.network, boxes: nw.boxes.map((b) => b.id) });
        e.preventDefault();
      } else if (ids.size && e.key.startsWith('Arrow')) {
        const step = SNAP * (e.shiftKey ? 4 : 1);
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setNetwork(selection.network, {
          ...nw,
          boxes: nw.boxes.map((b) =>
            ids.has(b.id)
              ? { ...b, x: Math.max(STUB + OPW + 10, b.x + dx), y: Math.max(28, b.y + dy) }
              : b,
          ),
        });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Ziehen aus der Liste: Vorschau folgt dem Zeiger, Loslassen über einem Netzwerk fügt ein
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const dragRef = useRef<PaletteDrag | null>(null);
  const suppressClick = useRef(false);
  const addBoxRef = useRef<(i: number, type: string, x: number, y: number) => void>(() => {});
  useEffect(() => {
    if (!paletteDrag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
      dragRef.current = started ? { ...d, x: e.clientX, y: e.clientY, started } : d;
      setPaletteDrag(dragRef.current);
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPaletteDrag(null);
      if (!d?.started) return;
      suppressClick.current = true;
      const svg = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<SVGSVGElement>('svg.fup-canvas');
      const idx = Number(svg?.dataset.network);
      if (!svg || !Number.isInteger(idx)) return;
      const r = svg.getBoundingClientRect();
      addBoxRef.current(
        idx,
        d.type,
        e.clientX - r.left - boxWidth(d.type) / 2,
        e.clientY - r.top - 10,
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [paletteDrag !== null]);
  const startPaletteDrag = (e: React.PointerEvent, type: string, label: string) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    dragRef.current = { type, label, x: e.clientX, y: e.clientY, started: false };
    setPaletteDrag(dragRef.current);
  };

  const addBox = (networkIdx: number, type: string, x: number, y: number) => {
    const nw = body.networks[networkIdx]!;
    const stem = type.toLowerCase().replace(/[^a-z0-9_]/g, '');
    let n = 1;
    while (nw.boxes.some((b) => b.id === `${stem}${n}`)) n++;
    const spec = boxSpec(type);
    const box: FupBox = {
      id: `${stem}${n}`,
      type,
      x: Math.max(STUB + OPW + 10, Math.round(x / SNAP) * SNAP),
      y: Math.max(28, Math.round(y / SNAP) * SNAP),
      inputs: {},
      outputs: {},
      negated: [],
    };
    const extra: Block[] = [];
    if (spec.instanceType) {
      const name = newInstanceName(project.blocks, type);
      extra.push({
        kind: 'IDB',
        name,
        number: nextDbNumber(project.blocks),
        of: spec.instanceType,
      });
      box.operand = `"${name}"`;
    }
    setNetwork(networkIdx, { ...nw, boxes: [...nw.boxes, box] }, extra);
    setSelection({ network: networkIdx, boxes: [box.id] });
  };
  addBoxRef.current = addBox;

  const byBox = useMemo(() => {
    const m = new Map<string, ProjectDiagnostic[]>();
    for (const d of diagnostics) {
      if (d.location.network === undefined || !d.location.box) continue;
      const k = `${d.location.network}:${d.location.box}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [diagnostics]);

  const lastNetwork = Math.max(0, body.networks.length - 1);

  return (
    <div className="fup">
      <aside className="fup-palette">
        <div className="fup-palette-title">Anweisungen</div>
        {CATEGORIES.map((cat) => {
          const open = openCats.has(cat);
          return (
            <div key={cat}>
              <button
                className="fup-cat"
                onClick={() => {
                  const next = new Set(openCats);
                  if (open) next.delete(cat);
                  else next.add(cat);
                  setOpenCats(next);
                }}
              >
                {open ? '▾' : '▸'} {categoryLabel(cat)}
              </button>
              {open &&
                Object.values(BOX_SPECS)
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <div
                      key={s.type}
                      className="fup-item"
                      title={`${boxDescription(s.type, s.description)}\n${tx('Ziehen ins Netzwerk oder klicken zum Einfügen', 'Drag into a network or click to insert')}`}
                      onPointerDown={(e) => startPaletteDrag(e, s.type, s.label)}
                      onClick={() => {
                        if (suppressClick.current) return void (suppressClick.current = false);
                        const target = selection?.network ?? lastNetwork;
                        const nw = body.networks[target];
                        if (!nw) return;
                        const y =
                          nw.boxes.reduce((m, b) => Math.max(m, b.y + boxHeight(b)), 0) + 40;
                        addBox(target, s.type, STUB + OPW + 20, y);
                      }}
                    >
                      <span className="fup-item-label">{s.label}</span>
                      <span className="fup-item-type">{s.type.startsWith('CMP') ? 'CMP' : ''}</span>
                    </div>
                  ))}
            </div>
          );
        })}
        {CALL_GROUPS.map(
          ([cat, label, list]) =>
            list.length > 0 && (
              <div key={cat}>
                <button
                  className="fup-cat"
                  onClick={() => {
                    const next = new Set(openCats);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    setOpenCats(next);
                  }}
                >
                  {openCats.has(cat) ? '▾' : '▸'} {label}
                </button>
                {openCats.has(cat) &&
                  list.map((b) => (
                    <div
                      key={b.name}
                      className="fup-item"
                      title={`${b.kind} „${b.name}“${b.kind === 'FB' ? tx(' – legt einen Instanz-DB an', ' – creates an instance DB') : ''}\n${tx('Ziehen ins Netzwerk oder klicken zum Einfügen', 'Drag into a network or click to insert')}`}
                      onPointerDown={(e) => startPaletteDrag(e, callType(b.name), b.name)}
                      onClick={() => {
                        if (suppressClick.current) return void (suppressClick.current = false);
                        const target = selection?.network ?? lastNetwork;
                        const nw = body.networks[target];
                        if (!nw) return;
                        const y =
                          nw.boxes.reduce((m, x) => Math.max(m, x.y + boxHeight(x)), 0) + 40;
                        addBox(target, callType(b.name), STUB + OPW + 20, y);
                      }}
                    >
                      <span className="fup-item-label">{b.name}</span>
                      <span className="fup-item-type">{b.kind}</span>
                    </div>
                  ))}
              </div>
            ),
        )}
      </aside>

      <div className="fup-networks">
        {body.networks.map((nw, i) => (
          <div key={nw.id} ref={(el) => void (netRefs.current[i] = el)} className="fup-network">
            <header className="fup-nw-head">
              <span className="fup-nw-no">Netzwerk {i + 1}:</span>
              <input
                className="fup-nw-title"
                placeholder={tx('Titel', 'Title')}
                value={nw.title}
                onChange={(e) => setNetwork(i, { ...nw, title: e.target.value })}
              />
              <button
                className="icon-btn"
                title="Nach oben"
                disabled={i === 0}
                onClick={() => {
                  const n = [...body.networks];
                  [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                  setBody({ networks: n });
                }}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                title="Nach unten"
                disabled={i === body.networks.length - 1}
                onClick={() => {
                  const n = [...body.networks];
                  [n[i + 1], n[i]] = [n[i]!, n[i + 1]!];
                  setBody({ networks: n });
                }}
              >
                ↓
              </button>
              <button
                className="icon-btn"
                title={tx('Netzwerk löschen', 'Delete network')}
                onClick={() => setBody({ networks: body.networks.filter((_, k) => k !== i) })}
              >
                ✕
              </button>
            </header>
            <NetworkCanvas
              network={nw}
              index={i}
              selection={selection?.network === i ? selection : null}
              errors={byBox}
              onSelect={setSelection}
              onChange={(next) => setNetwork(i, next)}
              live={live}
            />
          </div>
        ))}
        <button
          className="btn btn-small fup-add-nw"
          onClick={() => {
            let n = body.networks.length + 1;
            while (body.networks.some((x) => x.id === `nw${n}`)) n++;
            setBody({
              networks: [...body.networks, { id: `nw${n}`, title: '', boxes: [], wires: [] }],
            });
          }}
        >
          + Netzwerk
        </button>
      </div>
      {paletteDrag?.started && (
        <div
          className="fup-drag-ghost"
          style={{ left: paletteDrag.x + 8, top: paletteDrag.y + 8 }}
          aria-hidden
        >
          {paletteDrag.label}
        </div>
      )}
    </div>
  );
}

interface CanvasProps {
  network: FupNetwork;
  index: number;
  selection: Selection;
  errors: Map<string, ProjectDiagnostic[]>;
  onSelect: (s: Selection) => void;
  onChange: (nw: FupNetwork) => void;
  live?: Props['live'];
}

/** Wert am Pin: Text und Klasse (Bool grün/blau wie der Signalfluss in TIA) */
function liveOf(live: Props['live'], operand: string | undefined) {
  if (!live || !operand?.trim()) return undefined;
  const v = live(operand.trim());
  if (v === undefined) return undefined;
  if (typeof v === 'boolean')
    return { text: v ? '1' : '0', cls: v ? 'fup-live-on' : 'fup-live-off' };
  const text = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : `'${v}'`;
  return { text, cls: 'fup-live-num' };
}

type Drag =
  /** markierte Boxen gemeinsam verschieben: Versatz seit dem Anfassen */
  | { kind: 'box'; ids: string[]; sx: number; sy: number; ddx: number; ddy: number; moved: boolean }
  | { kind: 'wire'; from: PinRef; x: number; y: number }
  /** Auswahlrahmen auf freier Fläche; `add` = zur Auswahl hinzufügen (Umschalt/Strg) */
  | { kind: 'band'; x0: number; y0: number; x1: number; y1: number; add: boolean };

function NetworkCanvas({
  network,
  index,
  selection,
  errors,
  onSelect,
  onChange,
  live,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverIn, setHoverIn] = useState<PinRef | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const selected = new Set(selection?.boxes ?? []);
  const clampX = (x: number) => Math.max(STUB + OPW + 10, Math.round(x / SNAP) * SNAP);
  const clampY = (y: number) => Math.max(28, Math.round(y / SNAP) * SNAP);
  // markierte Boxen während des Ziehens an der neuen Stelle zeigen
  const boxes = network.boxes.map((b) =>
    drag?.kind === 'box' && drag.ids.includes(b.id)
      ? { ...b, x: clampX(b.x + drag.ddx), y: clampY(b.y + drag.ddy) }
      : b,
  );
  const find = (id: string) => boxes.find((b) => b.id === id);

  const width = Math.max(760, ...boxes.map((b) => b.x + boxWidth(b.type) + STUB + OPW + 30));
  const height = Math.max(120, ...boxes.map((b) => b.y + boxHeight(b) + 30));

  const updateBox = (id: string, f: (b: FupBox) => FupBox) =>
    onChange({ ...network, boxes: network.boxes.map((b) => (b.id === id ? f(b) : b)) });

  const wiredInputs = new Set(network.wires.map((w) => `${w.to.box}.${w.to.pin}`));
  // Beobachten: Werte aller Box-Ausgänge (auch verbundener) für Leitungen und Pins
  const outVals = live ? fupValues(network, live) : undefined;
  const liveCls = (v: LiveValue) => {
    const lt = liveText(v);
    return lt ? { text: lt.text, cls: `fup-live-${lt.cls}` } : undefined;
  };
  const wiredOutputs = new Set(network.wires.map((w) => `${w.from.box}.${w.from.pin}`));

  /** Nächster Bool-Eingang zum Zeiger (Fangradius 14 px) */
  const nearestInput = (p: { x: number; y: number }): PinRef | null => {
    let best: PinRef | null = null;
    let dist = 14;
    for (const b of network.boxes) {
      for (const pin of inputPins(b.type, b.count)) {
        if (pin.kind !== 'bool') continue;
        const q = pinPos(b, pin.name, 'in');
        const d = Math.hypot(p.x - (q.x + STUB / 2), p.y - q.y);
        if (d < dist) {
          dist = d;
          best = { box: b.id, pin: pin.name };
        }
      }
    }
    return best;
  };

  const onMove = (e: RPointerEvent) => {
    if (!drag) return;
    const p = local(e);
    if (drag.kind === 'box') {
      const ddx = p.x - drag.sx;
      const ddy = p.y - drag.sy;
      setDrag({ ...drag, ddx, ddy, moved: drag.moved || Math.hypot(ddx, ddy) > 3 });
    } else if (drag.kind === 'band') {
      setDrag({ ...drag, x1: p.x, y1: p.y });
    } else {
      setDrag({ ...drag, x: p.x, y: p.y });
      setHoverIn(nearestInput(p));
    }
  };

  const onUp = (e: RPointerEvent) => {
    if (drag?.kind === 'box' && drag.moved) {
      onChange({
        ...network,
        boxes: network.boxes.map((b) =>
          drag.ids.includes(b.id)
            ? { ...b, x: clampX(b.x + drag.ddx), y: clampY(b.y + drag.ddy) }
            : b,
        ),
      });
    }
    if (drag?.kind === 'band') {
      const r = {
        x0: Math.min(drag.x0, drag.x1),
        x1: Math.max(drag.x0, drag.x1),
        y0: Math.min(drag.y0, drag.y1),
        y1: Math.max(drag.y0, drag.y1),
      };
      const hit = network.boxes
        .filter(
          (b) =>
            b.x < r.x1 && b.x + boxWidth(b.type) > r.x0 && b.y < r.y1 && b.y + boxHeight(b) > r.y0,
        )
        .map((b) => b.id);
      const tiny = r.x1 - r.x0 < 4 && r.y1 - r.y0 < 4;
      const base = drag.add ? [...selected] : [];
      const ids = tiny ? base : [...new Set([...base, ...hit])];
      onSelect(ids.length ? { network: index, boxes: ids } : null);
    }
    const hoverIn = drag?.kind === 'wire' ? nearestInput(local(e)) : null;
    if (drag?.kind === 'wire' && hoverIn && hoverIn.box !== drag.from.box) {
      // Eingang hat höchstens eine Quelle: alte Verbindung ersetzen, Operand am Eingang entfällt
      const wires = network.wires.filter(
        (w) => !(w.to.box === hoverIn.box && w.to.pin === hoverIn.pin),
      );
      const target = network.boxes.find((b) => b.id === hoverIn.box)!;
      const { [hoverIn.pin]: _drop, ...inputs } = target.inputs;
      onChange({
        ...network,
        boxes: network.boxes.map((b) => (b.id === target.id ? { ...b, inputs } : b)),
        wires: [...wires, { from: drag.from, to: hoverIn }],
      });
    }
    setDrag(null);
  };

  const wirePath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (b.x - a.x >= 24) {
      const mx = a.x + (b.x - a.x) / 2;
      return `M${a.x},${a.y} H${mx} V${b.y} H${b.x}`;
    }
    // Ziel liegt links vom Ausgang: im Zwischenraum zwischen den Boxen herumführen
    const my = (a.y + b.y) / 2;
    return `M${a.x},${a.y} H${a.x + 10} V${my} H${b.x - 10} V${b.y} H${b.x}`;
  };

  return (
    <div className="fup-canvas-wrap">
      <svg
        ref={svgRef}
        className="fup-canvas"
        width={width}
        height={height}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          if (drag?.kind === 'wire') setDrag(null);
          setHoverIn(null);
        }}
        data-network={index}
        onPointerDown={(e) => {
          if (e.target !== svgRef.current || e.button !== 0) return;
          svgRef.current.setPointerCapture?.(e.pointerId);
          const p = local(e);
          setDrag({
            kind: 'band',
            x0: p.x,
            y0: p.y,
            x1: p.x,
            y1: p.y,
            add: e.shiftKey || e.ctrlKey || e.metaKey,
          });
        }}
      >
        <defs>
          <pattern id={`grid${index}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" className="fup-grid-dot" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill={`url(#grid${index})`} pointerEvents="none" />
        {/* linke Stromschiene wie in TIA nur als Orientierung */}
        <line x1={4} y1={0} x2={4} y2={height} className="fup-rail" />

        {network.wires.map((w, k) => {
          const a = find(w.from.box);
          const b = find(w.to.box);
          if (!a || !b) return null;
          const d = wirePath(pinPos(a, w.from.pin, 'out'), pinPos(b, w.to.pin, 'in'));
          const sel = selection?.wire === k;
          return (
            <g
              key={k}
              onPointerDown={(e) => (e.stopPropagation(), onSelect({ network: index, wire: k }))}
            >
              <path d={d} className="fup-wire-hit" />
              <path
                d={d}
                className={`fup-wire ${sel ? 'fup-wire-sel' : ''} ${(() => {
                  const v = outVals?.get(`${w.from.box}.${w.from.pin}`);
                  return v === true ? 'fup-wire-on' : v === false ? 'fup-wire-off' : '';
                })()}`}
              />
            </g>
          );
        })}
        {drag?.kind === 'wire' &&
          (() => {
            const a = find(drag.from.box);
            return a ? (
              <path
                d={wirePath(pinPos(a, drag.from.pin, 'out'), drag)}
                className="fup-wire fup-wire-draft"
              />
            ) : null;
          })()}

        {drag?.kind === 'band' && (
          <rect
            x={Math.min(drag.x0, drag.x1)}
            y={Math.min(drag.y0, drag.y1)}
            width={Math.abs(drag.x1 - drag.x0)}
            height={Math.abs(drag.y1 - drag.y0)}
            className="fup-band"
          />
        )}
        {boxes.map((b) => {
          const spec = boxSpec(b.type);
          const w = boxWidth(b.type);
          const h = boxHeight(b);
          const ins = inputPins(b.type, b.count);
          const outs = outputPins(b.type);
          const errs = errors.get(`${index}:${b.id}`) ?? [];
          const hasError = errs.some((d) => d.severity === 'error');
          const pinError = (pin: string) =>
            errs.some((d) => d.location.pin === pin && d.severity === 'error');
          const sel = selected.has(b.id);
          const set = (f: (x: FupBox) => FupBox) => updateBox(b.id, f);
          const toggleNeg = (pin: string) =>
            set((x) => ({
              ...x,
              negated: x.negated.includes(pin)
                ? x.negated.filter((p) => p !== pin)
                : [...x.negated, pin],
            }));

          return (
            <g
              key={b.id}
              className={`fup-box ${sel ? 'fup-box-sel' : ''} ${hasError ? 'fup-box-err' : ''}`}
            >
              <title>
                {[
                  spec.description,
                  ...errs.map(
                    (d) =>
                      `${t(d.severity === 'error' ? 'problem.error' : 'problem.warning')}: ${d.message}`,
                  ),
                ].join('\n')}
              </title>

              {/* Operand über der Box */}
              {spec.operandLabel && (
                <foreignObject x={b.x - 30} y={b.y - 24} width={w + 60} height={22}>
                  <input
                    className={`fup-operand fup-operand-top ${!b.operand ? 'fup-operand-empty' : ''}`}
                    value={b.operand ?? ''}
                    placeholder={`<${spec.operandLabel}>`}
                    onChange={(e) => set((x) => ({ ...x, operand: e.target.value }))}
                    spellCheck={false}
                  />
                </foreignObject>
              )}

              <rect
                x={b.x}
                y={b.y}
                width={w}
                height={h}
                rx={2}
                className="fup-box-body"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // Umschalt/Strg: zur Auswahl hinzufügen bzw. entfernen; sonst Box markieren
                  // (ist sie schon markiert, bleiben die anderen markiert und ziehen mit)
                  let ids: string[];
                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    ids = selected.has(b.id)
                      ? [...selected].filter((x) => x !== b.id)
                      : [...selected, b.id];
                  } else ids = selected.has(b.id) ? [...selected] : [b.id];
                  onSelect(ids.length ? { network: index, boxes: ids } : null);
                  if (!ids.includes(b.id)) return;
                  svgRef.current?.setPointerCapture?.(e.pointerId);
                  const p = local(e);
                  setDrag({ kind: 'box', ids, sx: p.x, sy: p.y, ddx: 0, ddy: 0, moved: false });
                }}
              />
              <text x={b.x + w / 2} y={b.y + 16} className="fup-box-label" pointerEvents="none">
                {spec.label}
              </text>

              {ins.map((p, k) => (
                <InputPin
                  key={p.name}
                  box={b}
                  pin={p}
                  y={b.y + HEAD + k * PITCH + PITCH / 2}
                  wired={wiredInputs.has(`${b.id}.${p.name}`)}
                  error={pinError(p.name)}
                  hover={hoverIn?.box === b.id && hoverIn.pin === p.name && drag?.kind === 'wire'}
                  onNegate={() => p.kind === 'bool' && toggleNeg(p.name)}
                  onOperand={(v) => set((x) => ({ ...x, inputs: { ...x.inputs, [p.name]: v } }))}
                  value={liveOf(live, b.inputs[p.name])}
                />
              ))}

              {outs.map((p, k) => {
                const y = b.y + HEAD + k * PITCH + PITCH / 2;
                const x = b.x + w;
                const wired = wiredOutputs.has(`${b.id}.${p.name}`);
                const neg = b.negated.includes(p.name);
                // Logik-/Vergleichsausgänge und ENO werden nur verbunden, andere können einen Operanden bekommen
                const operandAllowed = !(
                  spec.kind === 'logic' ||
                  spec.kind === 'compare' ||
                  p.name === 'ENO'
                );
                const lv = b.outputs[p.name]?.trim()
                  ? liveOf(live, b.outputs[p.name])
                  : liveCls(outVals?.get(`${b.id}.${p.name}`));
                return (
                  <g key={p.name}>
                    <line
                      x1={x}
                      y1={y}
                      x2={x + STUB}
                      y2={y}
                      className={`fup-pin ${lv?.cls ?? ''}`}
                    />
                    {lv && (
                      <text x={x + STUB + 6} y={y - 12} className={`fup-live ${lv.cls}`}>
                        {lv.text}
                      </text>
                    )}
                    {neg && <circle cx={x + 4} cy={y} r={4} className="fup-neg" />}
                    {!p.unlabeled && (
                      <text
                        x={x - 4}
                        y={y + 4}
                        className="fup-pin-label fup-pin-label-out"
                        pointerEvents="none"
                      >
                        {p.name}
                      </text>
                    )}
                    {p.kind === 'bool' && (
                      <circle
                        cx={x + STUB}
                        cy={y}
                        r={5}
                        className="fup-out-handle"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const pt = local(e);
                          setDrag({
                            kind: 'wire',
                            from: { box: b.id, pin: p.name },
                            x: pt.x,
                            y: pt.y,
                          });
                        }}
                        onDoubleClick={() => toggleNeg(p.name)}
                      >
                        <title>
                          {tx(
                            'Ziehen zum Verbinden · Doppelklick negiert',
                            'Drag to connect · double-click negates',
                          )}
                        </title>
                      </circle>
                    )}
                    {operandAllowed && (!wired || b.outputs[p.name]) && (
                      <foreignObject x={x + STUB + 4} y={y - 11} width={OPW} height={22}>
                        <input
                          className={`fup-operand ${pinError(p.name) ? 'fup-operand-err' : ''} ${!b.outputs[p.name] ? 'fup-operand-empty' : ''}`}
                          value={b.outputs[p.name] ?? ''}
                          placeholder={p.optional ? '' : '<???>'}
                          onChange={(e) =>
                            set((x) => ({
                              ...x,
                              outputs: { ...x.outputs, [p.name]: e.target.value },
                            }))
                          }
                          spellCheck={false}
                        />
                      </foreignObject>
                    )}
                  </g>
                );
              })}

              {spec.variadic && (
                <g className="fup-variadic">
                  <text
                    x={b.x + 6}
                    y={b.y + h - 4}
                    className="fup-plus"
                    onClick={() =>
                      set((x) => ({
                        ...x,
                        count: Math.max(spec.variadic!.min, x.count ?? spec.variadic!.min) + 1,
                      }))
                    }
                  >
                    ✚<title>{tx('Eingang hinzufügen', 'Add input')}</title>
                  </text>
                  {(b.count ?? spec.variadic.min) > spec.variadic.min && (
                    <text
                      x={b.x + 20}
                      y={b.y + h - 4}
                      className="fup-plus"
                      onClick={() => {
                        const n = (b.count ?? spec.variadic!.min) - 1;
                        const removed = `${spec.variadic!.prefix}${spec.variadic!.start + n}`;
                        onChange({
                          ...network,
                          boxes: network.boxes.map((x) => (x.id === b.id ? { ...x, count: n } : x)),
                          wires: network.wires.filter(
                            (wi) => !(wi.to.box === b.id && wi.to.pin === removed),
                          ),
                        });
                      }}
                    >
                      ━<title>{tx('Letzten Eingang entfernen', 'Remove last input')}</title>
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface InputPinProps {
  box: FupBox;
  pin: PinSpec;
  y: number;
  wired: boolean;
  error: boolean;
  hover: boolean;
  onNegate: () => void;
  onOperand: (v: string) => void;
  /** Beobachten: Wert des Operanden am Eingang */
  value?: { text: string; cls: string };
}

function InputPin({ box, pin, y, wired, error, hover, onNegate, onOperand, value }: InputPinProps) {
  const x = box.x;
  const neg = box.negated.includes(pin.name);
  return (
    <g>
      <line
        x1={x - STUB}
        y1={y}
        x2={x}
        y2={y}
        className={`fup-pin ${hover ? 'fup-pin-hover' : ''} ${value?.cls ?? ''}`}
      />
      {value && (
        <text x={x - STUB - 4} y={y - 12} textAnchor="end" className={`fup-live ${value.cls}`}>
          {value.text}
        </text>
      )}
      {neg && <circle cx={x - 4} cy={y} r={4} className="fup-neg" />}
      {!pin.unlabeled && (
        <text x={x + 4} y={y + 4} className="fup-pin-label" pointerEvents="none">
          {pin.name}
        </text>
      )}
      {/* Trefferfläche: Ziel beim Verbinden, Klick negiert Bool-Eingänge */}
      <rect
        x={x - STUB - 2}
        y={y - 9}
        width={STUB + 6}
        height={18}
        className={`fup-pin-hit ${pin.kind === 'bool' ? 'fup-pin-hit-bool' : ''}`}
        onClick={onNegate}
      >
        {pin.kind === 'bool' && <title>Klick negiert · Verbindung hierher ziehen</title>}
      </rect>
      {!wired && (
        <foreignObject x={x - STUB - OPW - 2} y={y - 11} width={OPW} height={22}>
          <input
            className={`fup-operand fup-operand-in ${error ? 'fup-operand-err' : ''} ${!box.inputs[pin.name] ? 'fup-operand-empty' : ''}`}
            value={box.inputs[pin.name] ?? ''}
            placeholder={pin.optional ? '' : '<???>'}
            onChange={(e) => onOperand(e.target.value)}
            spellCheck={false}
          />
        </foreignObject>
      )}
    </g>
  );
}
