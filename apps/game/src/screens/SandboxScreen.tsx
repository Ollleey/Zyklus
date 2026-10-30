import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SandboxPlant,
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
import { MyPlants } from '../components/plant/MyPlants';
import { PlantEditor } from '../components/plant/PlantEditor';
import { SignalsPanel } from '../components/plant/SignalsPanel';
import { useHistory } from '../state/history';
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
import { LevelScreen, type PlantSlot, type SlotContext } from './LevelScreen';

/** Autosave in „Meine Anlagen“ */
const AUTOSAVE_MS = 30_000;

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Sandkasten: eigene Anlage bauen, verdrahten, programmieren und live simulieren. Technisch ein
 * Level, das zur Laufzeit aus der Anlage entsteht; Schrank, Compiler und SPS bleiben dieselben.
 */
export function SandboxScreen({ onBack }: { onBack: () => void }) {
  const hist = useHistory<Layout>(() => loadLayout() ?? emptyLayout());
  const layout = hist.value;
  const [meta, setMetaState] = useState<AnlageMeta>(loadMeta);
  const [activeId, setActiveId] = useState<string | null>(loadActive);
  const [signals, setSignals] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** zuletzt gesehener Arbeitsplatz (Lösung, Simulation) für Aktionen außerhalb der Panels */
  const ctxRef = useRef<SlotContext | null>(null);
  /** Stand beim letzten Speichern (ohne Zeitstempel) */
  const savedRef = useRef<string>('');

  useEffect(() => saveLayout(layout), [layout]);
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
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files[0];
      if (!f) return;
      e.preventDefault();
      void f.text().then((text) => importRef.current(text));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const createNew = () => {
    store();
    open(
      {
        format: 'zyklus-anlage',
        formatVersion: 1,
        ...newMeta(),
        layout: emptyLayout(),
        solution: emptySolution(),
        sim: { speed: 1, signals: null },
      },
      null,
    );
    setDialog(false);
  };

  const slot: PlantSlot = {
    subtitle: meta.name,
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
              plant={run?.plant instanceof SandboxPlant ? run.plant : null}
              time={run?.time ?? 0}
              live={(fn) => {
                const r = sim.ensureRun();
                if (!(r?.plant instanceof SandboxPlant)) return;
                fn(r.plant);
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
          download(anlageFileName(meta.name), toAnlageFile(fileData(new Date().toISOString()))),
      },
      {
        label: t('anlage.import'),
        title: t('anlage.importTitle'),
        onSelect: () => fileInput.current?.click(),
      },
      { label: t('anlage.new'), onSelect: createNew },
    ],
  };

  return (
    <>
      <LevelScreen level={level} onBack={onBack} onProgress={() => {}} sandbox plant={slot} />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void f.text().then(importText);
        }}
      />
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
          onNew={createNew}
          onImport={() => fileInput.current?.click()}
          onSaveCurrent={() => store(true)}
        />
      )}
    </>
  );
}
