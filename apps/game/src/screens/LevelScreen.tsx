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
import type { Layout } from '@zyklus/plant-sim';
import { PlantEditor } from '../components/plant/PlantEditor';
import { plantOf, type RunView } from '../sim/types';
import { useSimulation, type SimControls } from '../state/useSimulation';
import { showNotice, useCommand, useWindowTitle } from '../state/commands';
import { FILE_TYPES, platform } from '@zyklus/platform';
import { activeForces, type OnlineAccess } from '../components/OnlinePanel';
import {
  loadOnline,
  parseValue,
  resolveOperand,
  saveOnline,
  traceTarget,
  type OnlineState,
  type Target,
} from '../state/online';

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
  run: RunView | null;
  sim: SimControls;
  solution: Solution;
  setSolution: (s: Solution) => void;
  analysis: BoardAnalysis;
  /** Programm übersetzt ohne Fehler, Anzahl Anweisungen */
  compiledOk: boolean;
  size: number;
}

/** Zusatz für den Sandkasten: Anlagenpanel, weitere Panels und Inhalt des Simulationsbereichs */
export interface PlantSlot {
  panels: (ctx: SlotContext) => PanelDef[];
  simBody: (ctx: SlotContext) => ReactNode;
  /** Kopfzeile: Einträge im Menü „Mehr“ statt Lösung speichern/laden */
  menu?: (ctx: SlotContext) => MenuItem[];
  /** Kopfzeile: zweite Zeile unter dem Titel (Name der Anlage) */
  subtitle?: string;
  /** schwebendes Element über dem Arbeitsplatz (geführter Einstieg), wird je Bild neu gezeichnet */
  overlay?: (ctx: SlotContext) => ReactNode;
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
  const [confirmLoad, setConfirmLoad] = useState(false);
  /** Haltepunkte: `cpu|baustein` → Zeilen */
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>({});

  useEffect(() => saveSolution(level.id, solution), [level.id, solution]);
  const [online, setOnline] = useState<OnlineState>(() => loadOnline(level.id));
  useEffect(() => saveOnline(level.id, online), [level.id, online]);

  // Sandkasten: Leitungen zu entfernten Bauteilen fallen weg
  useEffect(() => {
    if (!plant) return;
    const ids = new Set(level.devices.map((d) => d.id));
    if (solution.wires.some((w) => !ids.has(w.device)))
      setSolution({ ...solution, wires: solution.wires.filter((w) => ids.has(w.device)) });
  }, [plant, level, solution]);

  const compiled = useMemo(() => compileSolution(level, solution), [level, solution]);
  const sim = useSimulation(level, solution, compiled, sandbox ? 'manual' : 'test', !!plant);

  const saveSolutionFile = () =>
    void platform.files.save(`${level.id}.zyklus.json`, toSolutionFile(level.id, solution), [
      FILE_TYPES.loesung,
    ]);
  // Menü und Tastatur: Aufträge speichern laufend, „Speichern“ schreibt sofort und bestätigt
  useCommand(
    'save',
    () => void platform.flush().then(() => showNotice(t('level.savedNow'))),
    !plant,
  );
  useCommand('export', saveSolutionFile, !plant);
  useCommand('importSolution', (text) => void importSolution(text), !plant);
  useCommand('toggleSim', () => (sim.running ? sim.pause() : sim.play()));
  useWindowTitle(plant ? 'ZYKLUS – Sandkasten' : `ZYKLUS – ${tr(level.title)}`);
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
        m.set(id, {
          mode: c.mode,
          error: !!c.stopInfo && c.stopInfo.reason !== 'SWITCH' && c.stopInfo.reason !== 'POWER',
          load: c.load,
          force: c.forceCount > 0,
          diag: c.diagActive > 0,
          diagnostics: c.diagnostics,
        });
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

  /** Beobachtungs- und Forcetabelle: Lesen und Steuern in der laufenden CPU */
  const onlineAccess = (cpu: string): OnlineAccess | undefined => {
    const c = run?.cpus.get(cpu);
    if (!run || !c) return undefined;
    return {
      read: (target: Target) => {
        try {
          if (target.kind === 'address') return c.readImage(target.address, target.t);
          if (target.kind === 'slot') return c.readSlot(target.name);
          return c.readInstance(target.name, target.field as never);
        } catch {
          return undefined;
        }
      },
      readIo: (address) => {
        try {
          return c.read(address);
        } catch {
          return undefined;
        }
      },
      modify: (target: Target, v) => {
        if (target.kind === 'instance') return;
        try {
          run.modify(
            cpu,
            target.kind === 'address' ? { address: target.address } : { slot: target.name },
            v,
          );
        } catch {
          /* ungültiges Ziel: Zeile ist markiert */
        }
        sim.redraw();
      },
    };
  };

