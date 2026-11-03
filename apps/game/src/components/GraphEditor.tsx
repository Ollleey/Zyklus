import type { CodeBlock, PlcProject } from '@zyklus/sim-core';
import type { ProjectDiagnostic } from '@zyklus/scl-compiler';
import {
  emptyGraph,
  isGraphBody,
  type ActionQualifier,
  type GraphAction,
  type GraphBody,
  type GraphStep,
  type GraphTransition,
} from '@zyklus/fup-model';
import { t } from '../i18n';

interface Props {
  project: PlcProject;
  block: CodeBlock;
  diagnostics: ProjectDiagnostic[];
  onChange: (p: PlcProject) => void;
  /** Beobachten: aktiver Schritt (Nummer) der ersten Instanz, sonst undefined */
  activeStep?: number;
}

const QUALIFIERS: [ActionQualifier, string][] = [
  ['N', 'N – solange aktiv'],
  ['S', 'S – setzen'],
  ['R', 'R – rücksetzen'],
  ['D', 'D – verzögert'],
];

/**
 * GRAPH-Editor: Schritte untereinander, unter jedem Schritt seine Aktionen und abgehenden
 * Transitionen (Bedingung → Zielschritt). Meldungen erscheinen am Schritt bzw. Element.
 */
export function GraphEditor({ project, block, diagnostics, onChange, activeStep }: Props) {
  const body: GraphBody = isGraphBody(block.graph) ? block.graph : emptyGraph();
  const { steps, transitions } = body.graph;
  const set = (next: GraphBody['graph']) =>
    onChange({
      ...project,
      blocks: project.blocks.map((b) => (b === block ? { ...block, graph: { graph: next } } : b)),
    });
  const ids = new Set([
    ...steps.map((s) => s.id),
    ...transitions.map((x) => x.id),
    ...steps.flatMap((s) => s.actions.map((a) => a.id)),
  ]);
  const fresh = (p: string) => {
    let n = 1;
    while (ids.has(`${p}${n}`)) n++;
    ids.add(`${p}${n}`);
    return `${p}${n}`;
  };
  const setStep = (s: GraphStep, patch: Partial<GraphStep>) =>
    set({ steps: steps.map((x) => (x === s ? { ...s, ...patch } : x)), transitions });
  const setAction = (s: GraphStep, a: GraphAction, patch: Partial<GraphAction>) =>
    setStep(s, { actions: s.actions.map((x) => (x === a ? { ...a, ...patch } : x)) });
  const setTrans = (tr: GraphTransition, patch: Partial<GraphTransition>) =>
    set({ steps, transitions: transitions.map((x) => (x === tr ? { ...tr, ...patch } : x)) });
  const addStep = () => {
    const no = Math.max(0, ...steps.map((s) => s.no)) + 1;
    set({
      steps: [...steps, { id: fresh('s'), no, name: `Schritt ${no}`, actions: [] }],
      transitions,
    });
  };
  const removeStep = (s: GraphStep) =>
    set({
      steps: steps.filter((x) => x !== s),
      transitions: transitions.filter((x) => x.from !== s.no && x.to !== s.no),
    });
  const msgs = (stepIdx: number, id?: string) =>
    diagnostics.filter(
      (d) => d.location.network === stepIdx && (id === undefined || d.location.box === id),
    );
  const general = diagnostics.filter((d) => d.location.network === undefined);

  return (
    <div className="graph-editor">
      {general.map((d, i) => (
        <div key={i} className="graph-msg">
          {d.message}
        </div>
      ))}
      {steps.map((s, si) => (
        <section
          key={s.id}
          className={`graph-step ${s.initial ? 'graph-initial' : ''} ${activeStep === s.no ? 'graph-active' : ''}`}
        >
          <header className="graph-step-head">
            <input
              type="number"
              min={1}
              className="graph-no"
              value={s.no}
              aria-label={t('graph.stepNo')}
              onChange={(e) => {
                const no = Math.max(1, Math.round(Number(e.target.value) || 1));
                set({
                  steps: steps.map((x) => (x === s ? { ...s, no } : x)),
                  transitions: transitions.map((x) => ({
                    ...x,
                    from: x.from === s.no ? no : x.from,
                    to: x.to === s.no ? no : x.to,
                  })),
                });
              }}
            />
            <input
              className="graph-name"
              value={s.name}
              aria-label={t('table.name')}
              onChange={(e) => setStep(s, { name: e.target.value })}
            />
            <label title={t('graph.initialHint')}>
              <input
                type="radio"
                name={`init-${block.name}`}
                checked={!!s.initial}
                onChange={() =>
                  set({
                    steps: steps.map((x) => ({ ...x, initial: x === s || undefined })),
                    transitions,
                  })
                }
              />{' '}
              {t('graph.initial')}
            </label>
            <button
              className="icon-btn"
              title={t('graph.removeStep')}
              onClick={() => removeStep(s)}
            >
              ✕
            </button>
          </header>
          {msgs(si, s.id).map((d, i) => (
            <div key={i} className="graph-msg">
              {d.message}
            </div>
          ))}
          <table className="graph-actions">
            <tbody>
              {s.actions.map((a) => (
                <tr key={a.id} className={msgs(si, a.id).length ? 'graph-error' : ''}>
                  <td>
                    <select
                      value={a.q}
                      aria-label={t('graph.qualifier')}
                      onChange={(e) => setAction(s, a, { q: e.target.value as ActionQualifier })}
                    >
                      {QUALIFIERS.map(([q, label]) => (
                        <option key={q} value={q}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={a.operand}
                      placeholder={'"Motor"'}
                      spellCheck={false}
                      aria-label={t('online.operand')}
                      onChange={(e) => setAction(s, a, { operand: e.target.value })}
                    />
                  </td>
                  <td>
                    {a.q === 'D' && (
                      <input
                        className="mono graph-time"
                        value={a.time ?? ''}
                        placeholder="T#2s"
                        spellCheck={false}
                        aria-label={t('graph.time')}
                        onChange={(e) => setAction(s, a, { time: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      onClick={() => setStep(s, { actions: s.actions.filter((x) => x !== a) })}
                    >
                      ✕
                    </button>
                    {msgs(si, a.id).map((d, i) => (
                      <span key={i} className="graph-msg">
                        {' '}
                        {d.message}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn btn-small"
            onClick={() =>
              setStep(s, { actions: [...s.actions, { id: fresh('a'), q: 'N', operand: '' }] })
            }
          >
            + {t('graph.action')}
          </button>
          {transitions
            .filter((x) => x.from === s.no)
            .map((tr) => (
              <div
                key={tr.id}
                className={`graph-trans ${msgs(si, tr.id).length ? 'graph-error' : ''}`}
              >
                <span className="graph-bar" aria-hidden="true">
                  ┿
                </span>
                <input
                  className="mono graph-cond"
                  value={tr.cond}
                  placeholder={'"Start" AND Schrittzeit > T#1s'}
                  spellCheck={false}
                  aria-label={t('graph.condition')}
                  onChange={(e) => setTrans(tr, { cond: e.target.value })}
                />
                →
                <select
                  value={tr.to}
                  aria-label={t('graph.target')}
                  onChange={(e) => setTrans(tr, { to: Number(e.target.value) })}
                >
                  {steps.map((x) => (
                    <option key={x.id} value={x.no}>
                      {x.no} {x.name}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn"
                  onClick={() => set({ steps, transitions: transitions.filter((x) => x !== tr) })}
                >
                  ✕
                </button>
                {msgs(si, tr.id).map((d, i) => (
                  <span key={i} className="graph-msg">
                    {' '}
                    {d.message}
                  </span>
                ))}
              </div>
            ))}
          <button
            className="btn btn-small"
            onClick={() => {
              const next = steps[si + 1] ?? steps.find((x) => x.initial) ?? s;
              set({
                steps,
                transitions: [
                  ...transitions,
                  { id: fresh('t'), from: s.no, to: next.no, cond: '' },
                ],
              });
            }}
          >
            + {t('graph.transition')}
          </button>
        </section>
      ))}
      <button className="btn" onClick={addStep}>
        + {t('graph.step')}
      </button>
      <p className="muted">{t('graph.hint')}</p>
    </div>
  );
}
