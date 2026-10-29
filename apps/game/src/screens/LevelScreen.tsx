import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptySolution,
  moduleType,
  parseSolutionFile,
  toSolutionFile,
  tr,
  verifySolution,
  type Level,
  type Solution,
  type Verification,
} from '@zyklus/sim-core';
import { projectToSource } from '@zyklus/scl-compiler';
import { compileSolution } from '@zyklus/levels';
import { t } from '../i18n';
import { Cabinet } from '../components/Cabinet';
import { LogicAnalyzer } from '../components/LogicAnalyzer';
import { PlantView } from '../components/PlantView';
import { ProgramPanel } from '../components/ProgramPanel';
import { ResultDialog } from '../components/ResultDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Markdown } from '../ui/Markdown';
import { Menu } from '../ui/Menu';
import { Splitter, useStoredNumber } from '../ui/Split';
import {
  clearSolution,
  loadSolution,
  recordSolved,
  saveSolution,
  type LevelProgress,
} from '../state/persistence';
import { useSimulation } from '../state/useSimulation';

interface Props {
  level: Level;
  progress?: LevelProgress;
  onBack: () => void;
  onProgress: (p: Record<string, LevelProgress>) => void;
  /** Sandkasten: nur Handbetrieb, keine Prüfung */
  sandbox?: boolean;
}

export function LevelScreen({ level, progress, onBack, onProgress, sandbox }: Props) {
  const [solution, setSolution] = useState<Solution>(() => loadSolution(level.id));
  const [brief, setBrief] = useState<'mail' | 'datasheet' | null>(() =>
    solution.modules.length ? null : sandbox ? 'datasheet' : 'mail',
  );
  const [result, setResult] = useState<Verification | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<Solution | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => saveSolution(level.id, solution), [level.id, solution]);

  const compiled = useMemo(() => compileSolution(level, solution), [level, solution]);
  const sim = useSimulation(level, solution, compiled, sandbox ? 'manual' : 'test');
  const run = sim.run;

  const values = useMemo(() => {
    const m = new Map<string, boolean | number>();
    if (!run) return m;
    for (const [id, trace] of run.traces) if (trace.length) m.set(id, trace[trace.length - 1]![1]);
    return m;
  }, [run, sim.frame]);

  const cpuModes = useMemo(() => {
    const m = new Map<string, 'RUN' | 'STOP'>();
    if (run) for (const [id, c] of run.cpus) m.set(id, c.mode);
    return m;
  }, [run, sim.frame]);

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
    const parsed = parseSolutionFile(await file.text(), level.id);
    if (!parsed.ok) {
      setNotice(`${t('level.import.failed')}: ${parsed.error}`);
      return;
    }
    if (solution.modules.length) setPendingImport(parsed.solution);
    else setSolution(parsed.solution);
  };

  // Panelgrößen: Schrankbreite (Anteil), Simulationshöhe (px), Prozessansicht (Anteil)
  const [splitX, setSplitX] = useStoredNumber('split.x', 0.55, [0.3, 0.75]);
  const [simH, setSimH] = useStoredNumber('split.sim', 320, [200, 700]);
  const [plantW, setPlantW] = useStoredNumber('split.plant', 0.34, [0.22, 0.6]);

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
          <span className="customer">{tr(level.customer)}</span>
        </div>
        <div className="segmented" role="group" aria-label={t('level.brief')}>
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
            label={t('level.more')}
            items={[
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

      <main className="workspace" style={{ gridTemplateRows: `minmax(0, 1fr) 6px ${simH}px` }}>
        <div
          className="ws-top"
          style={{ gridTemplateColumns: `minmax(0, ${splitX}fr) 6px minmax(0, ${1 - splitX}fr)` }}
        >
          <section className="pane pane-cabinet">
            <h3 className="pane-title">{t('cabinet.title')}</h3>
            <Cabinet
              level={level}
              solution={solution}
              analysis={compiled.analysis}
              onChange={setSolution}
              values={run ? values : undefined}
              cpuModes={run ? cpuModes : undefined}
            />
          </section>
          <Splitter
            dir="x"
            label={t('layout.splitX')}
            onDrag={(p) => setSplitX(p.x / p.width)}
            onStep={(d) => setSplitX(splitX + d * 0.02)}
          />
          <section className="pane pane-program">
            <h3 className="pane-title">{t('program.title')}</h3>
            <ProgramPanel solution={solution} compiled={compiled.cpus} onChange={setSolution} />
          </section>
        </div>
        <Splitter
          dir="y"
          label={t('layout.splitY')}
          onDrag={(p) => setSimH(p.height - p.y)}
          onStep={(d) => setSimH(simH - d * 20)}
        />

        <section className="pane pane-sim">
          <div className="simbar">
            <h3 className="pane-title">{t('sim.title')}</h3>
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
            {stopped && (
              <span className="sim-stop">
                {t('sim.stopped')}: {stopped.stopInfo?.message}
              </span>
            )}
          </div>
          <div
            className="sim-body"
            style={{ gridTemplateColumns: `minmax(0, ${1 - plantW}fr) 6px minmax(0, ${plantW}fr)` }}
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
        </section>
      </main>

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
