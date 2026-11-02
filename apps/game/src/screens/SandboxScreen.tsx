import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anlageFileName,
  emptyLayout,
  levelFromLayout,
  parseAnlageFile,
  thumbnailSvg,
  toAnlageFile,
  type AnlageFile,
  type AnlageMeta,
  type Layout,
} from '@zyklus/plant-sim';
import { emptySolution } from '@zyklus/sim-core';
import { t } from '../i18n';
import { LogicAnalyzer } from '../components/LogicAnalyzer';
import { Coach } from '../components/plant/Coach';
import { MyPlants } from '../components/plant/MyPlants';
import { PublishDialog } from '../components/plant/PublishDialog';
import { PlantEditor } from '../components/plant/PlantEditor';
import { SignalsPanel } from '../components/plant/SignalsPanel';
import { useHistory } from '../state/history';
import { saveSolution } from '../state/persistence';
import { TEMPLATE_FILES } from '../state/templates';
import {
  loadActive,
  loadLayout,
  loadMeta,
  newId,
  newMeta,
  putAnlage,
  saveActive,
  saveLayout,
  saveMeta,
} from '../state/layouts';
import { plantOf } from '../sim/types';
import { LevelScreen, type PlantSlot, type SlotContext } from './LevelScreen';
import { FILE_TYPES, platform, platformFileName } from '@zyklus/platform';

/** Autosave in „Meine Anlagen“ */
const AUTOSAVE_MS = 30_000;

const COACH_KEY = 'zyklus.sandkasten.einfuehrung';

