import { useEffect, useMemo, useState } from 'react';
import {
  emptySolution,
  moduleType,
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
import { Markdown } from '../ui/Markdown';
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
}

export function LevelScreen({ level, progress, onBack, onProgress }: Props) {
  const [solution, setSolution] = useState<Solution>(() => loadSolution(level.id));
  const [brief, setBrief] = useState<'mail' | 'datasheet' | null>(() =>
    solution.modules.length ? null : 'mail',
  );
  const [result, setResult] = useState<Verification | null>(null);

  useEffect(() => saveSolution(level.id, solution), [level.id, solution]);

  const compiled = useMemo(() => compileSolution(level, solution), [level, solution]);
  const sim = useSimulation(level, solution, compiled);
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

  const exportScl = () => {
    const cpu = solution.modules.find((m) => moduleType(m.type).kind === 'cpu');
    const project = cpu && solution.projects[cpu.id];
    if (!project) return;
    const blob = new Blob([projectToSource(project)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${level.id}.scl`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="level">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('level.back')}
        </button>
        <div className="topbar-title">
          <span className="level-no">#{level.order}</span> {tr(level.title)}
          <span className="customer">{tr(level.customer)}</span>
        </div>
        <div className="topbar-actions">
          <button
            className={`btn ${brief === 'mail' ? 'btn-active' : ''}`}
            onClick={() => setBrief(brief === 'mail' ? null : 'mail')}
          >
            {t('level.mail')}
          </button>
          <button
            className={`btn ${brief === 'datasheet' ? 'btn-active' : ''}`}
            onClick={() => setBrief(brief === 'datasheet' ? null : 'datasheet')}
          >
            {t('level.datasheet')}
          </button>
          <button className="btn" onClick={exportScl} disabled={!solution.modules.length}>
            {t('level.export')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (!confirm(t('level.reset.confirm'))) return;
              clearSolution(level.id);
              setSolution(emptySolution());
            }}
          >
            {t('level.reset')}
          </button>
          <div className="live-metrics">
            <span>
              {t('metrics.cost')} <b>¤{compiled.analysis.cost}</b>
            </span>
            <span>
              {t('metrics.size')} <b>{compiled.size}</b>
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={verify}
            disabled={!compiled.ok}
            title={compiled.ok ? '' : t('sim.notReady')}
          >
            ▶ {t('level.verify')}
          </button>
        </div>
      </header>

      <main className="workspace">
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

        <section className="pane pane-program">
          <h3 className="pane-title">{t('program.title')}</h3>
          <ProgramPanel solution={solution} compiled={compiled.cpus} onChange={setSolution} />
        </section>

        <section className="pane pane-sim">
          <div className="simbar">
            <h3 className="pane-title">{t('sim.title')}</h3>
            <select
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
          <div className="sim-body">
            <LogicAnalyzer level={level} run={run} test={test} />
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
