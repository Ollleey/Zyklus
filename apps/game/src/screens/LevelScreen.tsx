import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  emptySolution,
  moduleType,
  parseSolutionFile,
  toSolutionFile,
  tr,
  verifySolution,
  type BoardAnalysis,
  type Level,
  type LevelRun,
  type Solution,
  type Verification,
} from '@zyklus/sim-core';
import { projectToSource } from '@zyklus/scl-compiler';
import { compileSolution } from '@zyklus/levels';
import { t } from '../i18n';
import { Cabinet, type CpuStatus } from '../components/Cabinet';
import { LogicAnalyzer } from '../components/LogicAnalyzer';
import { PlantView } from '../components/PlantView';
import { ProgramPanel, type WatchReader } from '../components/ProgramPanel';
import { ResultDialog } from '../components/ResultDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Markdown } from '../ui/Markdown';
import { Menu, type MenuItem } from '../ui/Menu';
import { Dock, useDockLayout, viewMenu, type DockLayout, type PanelDef } from '../ui/Dock';
import { Splitter, useStoredNumber } from '../ui/Split';
import {
  clearSolution,
  loadSolution,
  recordSolved,
  saveSolution,
  type LevelProgress,
} from '../state/persistence';
import { setBoolFormat, useBoolFormat } from '../state/prefs';
import { useSimulation, type SimControls } from '../state/useSimulation';

/** Standardanordnung der Aufträge: wie bisher Schrank links, Programm rechts, Simulation unten */
const LEVEL_DOCK: DockLayout = {
  areas: { left: ['cabinet'], right: ['program'], bottom: ['sim'] },
  active: {},
};

/** Sandkasten: Anlage und Schaltschrank als Tabs links, Programm rechts, Simulation unten */
const SANDKASTEN_DOCK: DockLayout = {
  areas: { left: ['plant', 'cabinet'], right: ['program', 'signals'], bottom: ['sim'] },
  active: { left: 'plant' },
};

/** Was der Sandkasten vom Arbeitsplatz braucht */
export interface SlotContext {
  run: LevelRun | null;
  sim: SimControls;
  solution: Solution;
  setSolution: (s: Solution) => void;
  analysis: BoardAnalysis;
}

/** Zusatz für den Sandkasten: Anlagenpanel, weitere Panels und Inhalt des Simulationsbereichs */
export interface PlantSlot {
  panels: (ctx: SlotContext) => PanelDef[];
  simBody: (ctx: SlotContext) => ReactNode;
  /** Kopfzeile: Einträge im Menü „Mehr“ statt Lösung speichern/laden */
  menu?: (ctx: SlotContext) => MenuItem[];
  /** Kopfzeile: zweite Zeile unter dem Titel (Name der Anlage) */
  subtitle?: string;
}

interface Props {
  level: Level;
  progress?: LevelProgress;
  onBack: () => void;
  onProgress: (p: Record<string, LevelProgress>) => void;
  /** Testpult und Sandkasten: nur Handbetrieb, keine Prüfung */
  sandbox?: boolean;
  /** Sandkasten mit eigener Anlage */
  plant?: PlantSlot;
}

