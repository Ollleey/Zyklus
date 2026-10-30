import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  CATALOG,
  COLORS,
  MATERIALS,
  SIZES,
  SENSOR_TYPES,
  World,
  boundsOf,
  createPart,
  defaultZ,
  nextTag,
  rotate,
  type Category,
  type ColorId,
  type Layout,
  type MaterialId,
  type Part,
  type PartType,
  type PlantView,
  type SizeId,
  type Workpiece,
  type WorkpieceSpec,
} from '@zyklus/plant-sim';
import { t } from '../../i18n';
import { Inspector } from './Inspector';
import {
  PartSide,
  PartTop,
  PlantDefs,
  SensorZone,
  WorkpieceSide,
  WorkpieceTop,
  type ShapeState,
} from './shapes';

export type ViewMode = 'top' | 'side';

interface Props {
  layout: Layout;
  onChange: (l: Layout, gesture?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** laufende Anlage (Live-Simulation) */
  plant?: PlantView | null;
  time: number;
  /** Eingriff in die laufende Anlage; legt den Lauf bei Bedarf an */
  live: (fn: (p: PlantView) => void) => void;
  /** Kopfzeile des Panels (Tabs) */
  head: ReactNode;
  /** nur ansehen und bedienen (veröffentlichter Auftrag): keine Bibliothek, kein Inspektor */
  readOnly?: boolean;
}

const GRID = 10;
const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));

const CATEGORIES: [Category, string][] = [
  ['foerder', 'Fördertechnik'],
  ['aktor', 'Aktoren'],
  ['bedien', 'Bedienelemente'],
  ['sensor', 'Sensoren'],
];

const DRAG_PART = 'application/x-zyklus-part';

interface View {
  cx: number;
  cy: number;
  /** mm je Bildpunkt */
  scale: number;
}

interface Menu {
  x: number;
  y: number;
  wx: number;
  wy: number;
  part?: Part;
  wp?: number;
}

/** Werkstücke der Anlage: live aus der Welt, sonst die von Hand eingelegten */
function pieces(layout: Layout, plant?: PlantView | null): Workpiece[] {
  if (plant) return plant.world.workpieces.filter((w) => w.state === 'free');
  return (layout.workpieces ?? []).map((w, i) => ({
    id: -(i + 1),
    spec: { material: w.material, color: w.color, size: w.size },
    x: w.x,
    y: w.y,
    z: w.z,
    s: SIZES[w.size].w,
    h: SIZES[w.size].h,
    mass: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    state: 'free',
    grounded: true,
    angle: 0,
  }));
}