  // aktive Forceaufträge je CPU; wirken im laufenden Versuch und machen die Prüfung ungültig
  const forces = useMemo(() => {
    const out: Record<string, [string, boolean | number | string][]> = {};
    for (const [cpu, tables] of Object.entries(online)) {
      const project = solution.projects[cpu];
      if (project) out[cpu] = activeForces(project, tables);
    }
    return out;
  }, [online, solution]);
  const forceKey = JSON.stringify(forces);
  const appliedForces = useRef<{ run: RunView; list: typeof forces } | null>(null);
  useEffect(() => {
    if (!run) return;
    const prev = appliedForces.current?.run === run ? appliedForces.current.list : {};
    for (const [cpu, list] of Object.entries(prev)) {
      for (const [address] of list) {
        if (!forces[cpu]?.some(([a]) => a === address)) {
          try {
            run.setForce(cpu, address, undefined);
          } catch {
            /* Adresse entfällt */
          }
        }
      }
    }
    for (const [cpu, list] of Object.entries(forces)) {
      for (const [address, v] of list) {
        try {
          run.setForce(cpu, address, v);
        } catch {
          /* Adresse außerhalb */
        }
      }
    }
    appliedForces.current = { run, list: forces };
    sim.redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, forceKey]);

  // „zyklisch steuern“: Steuerwerte in jedem Bild erneut schreiben
  useEffect(() => {
    if (!run || !sim.running) return;
    for (const [cpu, tables] of Object.entries(online)) {
      const project = solution.projects[cpu];
      if (!tables.cyclic || !project) continue;
      for (const r of tables.watch) {
        const target = resolveOperand(project, r.operand);
        const v = r.modify ? parseValue(r.modify) : undefined;
        if ('error' in target || target.kind === 'instance' || v === undefined) continue;
        try {
          run.modify(
            cpu,
            target.kind === 'address' ? { address: target.address } : { slot: target.name },
            v,
          );
        } catch {
          /* ungültig */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.frame]);

  // Haltepunkte an den laufenden Versuch geben (auch nach Laden und neuem Versuch)
  const bpKey = JSON.stringify(breakpoints);
  useEffect(() => {
    if (!run) return;
    for (const cpu of run.cpus.keys()) {
      const lines = Object.entries(breakpoints).flatMap(([k, ls]) => {
        const [c, block] = k.split('|') as [string, string];
        return c === cpu ? ls.map((line) => ({ block, line })) : [];
      });
      run.setBreakpoints(cpu, lines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, bpKey]);
  const breakHit = run?.breakHit ?? null;

  const stopped = run && [...run.cpus.values()].find((c) => c.mode === 'STOP');
  const test = sim.mode === 'test' ? level.tests[sim.testIdx] : undefined;

  const verify = () => {
    if (!compiled.ok) return;
    const v = verifySolution(level, solution, compiled.programs, compiled.size, forces);
    setResult(v);
    if (v.passed) onProgress(recordSolved(level.id, v.metrics));
  };

  /** Externe Quelle je CPU (bei mehreren CPUs eine Datei je CPU) */
  const exportScl = () => {
    const cpus = solution.modules.filter((m) => moduleType(m.type).kind === 'cpu');
    for (const cpu of cpus) {
      const project = solution.projects[cpu.id];
      if (!project) continue;
      const name = cpus.length > 1 ? `${level.id}.${cpu.id}.scl` : `${level.id}.scl`;
      void platform.files.save(name, projectToSource(project), [FILE_TYPES.scl]);
    }
  };

  const importSolution = async (text?: string) => {
    const file = text === undefined ? await platform.files.open([FILE_TYPES.loesung]) : { text };
    if (!file) return;
    const parsed = parseSolutionFile(file.text, level.id, () => level);
    if (!parsed.ok) {
      setNotice(`${t('level.import.failed')}: ${parsed.error}`);
      return;
    }
    if (solution.modules.length) setPendingImport(parsed.solution);
    else setSolution(parsed.solution);
  };

  // Breite der Prozessansicht im Simulationsbereich (Anteil)
  const [plantW, setPlantW] = useStoredNumber('split.plant', 0.34, [0.22, 0.6]);

  const slotCtx: SlotContext = {
    run,
    sim,
    solution,
    setSolution,
    analysis: compiled.analysis,
    compiledOk: compiled.ok,
    size: compiled.size,
  };
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
            if (mode === 'RESTART') run?.powerCycle(cpu);
            else run?.setCpuSwitch(cpu, mode);
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
          probes={run && !sim.pending ? (cpu) => run.cpus.get(cpu)?.probes : undefined}
          breakpoints={{
            lines: (cpu, block) => new Set(breakpoints[`${cpu}|${block}`] ?? []),
            toggle: (cpu, block, line) => {
              const k = `${cpu}|${block}`;
              const cur = breakpoints[k] ?? [];
              const next = cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line];
              setBreakpoints({ ...breakpoints, [k]: next });
            },
            hit: breakHit ?? undefined,
          }}
          online={{
            state: online,
            onChange: (cpu, tb) => setOnline({ ...online, [cpu]: tb }),
            access: run ? onlineAccess : undefined,
          }}
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
                <button className="btn" onClick={sim.play} disabled={!sim.ready && !run}>
                  ▶ {t('sim.play')}
                </button>
              )}
              <button className="btn" onClick={sim.step} disabled={!sim.ready && !run}>
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
            {!sim.ready && !sim.pending && <span className="sim-warn">{t('sim.notReady')}</span>}
            {sim.pending &&
              (sim.pending.loadable ? (
                <span className="sim-pending" title={sim.pending.reason ?? ''}>
                  {t('sim.changed')}{' '}
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() =>
                      sim.pending?.loadable && sim.pending.inRun
                        ? sim.load({ keepValues: true, restart: false })
                        : setConfirmLoad(true)
                    }
                  >
                    ⇩ {sim.pending.inRun ? t('sim.loadRun') : t('sim.loadStop')}
                  </button>
                </span>
              ) : (
                <span className="sim-warn">{t('sim.changedBroken')}</span>
              ))}
            <BoolFormatSwitch />
            {breakHit && (
              <span className="sim-break">
                ⏸ {t('sim.break', { block: breakHit.block, line: String(breakHit.line) })} (
                {(breakHit.time / 1000).toFixed(3)} s)
              </span>
            )}
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
              <LogicAnalyzer
                level={level}
                run={run}
                test={test}
                resolveVariable={(text) => traceTarget(solution, text)}
              />
              <Splitter
                dir="x"
                label={t('layout.splitPlant')}
                onDrag={(p) => setPlantW(1 - p.x / p.width)}
                onStep={(d) => setPlantW(plantW - d * 0.02)}
              />
              {level.plant?.type === 'sandbox' ? (
                <PlantEditor
                  readOnly
                  layout={level.plant.params!.layout as Layout}
                  onChange={() => {}}
                  undo={() => {}}
                  redo={() => {}}
                  canUndo={false}
                  canRedo={false}
                  plant={plantOf(run)}
                  time={run?.time ?? 0}
                  live={(fn) => {
                    const p = plantOf(sim.ensureRun());
                    if (!p) return;
                    fn(p);
                    if (!sim.running) sim.play();
                  }}
                  head={null}
                />
              ) : (
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
              )}
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
            {!sandbox && (
              <span className="level-no">{level.id.startsWith('eigen-') ? '★' : level.order}</span>
            )}
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
                      onSelect: saveSolutionFile,
                    },
                    {
                      label: t('level.load'),
                      title: t('level.load.title'),
                      onSelect: () => void importSolution(),
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
      {confirmLoad && sim.pending?.loadable && (
        <ConfirmDialog
          title={t('sim.loadStop.title')}
          text={`${sim.pending.reason ?? ''}. ${t('sim.loadStop.text')}`}
          confirmLabel={t('sim.loadStop.reset')}
          secondary={{
            label: t('sim.loadStop.keep'),
            onSelect: () => {
              setConfirmLoad(false);
              sim.load({ keepValues: true, restart: true });
            },
          }}
          onCancel={() => setConfirmLoad(false)}
          onConfirm={() => {
            setConfirmLoad(false);
            sim.load({ keepValues: false, restart: true });
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

      {plant?.overlay?.(slotCtx)}
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