export function LevelScreen({ level, progress, onBack, onProgress, sandbox, plant }: Props) {
  const [solution, setSolution] = useState<Solution>(() => loadSolution(level));
  const [brief, setBrief] = useState<'mail' | 'datasheet' | null>(() =>
    solution.modules.length || plant ? null : sandbox ? 'datasheet' : 'mail',
  );
  const [result, setResult] = useState<Verification | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<Solution | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => saveSolution(level.id, solution), [level.id, solution]);

  // Sandkasten: Leitungen zu entfernten Bauteilen fallen weg
  useEffect(() => {
    if (!plant) return;
    const ids = new Set(level.devices.map((d) => d.id));
    if (solution.wires.some((w) => !ids.has(w.device)))
      setSolution({ ...solution, wires: solution.wires.filter((w) => ids.has(w.device)) });
  }, [plant, level, solution]);

  const compiled = useMemo(() => compileSolution(level, solution), [level, solution]);
  const sim = useSimulation(level, solution, compiled, sandbox ? 'manual' : 'test');
  const run = sim.run;

  const values = useMemo(() => {
    const m = new Map<string, boolean | number>();
    if (!run) return m;
    for (const [id, trace] of run.traces) if (trace.length) m.set(id, trace[trace.length - 1]![1]);
    return m;
  }, [run, sim.frame]);

  const cpuStatus = useMemo(() => {
    const m = new Map<string, CpuStatus>();
    if (run) {
      for (const [id, c] of run.cpus) {
        m.set(id, { mode: c.mode, error: c.stopInfo?.reason === 'CYCLE_OVERRUN', load: c.load });
      }
    }
    return m;
  }, [run, sim.frame]);
  /** Beobachten: PLC-Variablen aus dem Prozessabbild, Datenbausteine und Instanzen */
  const watch: WatchReader = (cpu, ref) => {
    const c = run?.cpus.get(cpu);
    if (!c) return undefined;
    try {
      if (ref.tag) {
        const tag = solution.projects[cpu]?.tags.find((x) => x.name === ref.tag);
        return tag ? (c.readImage(tag.address, tag.t) as boolean | number) : undefined;
      }
      if (ref.local)
        return c.readSlot(ref.block ? `${ref.block}.${ref.local}` : ref.local) as boolean | number;
      if (ref.db && ref.member) {
        try {
          return c.readSlot(`${ref.db}.${ref.member}`) as boolean | number;
        } catch {
          return c.readInstance(ref.db, ref.member.toUpperCase() as never) as boolean | number;
        }
      }
    } catch {
      return undefined;
    }
    return undefined;
  };
  const readIo = (cpu: string, address: string) => {
    try {
      return run?.cpus.get(cpu)?.read(address) as boolean | number | undefined;
    } catch {
      return undefined;
    }
  };

  const stopped = run && [...run.cpus.values()].find((c) => c.mode === 'STOP');
  const test = sim.mode === 'test' ? level.tests[sim.testIdx] : undefined;

  const verify = () => {
    if (!compiled.ok) return;
    const v = verifySolution(level, solution, compiled.programs, compiled.size);
    setResult(v);
    if (v.passed) onProgress(recordSolved(level.id, v.metrics));
  };

  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Externe Quelle je CPU (bei mehreren CPUs eine Datei je CPU) */
  const exportScl = () => {
    const cpus = solution.modules.filter((m) => moduleType(m.type).kind === 'cpu');
    for (const cpu of cpus) {
      const project = solution.projects[cpu.id];
      if (!project) continue;
      const name = cpus.length > 1 ? `${level.id}.${cpu.id}.scl` : `${level.id}.scl`;
      download(name, projectToSource(project), 'text/plain');
    }
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const importSolution = async (file: File) => {
    const parsed = parseSolutionFile(await file.text(), level.id, () => level);
    if (!parsed.ok) {
      setNotice(`${t('level.import.failed')}: ${parsed.error}`);
      return;
    }
    if (solution.modules.length) setPendingImport(parsed.solution);
    else setSolution(parsed.solution);
  };

  // Breite der Prozessansicht im Simulationsbereich (Anteil)
  const [plantW, setPlantW] = useStoredNumber('split.plant', 0.34, [0.22, 0.6]);

  const slotCtx: SlotContext = { run, sim, solution, setSolution, analysis: compiled.analysis };
  const panels: PanelDef[] = [
    {
      id: 'cabinet',
      title: t('cabinet.title'),
      className: 'pane-cabinet',
      render: () => (
        <Cabinet
          level={level}
          solution={solution}
          analysis={compiled.analysis}
          onChange={setSolution}
          values={run ? values : undefined}
          cpuStatus={run ? cpuStatus : undefined}
          readIo={run ? readIo : undefined}
          canSwitch={sandbox}
          forced={run && run.forcedIds.length ? (id) => run.forced(id) !== undefined : undefined}
          onCpuSwitch={(cpu, mode) => {
            run?.setCpuSwitch(cpu, mode);
            if (!sim.running) sim.play();
          }}
        />
      ),
    },
    {
      id: 'program',
      title: t('program.title'),
      className: 'pane-program',
      render: () => (
        <ProgramPanel
          solution={solution}
          compiled={compiled.cpus}
          onChange={setSolution}
          watch={run ? watch : undefined}
        />
      ),
    },
    {
      id: 'sim',
      title: t('sim.title'),
      className: 'pane-sim',
      inlineHead: true,
      render: (head) => (
        <>
          <div className="simbar">
            {head}
            <select
              hidden={sandbox}
              value={sim.mode === 'manual' ? 'manual' : `${sim.testIdx}`}
              onChange={(e) => {
                if (e.target.value === 'manual') sim.setMode('manual');
                else
                  sim.select(
                    Number(e.target.value),
                    level.tests[Number(e.target.value)]!.seeds[0]!,
                  );
              }}
            >
              {level.tests.map((tc, i) => (
                <option key={tc.id} value={i}>
                  {t('sim.test')}: {tr(tc.name)}
                </option>
              ))}
              <option value="manual">{t('sim.manual')}</option>
            </select>
            {test && test.seeds.length > 1 && (
              <select
                value={sim.seed}
                onChange={(e) => sim.select(sim.testIdx, Number(e.target.value))}
              >
                {test.seeds.map((s) => (
                  <option key={s} value={s}>
                    {t('sim.seed')} {s}
                  </option>
                ))}
              </select>
            )}
            <div className="sim-buttons">
              {sim.running ? (
                <button className="btn" onClick={sim.pause}>
                  ❚❚ {t('sim.pause')}
                </button>
              ) : (
                <button className="btn" onClick={sim.play} disabled={!sim.ready}>
                  ▶ {t('sim.play')}
                </button>
              )}
              <button className="btn" onClick={sim.step} disabled={!sim.ready}>
                ▷| {t('sim.step')}
              </button>
              {[1, 10, 100].map((s) => (
                <button
                  key={s}
                  className={`btn btn-small ${sim.speed === s ? 'btn-active' : ''}`}
                  onClick={() => sim.setSpeed(s)}
                >
                  ×{s}
                </button>
              ))}
              <button className="btn" onClick={sim.reset}>
                ⟲ {t('sim.reset')}
              </button>
            </div>
            <span className="sim-time">
              {t('sim.time')} <b>{((run?.time ?? 0) / 1000).toFixed(3)} s</b>
              {test && <> / {(test.durationMs / 1000).toFixed(1)} s</>}
            </span>
            {!sim.ready && <span className="sim-warn">{t('sim.notReady')}</span>}
            <BoolFormatSwitch />
            {stopped && (
              <span className="sim-stop">
                {t('sim.stopped')}: {stopped.stopInfo?.message}
              </span>
            )}
          </div>
          {plant ? (
            <div className="sim-body sim-body-sandbox">{plant.simBody(slotCtx)}</div>
          ) : (
            <div
              className="sim-body"
              style={{
                gridTemplateColumns: `minmax(0, ${1 - plantW}fr) 6px minmax(0, ${plantW}fr)`,
              }}
            >
              <LogicAnalyzer level={level} run={run} test={test} />
              <Splitter
                dir="x"
                label={t('layout.splitPlant')}
                onDrag={(p) => setPlantW(1 - p.x / p.width)}
                onStep={(d) => setPlantW(plantW - d * 0.02)}
              />
              <PlantView
                level={level}
                traces={run?.traces}
                now={run?.time ?? 0}
                values={values}
                manual={sim.mode === 'manual'}
                actuated={(d) => run?.isActuated(d) === true}
                onActuate={(d, v) => {
                  sim.setManual(d, v);
                  if (!sim.running) sim.play();
                }}
                analogValue={(d) => {
                  const v = run?.isActuated(d);
                  const dev = level.devices.find((x) => x.id === d);
                  return typeof v === 'number' ? v : (dev?.analog?.min ?? 0);
                }}
                testParams={test?.plant}
                onAnalog={(d, v) => {
                  sim.setManual(d, v);
                  if (!sim.running) sim.play();
                }}
              />
            </div>
          )}
        </>
      ),
    },
    ...(plant ? plant.panels(slotCtx) : []),
  ];
  const ids = panels.map((p) => p.id);
  const dockName = plant ? 'sandkasten' : 'auftrag';
  const dockDefaults = plant ? SANDKASTEN_DOCK : LEVEL_DOCK;
  const dockSizes = plant ? 'sandkasten' : 'split';
  const [dock, setDock, resetDock] = useDockLayout(dockName, dockDefaults, ids);

  return (
    <div className="level">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('level.back')}
        </button>
        <div className="topbar-title">
          <span className="topbar-name">
            {!sandbox && <span className="level-no">{level.order}</span>}
            {tr(level.title)}
          </span>
          <span className="customer">{plant?.subtitle ?? tr(level.customer)}</span>
        </div>
        <div className="segmented" role="group" aria-label={t('level.brief')} hidden={!!plant}>
          <button
            className={`seg ${brief === 'mail' ? 'seg-active' : ''}`}
            aria-pressed={brief === 'mail'}
            onClick={() => setBrief(brief === 'mail' ? null : 'mail')}
          >
            {t('level.mail')}
          </button>
          <button
            className={`seg ${brief === 'datasheet' ? 'seg-active' : ''}`}
            aria-pressed={brief === 'datasheet'}
            onClick={() => setBrief(brief === 'datasheet' ? null : 'datasheet')}
          >
            {t('level.datasheet')}
          </button>
        </div>
        <div className="topbar-actions">
          <dl className="hdr-metrics">
            <div>
              <dt>{t('metrics.cost')}</dt>
              <dd>¤{compiled.analysis.cost}</dd>
            </div>
            <div>
              <dt>{t('metrics.size')}</dt>
              <dd>{compiled.size}</dd>
            </div>
          </dl>
          <Menu
            label={t('dock.view')}
            items={viewMenu(panels, dock, setDock, resetDock, dockDefaults)}
          />
          <Menu
            label={t('level.more')}
            items={[
              ...(plant?.menu ? plant.menu(slotCtx) : []),
              ...(plant?.menu
                ? []
                : [
                    {
                      label: t('level.save'),
                      title: t('level.save.title'),
                      disabled: !solution.modules.length,
                      onSelect: () =>
                        download(
                          `${level.id}.zyklus.json`,
                          toSolutionFile(level.id, solution),
                          'application/json',
                        ),
                    },
                    {
                      label: t('level.load'),
                      title: t('level.load.title'),
                      onSelect: () => fileInput.current?.click(),
                    },
                  ]),
              {
                label: t('level.export'),
                disabled: !solution.modules.length,
                onSelect: exportScl,
              },
              {
                label: t('level.reset'),
                danger: true,
                disabled: !solution.modules.length,
                onSelect: () => setConfirmReset(true),
              },
            ]}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importSolution(f);
            }}
          />
          {!sandbox && (
            <button
              className="btn btn-primary"
              onClick={verify}
              disabled={!compiled.ok}
              title={compiled.ok ? '' : t('sim.notReady')}
            >
              ▶ {t('level.verify')}
            </button>
          )}
        </div>
      </header>
      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button
            className="icon-btn"
            onClick={() => setNotice(null)}
            aria-label={t('dialog.close')}
          >
            ✕
          </button>
        </div>
      )}

      <Dock panels={panels} layout={dock} onChange={setDock} sizeKey={dockSizes} />

      {brief && (
        <aside className="brief" role="dialog">
          <div className="brief-tabs">
            <button
              className={`tab ${brief === 'mail' ? 'tab-active' : ''}`}
              onClick={() => setBrief('mail')}
            >
              {t('level.mail')}
            </button>
            <button
              className={`tab ${brief === 'datasheet' ? 'tab-active' : ''}`}
              onClick={() => setBrief('datasheet')}
            >
              {t('level.datasheet')}
            </button>
            <span className="tab-spacer" />
            <button className="icon-btn" onClick={() => setBrief(null)} aria-label="Schließen">
              ✕
            </button>
          </div>
          {brief === 'mail' ? (
            <div className="mail">
              <div className="mail-head">
                <div>
                  <span className="muted">Von:</span> {tr(level.mail.from)}
                </div>
                <div>
                  <span className="muted">Betreff:</span> <b>{tr(level.mail.subject)}</b>
                </div>
              </div>
              <Markdown text={tr(level.mail.body)} />
            </div>
          ) : (
            <div className="datasheet">
              <Markdown text={tr(level.datasheet)} />
            </div>
          )}
        </aside>
      )}

      {confirmReset && (
        <ConfirmDialog
          title={t('level.reset.title')}
          text={t('level.reset.confirm')}
          confirmLabel={t('level.reset')}
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            clearSolution(level.id);
            setSolution(emptySolution());
          }}
        />
      )}
      {pendingImport && (
        <ConfirmDialog
          title={t('level.load')}
          text={t('level.import.confirm')}
          confirmLabel={t('level.import.replace')}
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            setSolution(pendingImport);
            setPendingImport(null);
          }}
        />
      )}

      {result && (
        <ResultDialog
          level={level}
          result={result}
          best={progress?.best}
          onClose={() => setResult(null)}
          onInspect={(i, seed) => {
            setResult(null);
            sim.select(i, seed);
          }}
        />
      )}
    </div>
  );
}

/** Umschalter für die Anzeige von BOOL-Werten (gilt für alle Ansichten) */
function BoolFormatSwitch() {
  const f = useBoolFormat();
  return (
    <div className="segmented bool-format" role="group" aria-label={t('sim.boolFormat')}>
      {(['01', 'text'] as const).map((v) => (
        <button
          key={v}
          className={`seg ${f === v ? 'seg-active' : ''}`}
          aria-pressed={f === v}
          onClick={() => setBoolFormat(v)}
        >
          {v === '01' ? '0/1' : 'TRUE/FALSE'}
        </button>
      ))}
    </div>
  );
}
