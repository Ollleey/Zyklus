import { useCallback, useState, type DragEvent, type ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';
import { Menu, type MenuItem } from './Menu';
import { Splitter, useStoredNumber } from './Split';
import { platform } from '@zyklus/platform';

export type AreaId = 'left' | 'right' | 'bottom';
const AREAS: AreaId[] = ['left', 'right', 'bottom'];

/** Anordnung der Panels: Reihenfolge je Andockbereich, aktiver Tab, geschlossene Panels */
export interface DockLayout {
  areas: Record<AreaId, string[]>;
  active: Partial<Record<AreaId, string>>;
}

export interface PanelDef {
  id: string;
  title: string;
  /** zusätzliche Klasse am Bereich (für bestehende Stile wie `pane-sim`) */
  className?: string;
  /**
   * Inhalt; `head` ist die Kopfzeile (Tabs und Knöpfe). Panels mit eigener Werkzeugleiste setzen
   * `inlineHead` und platzieren `head` selbst, sonst steht sie über dem Inhalt.
   */
  render: (head: ReactNode) => ReactNode;
  inlineHead?: boolean;
}

const KEY = (name: string) => `zyklus.dock.${name}`;

function valid(l: unknown, ids: string[]): l is DockLayout {
  if (typeof l !== 'object' || l === null) return false;
  const areas = (l as DockLayout).areas;
  if (!areas || !AREAS.every((a) => Array.isArray(areas[a]))) return false;
  const seen = AREAS.flatMap((a) => areas[a]);
  return seen.every((id) => ids.includes(id)) && new Set(seen).size === seen.length;
}

/** Panels, die nach dem Speichern dazugekommen sind, an ihrem Standardplatz ergänzen */
function withNewPanels(l: DockLayout, defaults: DockLayout, ids: string[]): DockLayout {
  const seen = new Set(AREAS.flatMap((a) => l.areas[a]));
  const missing = ids.filter(
    (id) => !seen.has(id) && AREAS.some((a) => defaults.areas[a].includes(id)),
  );
  if (!missing.length) return l;
  const areas = Object.fromEntries(AREAS.map((a) => [a, [...l.areas[a]]])) as DockLayout['areas'];
  for (const id of missing) areas[AREAS.find((a) => defaults.areas[a].includes(id))!].push(id);
  return { ...l, areas };
}

/** gespeicherte Anordnung; unbekannte oder kaputte Einträge fallen auf den Standard zurück */
export function useDockLayout(
  name: string,
  defaults: DockLayout,
  ids: string[],
): [DockLayout, (l: DockLayout) => void, () => void] {
  const [layout, setLayout] = useState<DockLayout>(() => {
    try {
      const raw = platform.storage.getItem(KEY(name));
      const l = raw ? (JSON.parse(raw) as unknown) : undefined;
      return valid(l, ids) ? withNewPanels(l, defaults, ids) : defaults;
    } catch {
      return defaults;
    }
  });
  const set = useCallback(
    (l: DockLayout) => {
      setLayout(l);
      try {
        platform.storage.setItem(KEY(name), JSON.stringify(l));
      } catch {
        // ohne Speicher nur für diese Sitzung
      }
    },
    [name],
  );
  const reset = useCallback(() => {
    set(defaults);
  }, [set, defaults]);
  return [layout, set, reset];
}

const areaOf = (l: DockLayout, id: string) => AREAS.find((a) => l.areas[a].includes(id));

/** Panel in einen Bereich verschieben (ans Ende) und dort aktiv setzen */
export function movePanel(l: DockLayout, id: string, to: AreaId, before?: string): DockLayout {
  const areas = Object.fromEntries(
    AREAS.map((a) => [a, l.areas[a].filter((x) => x !== id)]),
  ) as Record<AreaId, string[]>;
  const list = areas[to];
  const i = before ? list.indexOf(before) : -1;
  if (i >= 0) list.splice(i, 0, id);
  else list.push(id);
  return { areas, active: { ...l.active, [to]: id } };
}

export function closePanel(l: DockLayout, id: string): DockLayout {
  const areas = Object.fromEntries(
    AREAS.map((a) => [a, l.areas[a].filter((x) => x !== id)]),
  ) as Record<AreaId, string[]>;
  return { areas, active: l.active };
}

/** Einträge für das Menü „Ansicht“: Panels ein-/ausblenden und Standardanordnung */
export function viewMenu(
  panels: PanelDef[],
  layout: DockLayout,
  onChange: (l: DockLayout) => void,
  reset: () => void,
  defaults: DockLayout,
): MenuItem[] {
  return [
    ...panels.map((p) => {
      const open = !!areaOf(layout, p.id);
      return {
        label: `${open ? '☑' : '☐'} ${p.title}`,
        onSelect: () => {
          if (open) onChange(closePanel(layout, p.id));
          else onChange(movePanel(layout, p.id, areaOf(defaults, p.id) ?? 'right'));
        },
      };
    }),
    { label: t('dock.reset'), onSelect: reset },
  ];
}

interface Props {
  panels: PanelDef[];
  layout: DockLayout;
  onChange: (l: DockLayout) => void;
  /** Präfix der gespeicherten Größen; Aufträge behalten ihre bisherigen Schlüssel */
  sizeKey: string;
}

const DRAG_TYPE = 'application/x-zyklus-panel';

/**
 * Andockbereiche links, rechts und unten. Mehrere Panels in einem Bereich werden zu Tabs;
 * Panels lassen sich über ihren Tab ziehen oder über das Menü verschieben und schließen.
 */
export function Dock({ panels, layout, onChange, sizeKey }: Props) {
  const [splitX, setSplitX] = useStoredNumber(`${sizeKey}.x`, 0.55, [0.2, 0.8]);
  const [simH, setSimH] = useStoredNumber(`${sizeKey}.sim`, 320, [160, 900]);
  const [dropTarget, setDropTarget] = useState<AreaId | null>(null);
  const byId = new Map(panels.map((p) => [p.id, p]));
  const list = (a: AreaId) => layout.areas[a].filter((id) => byId.has(id));
  const hasL = list('left').length > 0;
  const hasR = list('right').length > 0;
  const hasTop = hasL || hasR;
  const hasB = list('bottom').length > 0;

  const onDragOver = (a: AreaId) => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    setDropTarget(a);
  };
  const onDrop = (a: AreaId, before?: string) => (e: DragEvent) => {
    const id = e.dataTransfer.getData(DRAG_TYPE);
    setDropTarget(null);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(movePanel(layout, id, a, before));
  };

  const area = (a: AreaId) => {
    const ids = list(a);
    if (!ids.length) return null;
    const activeId = ids.includes(layout.active[a] ?? '') ? layout.active[a]! : ids[0]!;
    const def = byId.get(activeId)!;
    const moves: MenuItem[] = AREAS.filter((x) => x !== a).map((x) => ({
      label: t(`dock.to.${x}` as MessageKey),
      onSelect: () => onChange(movePanel(layout, activeId, x)),
    }));
    const head = (
      <div className="dock-tabs" onDragOver={onDragOver(a)} onDrop={onDrop(a)}>
        {ids.map((id) => {
          const p = byId.get(id)!;
          return (
            <button
              key={id}
              className={`dock-tab ${id === activeId ? 'dock-tab-active' : ''} ${ids.length === 1 ? 'dock-tab-single' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDropTarget(null)}
              onDragOver={onDragOver(a)}
              onDrop={onDrop(a, id)}
              onClick={() => onChange({ ...layout, active: { ...layout.active, [a]: id } })}
              title={t('dock.dragHint')}
            >
              {p.title}
            </button>
          );
        })}
        <span className="dock-actions">
          <Menu label="⋯" items={moves} small ariaLabel={t('dock.move', { name: def.title })} />
          <button
            className="icon-btn"
            onClick={() => onChange(closePanel(layout, activeId))}
            aria-label={t('dock.close', { name: def.title })}
            title={t('dock.close', { name: def.title })}
          >
            ✕
          </button>
        </span>
      </div>
    );
    return (
      <section
        className={`pane dock-area dock-${a} ${def.className ?? ''} ${dropTarget === a ? 'dock-drop' : ''}`}
        onDragOver={onDragOver(a)}
        onDragLeave={() => setDropTarget((d) => (d === a ? null : d))}
        onDrop={onDrop(a)}
      >
        {def.inlineHead ? (
          def.render(head)
        ) : (
          <>
            <div className="dock-head">{head}</div>
            {def.render(null)}
          </>
        )}
      </section>
    );
  };

  const rows = hasTop && hasB ? `minmax(0, 1fr) 6px ${simH}px` : 'minmax(0, 1fr)';
  const cols =
    hasL && hasR ? `minmax(0, ${splitX}fr) 6px minmax(0, ${1 - splitX}fr)` : 'minmax(0, 1fr)';
  return (
    <main className="workspace" style={{ gridTemplateRows: rows }}>
      {hasTop && (
        <div className="ws-top" style={{ gridTemplateColumns: cols }}>
          {area('left')}
          {hasL && hasR && (
            <Splitter
              dir="x"
              label={t('layout.splitX')}
              onDrag={(p) => setSplitX(p.x / p.width)}
              onStep={(d) => setSplitX(splitX + d * 0.02)}
            />
          )}
          {area('right')}
        </div>
      )}
      {hasTop && hasB && (
        <Splitter
          dir="y"
          label={t('layout.splitY')}
          onDrag={(p) => setSimH(p.height - p.y)}
          onStep={(d) => setSimH(simH - d * 20)}
        />
      )}
      {area('bottom')}
      {!hasTop && !hasB && <p className="dock-empty">{t('dock.empty')}</p>}
    </main>
  );
}