/** Stand des geführten Einstiegs; beim ersten Besuch wird er angeboten (-1) */
function loadCoach(): number | null {
  try {
    const raw = platform.storage.getItem(COACH_KEY);
    if (raw === null) return -1;
    const n = JSON.parse(raw) as number | null;
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

function saveCoach(n: number | null): void {
  try {
    platform.storage.setItem(COACH_KEY, JSON.stringify(n));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

function firstVisit(): void {
  if (loadLayout()) return;
  const r = parseAnlageFile(TEMPLATE_FILES[0]!.withProgram);
  if (!r.ok) return;
  saveLayout(r.file.layout);
  saveSolution('sandkasten', r.file.solution);
  saveMeta({ ...newMeta(), name: r.file.name, description: r.file.description });
}

/**
 * Sandkasten: eigene Anlage bauen, verdrahten, programmieren und live simulieren. Technisch ein
 * Level, das zur Laufzeit aus der Anlage entsteht; Schrank, Compiler und SPS bleiben dieselben.
 */
export function SandboxScreen({ onBack }: { onBack: () => void }) {
  // erster Besuch: mit der Sortierstation beginnen (vor dem ersten Laden des Schaltschranks)
  useState(firstVisit);
  const hist = useHistory<Layout>(() => loadLayout() ?? emptyLayout());
  const layout = hist.value;
  const [meta, setMetaState] = useState<AnlageMeta>(loadMeta);
  const [activeId, setActiveId] = useState<string | null>(loadActive);
  const [signals, setSignals] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** zuletzt gesehener Arbeitsplatz (Lösung, Simulation) für Aktionen außerhalb der Panels */
  const ctxRef = useRef<SlotContext | null>(null);
  /** Stand beim letzten Speichern (ohne Zeitstempel) */
  const savedRef = useRef<string>('');

  useEffect(() => saveLayout(layout), [layout]);
  // Hinweise blenden sich aus; Fehlermeldungen bleiben, bis sie geschlossen werden
  useEffect(() => {
    if (!notice || notice.startsWith(t('anlage.importFailed'))) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);
  useEffect(() => saveMeta(meta), [meta]);
  useEffect(() => saveActive(activeId), [activeId]);
  const level = useMemo(() => levelFromLayout(layout, t('sandkasten.title')), [layout]);

  const setMeta = (m: Partial<AnlageMeta>) => setMetaState((old) => ({ ...old, ...m }));

  /** aktueller Stand als Dateiinhalt */
  const fileData = useCallback(
    (modified: string): Omit<AnlageFile, 'format' | 'formatVersion'> => ({
      ...meta,
      modified,
      layout,
      solution: ctxRef.current?.solution ?? emptySolution(),
      sim: { speed: ctxRef.current?.sim.speed ?? 1, signals },
    }),
    [meta, layout, signals],
  );

  /** in „Meine Anlagen“ sichern; ohne Bauteile und ohne Änderung nichts tun */
  const store = useCallback(
    (force = false): string | null => {
      const probe = toAnlageFile(fileData(''));
      if (!force && (probe === savedRef.current || !layout.parts.length)) return activeId;
      const now = new Date().toISOString();
      const id = activeId ?? newId();
      putAnlage({
        id,
        name: meta.name,
        modified: now,
        thumbnail: thumbnailSvg(layout),
        file: toAnlageFile(fileData(now)),
      });
      savedRef.current = probe;
      if (id !== activeId) setActiveId(id);
      setMeta({ modified: now });
      return id;
    },
    [fileData, layout, meta.name, activeId],
  );

  // Autosave alle 30 s und beim Verlassen
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    const id = window.setInterval(() => storeRef.current(), AUTOSAVE_MS);
    return () => {
      window.clearInterval(id);
      storeRef.current();
    };
  }, []);

  /** Anlage aus einer Datei bzw. einem Eintrag übernehmen */
  const open = (file: AnlageFile, id: string | null) => {
    hist.reset(file.layout);
    setMetaState({
      name: file.name,
      description: file.description,
      author: file.author,
      created: file.created,
      modified: file.modified,
    });
    setSignals(file.sim.signals);
    ctxRef.current?.setSolution(file.solution);
    ctxRef.current?.sim.setSpeed(file.sim.speed);
    setActiveId(id);
    savedRef.current = '';
  };

  const importText = (text: string) => {
    const r = parseAnlageFile(text);
    if (!r.ok) {
      setNotice(`${t('anlage.importFailed')}\n${r.error}`);
      return;
    }
    store();
    const id = newId();
    open(r.file, id);
    putAnlage({
      id,
      name: r.file.name,
      modified: new Date().toISOString(),
      thumbnail: thumbnailSvg(r.file.layout),
      file: text,
    });
    setNotice(t('anlage.imported', { name: r.file.name }));
    setDialog(false);
  };

  // Datei ins Fenster ziehen
  const importRef = useRef(importText);
  importRef.current = importText;
  useEffect(() => platform.onFileDrop((f) => importRef.current(f.text)), []);

  const openFile = async () => {
    const f = await platform.files.open([FILE_TYPES.anlage]);
    if (f) importText(f.text);
  };

  const createNew = (name?: string) => {
    store();
    open(
      {
        format: 'zyklus-anlage',
        formatVersion: 1,
        ...newMeta(),
        ...(name ? { name } : {}),
        layout: emptyLayout(),
        solution: emptySolution(),
        sim: { speed: 1, signals: null },
      },
      null,
    );
    setDialog(false);
  };

  // geführter Einstieg: -1 = Angebot, Zahl = Schritt, null = aus
  const [coach, setCoachState] = useState<number | null>(loadCoach);
  const setCoach = (n: number | null) => {
    setCoachState(n);
    saveCoach(n);
  };
  const startCoach = () => {
    createNew(t('coach.layoutName'));
    setCoach(0);
  };

  const slot: PlantSlot = {
    subtitle: meta.name,
    overlay: (ctx) =>
      coach === null ? null : coach < 0 ? (
        <aside className="coach" aria-live="polite">
          <h3>{t('coach.offerTitle')}</h3>
          <p>{t('coach.offerText')}</p>
          <div className="coach-actions">
            <button className="btn btn-small" onClick={() => setCoach(null)}>
              {t('coach.no')}
            </button>
            <button className="btn btn-small btn-primary" onClick={startCoach}>
              {t('coach.start')}
            </button>
          </div>
        </aside>
      ) : (
        <Coach
          step={coach}
          layout={layout}
          ctx={ctx}
          onStep={setCoach}
          onClose={() => setCoach(null)}
        />
      ),
    panels: (ctx) => {
      ctxRef.current = ctx;
      const { run, sim, solution, setSolution, analysis } = ctx;
      return [
        {
          id: 'plant',
          title: t('plant.title'),
          className: 'pane-plant',
          inlineHead: true,
          render: (head) => (
            <PlantEditor
              layout={layout}
              onChange={hist.set}
              undo={hist.undo}
              redo={hist.redo}
              canUndo={hist.canUndo}
              canRedo={hist.canRedo}
              plant={plantOf(run)}
              time={run?.time ?? 0}
              live={(fn) => {
                const r = sim.ensureRun();
                const p = plantOf(r);
                if (!p) return;
                fn(p);
                if (!sim.running) sim.play();
              }}
              head={head}
            />
          ),
        },
        {
          id: 'signals',
          title: t('signals.title'),
          render: () => (
            <SignalsPanel
              level={level}
              solution={solution}
              setSolution={setSolution}
              analysis={analysis}
              run={run}
              ensureRun={sim.ensureRun}
              redraw={sim.redraw}
              signals={signals}
              onSignals={setSignals}
            />
          ),
        },
      ];
    },
    simBody: ({ run }) => (
      <LogicAnalyzer level={level} run={run} signals={signals ?? level.devices.map((d) => d.id)} />
    ),
    menu: () => [
      { label: t('anlage.mine'), onSelect: () => setDialog(true) },
      {
        label: t('anlage.save'),
        onSelect: () => {
          store(true);
          setNotice(t('anlage.saved', { name: meta.name }));
        },
      },
      {
        label: t('anlage.download'),
        onSelect: () =>
          void platform.files.save(
            platformFileName(anlageFileName(meta.name)),
            toAnlageFile(fileData(new Date().toISOString())),
            [FILE_TYPES.anlage],
          ),
      },
      {
        label: t('anlage.import'),
        title: t('anlage.importTitle'),
        onSelect: () => void openFile(),
      },
      { label: t('anlage.new'), onSelect: () => createNew() },
      { label: t('coach.menu'), onSelect: startCoach },
      {
        label: t('publish.menu'),
        title: t('publish.menuTitle'),
        disabled: !layout.parts.length,
        onSelect: () => setPublishing(true),
      },
    ],
  };

  return (
    <>
      <LevelScreen level={level} onBack={onBack} onProgress={() => {}} sandbox plant={slot} />
      {notice && (
        <div className="notice notice-float" role="alert">
          <span>{notice}</span>
          <button
            className="icon-btn"
            onClick={() => setNotice(null)}
            aria-label={t('dialog.close')}
          >
            ✕
          </button>
        </div>
      )}
      {publishing && (
        <PublishDialog
          layout={layout}
          solution={ctxRef.current?.solution ?? emptySolution()}
          name={meta.name}
          author={meta.author}
          onClose={() => setPublishing(false)}
          onPublished={(l) => {
            setPublishing(false);
            setNotice(t('publish.done', { name: l.title.de }));
          }}
        />
      )}
      {dialog && (
        <MyPlants
          activeId={activeId}
          meta={meta}
          onMeta={setMeta}
          onClose={() => setDialog(false)}
          onOpen={(id, file) => {
            store();
            open(file, id);
            setDialog(false);
          }}
          onNew={() => createNew()}
          onImport={() => void openFile()}
          onSaveCurrent={() => store(true)}
          onTemplate={importText}
        />
      )}
    </>
  );
}