export function PlantEditor({
  layout,
  onChange,
  undo,
  redo,
  canUndo,
  canRedo,
  plant,
  time,
  live,
  head,
  readOnly = false,
}: Props) {
  const [mode, setMode] = useState<ViewMode>('top');
  const [selected, setSelected] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [zones, setZones] = useState(true);
  const [views, setViews] = useState<Record<ViewMode, View>>({
    top: { cx: 500, cy: 300, scale: 1.2 },
    side: { cx: 500, cy: -150, scale: 1.2 },
  });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [insert, setInsert] = useState<WorkpieceSpec>({
    material: 'stahl',
    color: 'silber',
    size: 'mittel',
  });
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500, known: false });
  const clip = useRef<Part | null>(null);
  const drag = useRef<
    | { kind: 'part'; id: string; sx: number; sy: number; ox: number; oy: number; gesture: string }
    | { kind: 'pan'; sx: number; sy: number; view: View }
    | { kind: 'wp'; id: number }
    | null
  >(null);

  const view = views[mode];
  const parts = layout.parts;
  const sel = parts.find((p) => p.id === selected) ?? null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500, known: el.clientWidth > 0 }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // erstes Öffnen: auf die Anlage einpassen
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !parts.length || !size.known) return;
    fitted.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.length, size.known]);

  const vb = {
    x: view.cx - (size.w * view.scale) / 2,
    y: view.cy - (size.h * view.scale) / 2,
    w: size.w * view.scale,
    h: size.h * view.scale,
  };

  const toWorld = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb.x + (clientX - r.left) * view.scale, y: vb.y + (clientY - r.top) * view.scale };
  };

  function fit() {
    if (!parts.length) return;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of parts) {
      const b = boundsOf(p);
      x0 = Math.min(x0, b.rect.x0);
      x1 = Math.max(x1, b.rect.x1);
      y0 = Math.min(y0, b.rect.y0);
      y1 = Math.max(y1, b.rect.y1);
      z0 = Math.min(z0, b.z0, 0);
      z1 = Math.max(z1, b.z1);
    }
    const pad = 80;
    const top = {
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      scale: Math.max((x1 - x0 + pad * 2) / size.w, (y1 - y0 + pad * 2) / size.h, 0.2),
    };
    const side = {
      cx: (x0 + x1) / 2,
      cy: -(z0 + z1) / 2,
      scale: Math.max((x1 - x0 + pad * 2) / size.w, (z1 - z0 + pad * 2) / size.h, 0.2),
    };
    setViews({ top, side });
  }

  const update = (p: Part, gesture?: string) =>
    onChange({ ...layout, parts: parts.map((x) => (x.id === p.id ? p : x)) }, gesture);

  const add = (type: PartType, x: number, y: number) => {
    const at =
      mode === 'top'
        ? { x: snap(x, snapOn), y: snap(y, snapOn), z: defaultZ(type) }
        : { x: snap(x, snapOn), y: Math.round(views.top.cy), z: snap(-y, snapOn) };
    const p = createPart(type, parts, at);
    onChange({ ...layout, parts: [...parts, p] });
    setSelected(p.id);
  };

  const remove = (id: string) => {
    onChange({ ...layout, parts: parts.filter((p) => p.id !== id) });
    if (selected === id) setSelected(null);
  };

  const duplicate = (src: Part, at?: { x: number; y: number }) => {
    const p = createPart(src.type, parts, {
      x: at?.x ?? src.x + 40,
      y: at?.y ?? src.y + 40,
      z: src.z,
    });
    p.rot = src.rot;
    p.params = structuredClone(src.params);
    onChange({ ...layout, parts: [...parts, p] });
    setSelected(p.id);
  };

  const turn = (p: Part) => update({ ...p, rot: rotate(p.rot, 90) });

  // ------------------------------------------------------------------ Bedienung in der Anlage
  const actuate = (p: Part, down: boolean) => {
    live((pl) => {
      const st = pl.world.st(p);
      switch (p.type) {
        case 'button':
          pl.setControl(p.id, down);
          break;
        case 'switch':
          if (down) pl.setControl(p.id, st.control ? 0 : 1);
          break;
        case 'estop':
          if (down) {
            if (st.control) pl.world.releaseEstop(p.id);
            else pl.setControl(p.id, true);
          }
          break;
        case 'selector':
          if (down) pl.setControl(p.id, (st.control + 1) % 3);
          break;
        case 'magazine':
          if (down) pl.world.triggerMagazine(p.id);
          break;
      }
    });
  };
  const OPERABLE = new Set<PartType>(['button', 'switch', 'estop', 'selector', 'magazine']);

  // ------------------------------------------------------------------ Zeiger
  const onPartDown = (e: PointerEvent, p: Part) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (OPERABLE.has(p.type) && (plant || e.altKey)) {
      actuate(p, true);
      const up = () => {
        actuate(p, false);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointerup', up);
      setSelected(p.id);
      return;
    }
    if (readOnly) return;
    setSelected(p.id);
    const w = toWorld(e.clientX, e.clientY);
    drag.current = {
      kind: 'part',
      id: p.id,
      sx: w.x,
      sy: w.y,
      ox: p.x,
      oy: mode === 'top' ? p.y : -p.z,
      gesture: `drag:${p.id}:${performance.now()}`,
    };
    svg.current!.setPointerCapture(e.pointerId);
  };

  const onWpDown = (e: PointerEvent, w: Workpiece) => {
    if (e.button !== 0 || readOnly) return;
    e.stopPropagation();
    drag.current = { kind: 'wp', id: w.id };
    svg.current!.setPointerCapture(e.pointerId);
  };

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    setMenu(null);
    if (e.button === 2) return;
    svg.current!.focus();
    if (e.button === 0) setSelected(null);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setViews({
        ...views,
        [mode]: {
          ...d.view,
          cx: d.view.cx - (e.clientX - d.sx) * d.view.scale,
          cy: d.view.cy - (e.clientY - d.sy) * d.view.scale,
        },
      });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.kind === 'wp') {
      if (mode !== 'top') return;
      if (d.id < 0) {
        const list = [...(layout.workpieces ?? [])];
        const i = -d.id - 1;
        const old = list[i];
        if (!old) return;
        list[i] = {
          ...old,
          x: Math.round(w.x),
          y: Math.round(w.y),
          z: new World(layout).topAt(w.x, w.y),
        };
        onChange({ ...layout, workpieces: list }, `wp:${d.id}`);
      } else {
        live((pl) => pl.world.moveWorkpiece(d.id, w.x, w.y, pl.world.topAt(w.x, w.y) + 1));
      }
      return;
    }
    const p = parts.find((x) => x.id === d.id);
    if (!p) return;
    const nx = snap(d.ox + (w.x - d.sx), snapOn && !e.altKey);
    const ny = snap(d.oy + (w.y - d.sy), snapOn && !e.altKey);
    if (mode === 'top') {
      if (nx !== p.x || ny !== p.y) update({ ...p, x: nx, y: ny }, d.gesture);
    } else if (nx !== p.x || -ny !== p.z) update({ ...p, x: nx, z: -ny }, d.gesture);
  };

  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Mausrad zoomt um den Zeiger (passiver Listener erlaubt kein preventDefault)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setViews((vs) => {
        const v = vs[mode];
        const f = Math.exp(e.deltaY * 0.0015);
        const scale = Math.min(8, Math.max(0.1, v.scale * f));
        const px = v.cx - (size.w * v.scale) / 2 + (e.clientX - r.left) * v.scale;
        const py = v.cy - (size.h * v.scale) / 2 + (e.clientY - r.top) * v.scale;
        const cx = px + (v.cx - px) * (scale / v.scale);
        const cy = py + (v.cy - py) * (scale / v.scale);
        return { ...vs, [mode]: { cx, cy, scale } };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [mode, size]);

  const onKey = (e: React.KeyboardEvent) => {
    if (readOnly) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (ctrl && e.key.toLowerCase() === 'c' && sel) {
      clip.current = sel;
    } else if (ctrl && e.key.toLowerCase() === 'v' && clip.current) {
      e.preventDefault();
      duplicate(clip.current);
    } else if (ctrl && e.key.toLowerCase() === 'd' && sel) {
      e.preventDefault();
      duplicate(sel);
    } else if (!sel) {
      return;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(sel.id);
    } else if (e.key.toLowerCase() === 'r') {
      turn(sel);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const s = e.shiftKey ? 50 : GRID;
      const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
      const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
      if (mode === 'top') update({ ...sel, x: sel.x + dx, y: sel.y + dy });
      else update({ ...sel, x: sel.x + dx, z: sel.z - dy });
    }
  };

  const insertWorkpiece = (x: number, y: number) => {
    if (plant) {
      live((pl) => pl.world.addWorkpiece(insert, x, y, pl.world.topAt(x, y) + 1));
    } else {
      const z = new World(layout).topAt(x, y);
      onChange({
        ...layout,
        workpieces: [
          ...(layout.workpieces ?? []),
          { ...insert, x: Math.round(x), y: Math.round(y), z },
        ],
      });
    }
    setMenu(null);
  };

  const removeWorkpiece = (id: number) => {
    if (id < 0) {
      const list = [...(layout.workpieces ?? [])];
      list.splice(-id - 1, 1);
      onChange({ ...layout, workpieces: list });
    } else live((pl) => pl.world.removeWorkpiece(id));
    setMenu(null);
  };

  // ------------------------------------------------------------------ Darstellung
  const shape = (p: Part): ShapeState => {
    if (!plant) return { time: 0 };
    const w = plant.world;
    const tankLevel = p.type === 'tank' ? w.levelOf(p) : undefined;
    return {
      st: w.st(p),
      sensed: SENSOR_TYPES.has(p.type) ? plant.sensed(p.id) : undefined,
      time,
      level: tankLevel,
    };
  };
  const wps = pieces(layout, plant);
  const ordered = useMemo(
    () =>
      [...parts].sort((a, b) =>
        mode === 'top'
          ? boundsOf(a).z1 - boundsOf(b).z1
          : boundsOf(b).rect.y0 - boundsOf(a).rect.y0,
      ),
    [parts, mode],
  );

  const gridLines = () => {
    const step = view.scale > 2 ? 100 : 50;
    const out: ReactNode[] = [];
    const x0 = Math.floor(vb.x / step) * step;
    const y0 = Math.floor(vb.y / step) * step;
    for (let x = x0; x < vb.x + vb.w; x += step)
      out.push(
        <line
          key={`x${x}`}
          x1={x}
          x2={x}
          y1={vb.y}
          y2={vb.y + vb.h}
          className={x % 500 === 0 ? 'pg-major' : 'pg-minor'}
        />,
      );
    for (let y = y0; y < vb.y + vb.h; y += step)
      out.push(
        <line
          key={`y${y}`}
          y1={y}
          y2={y}
          x1={vb.x}
          x2={vb.x + vb.w}
          className={y % 500 === 0 ? 'pg-major' : 'pg-minor'}
        />,
      );
    return out;
  };

  return (
    <div className="plant-editor">
      <div className="pe-toolbar">
        {head}
        <div className="segmented" role="group" aria-label={t('plant.view')}>
          {(['top', 'side'] as const).map((m) => (
            <button
              key={m}
              className={`seg ${mode === m ? 'seg-active' : ''}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(m === 'top' ? 'plant.top' : 'plant.side')}
            </button>
          ))}
        </div>
        {!readOnly && (
          <>
            <button className="btn btn-small" onClick={undo} disabled={!canUndo} title="Strg+Z">
              ↶ {t('plant.undo')}
            </button>
            <button className="btn btn-small" onClick={redo} disabled={!canRedo} title="Strg+Y">
              ↷ {t('plant.redo')}
            </button>
            <span className="pe-sep" />
            <button
              className="btn btn-small"
              onClick={() => sel && turn(sel)}
              disabled={!sel}
              title="R"
            >
              ⟳ {t('plant.rotate')}
            </button>
            <button
              className="btn btn-small"
              onClick={() => sel && duplicate(sel)}
              disabled={!sel}
              title="Strg+D"
            >
              ⧉ {t('plant.copy')}
            </button>
            <button
              className="btn btn-small"
              onClick={() => sel && remove(sel.id)}
              disabled={!sel}
              title="Entf"
            >
              ✕ {t('plant.delete')}
            </button>
            <span className="pe-sep" />
            <label className="pe-check">
              <input
                type="checkbox"
                checked={snapOn}
                onChange={(e) => setSnapOn(e.target.checked)}
              />{' '}
              {t('plant.snap')}
            </label>
          </>
        )}
        <label className="pe-check">
          <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} />{' '}
          {t('plant.zones')}
        </label>
        <button className="btn btn-small" onClick={fit} disabled={!parts.length}>
          ⤢ {t('plant.fit')}
        </button>
        {plant && <span className="pe-live">● {t('plant.live')}</span>}
      </div>
      <div className={`pe-body ${readOnly ? 'pe-body-ro' : ''}`}>
        {!readOnly && (
          <aside className="pe-library" aria-label={t('plant.library')}>
            {CATEGORIES.map(([cat, name]) => (
              <section key={cat}>
                <h4>{name}</h4>
                {Object.values(CATALOG)
                  .filter((i) => i.category === cat)
                  .map((i) => (
                    <button
                      key={i.type}
                      className="pe-lib-item"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_PART, i.type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => {
                        // Klick legt versetzt zur Mitte ab, damit Teile nicht übereinander liegen
                        const k = parts.length % 6;
                        add(
                          i.type,
                          view.cx + (k - 2.5) * 60,
                          view.cy + (mode === 'top' ? (k % 2) * 60 : 0),
                        );
                      }}
                      title={t('plant.libHint')}
                    >
                      <svg viewBox="-40 -40 80 80" width={22} height={22} aria-hidden>
                        <PartTop
                          part={{
                            id: '',
                            type: i.type,
                            tag: '',
                            x: 0,
                            y: 0,
                            z: 0,
                            rot: 0,
                            params: {
                              ...i.defaults,
                              length: 70,
                              width: 40,
                              radius: 70,
                              diameter: 60,
                              depth: 60,
                            },
                          }}
                          s={{ time: 0 }}
                        />
                      </svg>
                      {i.name}
                    </button>
                  ))}
              </section>
            ))}
          </aside>
        )}
        <div className="pe-canvas" ref={box}>
          <svg
            ref={svg}
            className="pe-svg"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            tabIndex={0}
            role="application"
            aria-label={t('plant.canvas')}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onKeyDown={onKey}
            onContextMenu={(e) => {
              e.preventDefault();
              if (readOnly) return;
              const w = toWorld(e.clientX, e.clientY);
              const r = box.current!.getBoundingClientRect();
              const target = (e.target as Element).closest('[data-part],[data-wp]');
              const pid = target?.getAttribute('data-part');
              const wid = target?.getAttribute('data-wp');
              // Seitenansicht: Werkstücke nur in der Draufsicht einlegen
              if (mode === 'side' && !pid) return;
              setMenu({
                x: e.clientX - r.left,
                y: e.clientY - r.top,
                wx: w.x,
                wy: w.y,
                part: parts.find((p) => p.id === pid),
                wp: wid ? Number(wid) : undefined,
              });
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_PART)) e.preventDefault();
            }}
            onDrop={(e) => {
              if (readOnly) return;
              const type = e.dataTransfer.getData(DRAG_PART) as PartType;
              if (!type || !CATALOG[type]) return;
              e.preventDefault();
              const w = toWorld(e.clientX, e.clientY);
              add(type, w.x, w.y);
            }}
          >
            <PlantDefs />
            <g className="pe-grid">{gridLines()}</g>
            {mode === 'side' && (
              <line x1={vb.x} x2={vb.x + vb.w} y1={0} y2={0} className="pe-floor" />
            )}
            {ordered.map((p) => {
              const s = shape(p);
              const b = boundsOf(p);
              const isSel = p.id === selected;
              return (
                <g
                  key={p.id}
                  data-part={p.id}
                  className={`pe-part ${OPERABLE.has(p.type) && plant ? 'pe-operable' : ''}`}
                  onPointerDown={(e) => onPartDown(e, p)}
                >
                  {mode === 'top' ? (
                    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
                      <PartTop part={p} s={s} />
                    </g>
                  ) : (
                    <PartSide part={p} s={s} />
                  )}
                  {isSel && (
                    <rect
                      className="pe-sel"
                      x={b.rect.x0 - 4}
                      y={mode === 'top' ? b.rect.y0 - 4 : -b.z1 - 4}
                      width={b.rect.x1 - b.rect.x0 + 8}
                      height={mode === 'top' ? b.rect.y1 - b.rect.y0 + 8 : b.z1 - b.z0 + 8}
                    />
                  )}
                  <text
                    className="pe-tag"
                    x={b.rect.x0}
                    y={(mode === 'top' ? b.rect.y0 : -b.z1) - 6}
                  >
                    {p.tag}
                  </text>
                </g>
              );
            })}
            {zones &&
              mode === 'top' &&
              parts
                .filter((p) => SENSOR_TYPES.has(p.type))
                .map((p) => (
                  <SensorZone key={`z${p.id}`} part={p} active={plant?.sensed(p.id) === true} />
                ))}
            {wps.map((w) =>
              mode === 'top' ? (
                <g
                  key={`w${w.id}`}
                  data-wp={w.id}
                  className="pe-wp"
                  onPointerDown={(e) => onWpDown(e, w)}
                >
                  <WorkpieceTop w={w} />
                </g>
              ) : (
                <WorkpieceSide key={`w${w.id}`} w={w} />
              ),
            )}
          </svg>
          {!parts.length && <p className="pe-empty">{t('plant.empty')}</p>}
          {plant && <Counters plant={plant} />}
          {menu && (
            <div
              className="pe-menu menu-list"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {menu.part && (
                <>
                  <button className="menu-item" onClick={() => (turn(menu.part!), setMenu(null))}>
                    {t('plant.rotate')}
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => (duplicate(menu.part!), setMenu(null))}
                  >
                    {t('plant.copy')}
                  </button>
                  <button
                    className="menu-item menu-item-danger"
                    onClick={() => (remove(menu.part!.id), setMenu(null))}
                  >
                    {t('plant.delete')}
                  </button>
                  <div className="menu-sep" />
                </>
              )}
              {menu.wp !== undefined && (
                <>
                  <button
                    className="menu-item menu-item-danger"
                    onClick={() => removeWorkpiece(menu.wp!)}
                  >
                    {t('plant.wpRemove')}
                  </button>
                  <div className="menu-sep" />
                </>
              )}
              {mode === 'top' && (
                <div className="pe-insert">
                  <b>{t('plant.wpInsert')}</b>
                  <select
                    value={insert.material}
                    onChange={(e) =>
                      setInsert({ ...insert, material: e.target.value as MaterialId })
                    }
                  >
                    {Object.values(MATERIALS).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={insert.color}
                    onChange={(e) => setInsert({ ...insert, color: e.target.value as ColorId })}
                  >
                    {Object.values(COLORS).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={insert.size}
                    onChange={(e) => setInsert({ ...insert, size: e.target.value as SizeId })}
                  >
                    {Object.entries(SIZES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => insertWorkpiece(menu.wx, menu.wy)}
                  >
                    {t('plant.insert')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {!readOnly && (
          <Inspector
            layout={layout}
            part={sel}
            plant={plant}
            onChange={(p) => update(p)}
            onLayout={onChange}
            onTagCheck={(tag) => !parts.some((x) => x.tag === tag && x.id !== sel?.id)}
            suggestTag={(type) => nextTag(type, parts)}
            live={live}
          />
        )}
      </div>
    </div>
  );
}

/** Zähler-Overlay: Teile je Behälter, Fehlsortierungen nach Soll-Regel, Durchsatz je Minute */
function Counters({ plant }: { plant: PlantView }) {
  const w = plant.world;
  const bins = w.parts.filter((p) => p.type === 'bin');
  if (!bins.length && !w.spawned) return null;
  const tally = w.tally();
  const minutes = w.time / 60_000;
  const rate = minutes > 0 ? tally.binned / minutes : 0;
  const wrong = bins.reduce((n, b) => n + w.st(b).missorted, 0);
  return (
    <div className="pe-counters" aria-live="polite">
      <table>
        <tbody>
          {bins.map((b) => {
            const st = w.st(b);
            return (
              <tr key={b.id}>
                <th>{b.tag}</th>
                <td className="mono">{st.total}</td>
                <td className={st.missorted ? 'pe-wrong' : 'muted'}>
                  {st.missorted ? `${st.missorted} ${t('plant.missorted')}` : '✓'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pe-counters-sum">
        <span>
          {t('plant.throughput')} <b className="mono">{rate.toFixed(1)}</b>/min
        </span>
        <span>
          {t('plant.issued')} <b className="mono">{w.spawned}</b>
        </span>
        {tally.lost > 0 && (
          <span className="pe-wrong">
            {t('plant.lost')} <b className="mono">{tally.lost}</b>
          </span>
        )}
        {wrong > 0 && <span className="pe-wrong">Σ {wrong}</span>}
      </div>
    </div>
  );
}
