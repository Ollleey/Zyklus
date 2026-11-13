import { useState } from 'react';
import type { CodeBlock, PlcProject } from '@zyklus/sim-core';
import type { ProjectDiagnostic } from '@zyklus/scl-compiler';
import {
  emptyGraph,
  isGraphBody,
  stepList,
  type ActionQualifier,
  type GraphAction,
  type GraphBody,
  type GraphStep,
  type GraphTransition,
} from '@zyklus/fup-model';
import { t, tx } from '../i18n';

/** Beobachten: Zustand der Kette in der gewählten Instanz */
export interface GraphLive {
  active: (no: number) => boolean;
  /** Nummer des Schritts mit Überwachungsstörung (0 = keine) */
  fault: number;
  /** 0 Automatik, 1 Tippen, 2 Hand */
  mode: number;
}

interface Props {
  project: PlcProject;
  block: CodeBlock;
  diagnostics: ProjectDiagnostic[];
  onChange: (p: PlcProject) => void;
  live?: GraphLive;
}

const QUALIFIERS: [ActionQualifier, string][] = [
  ['N', tx('N – solange aktiv', 'N – while active')],
  ['S', tx('S – setzen', 'S – set')],
  ['R', tx('R – rücksetzen', 'R – reset')],
  ['D', tx('D – verzögert', 'D – delayed')],
];

/** Schrittnummern als Text („2, 3“) bzw. aus Text */
const fmt = (x: number | number[]) => stepList(x).join(', ');
const parse = (s: string): number | number[] => {
  const list = [
    ...new Set(
      s
        .split(/[ ,;]+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  return list.length === 1 ? list[0]! : list;
};

/**
 * GRAPH-Editor: Schritte untereinander, unter jedem Schritt Verriegelung, Überwachung, Aktionen
 * und abgehende Transitionen (Bedingung → Zielschritt(e)). Meldungen erscheinen am Element.
 */
export function GraphEditor({ project, block, diagnostics, onChange, live }: Props) {
  const body: GraphBody = isGraphBody(block.graph) ? block.graph : emptyGraph();
  const { steps, transitions } = body.graph;
  const [openPre, setOpenPre] = useState(!!body.graph.pre);
  const [openPost, setOpenPost] = useState(!!body.graph.post);
  const set = (patch: Partial<GraphBody['graph']>) =>
    onChange({
      ...project,
      blocks: project.blocks.map((b) =>
        b === block ? { ...block, graph: { graph: { ...body.graph, ...patch } } } : b,
      ),
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
    set({ steps: steps.map((x) => (x === s ? { ...s, ...patch } : x)) });
  const setAction = (s: GraphStep, a: GraphAction, patch: Partial<GraphAction>) =>
    setStep(s, { actions: s.actions.map((x) => (x === a ? { ...a, ...patch } : x)) });
  const setTrans = (tr: GraphTransition, patch: Partial<GraphTransition>) =>
    set({ transitions: transitions.map((x) => (x === tr ? { ...tr, ...patch } : x)) });
  const addStep = () => {
    const no = Math.max(0, ...steps.map((s) => s.no)) + 1;
    set({
      steps: [
        ...steps,
        { id: fresh('s'), no, name: `${tx('Schritt', 'Step')} ${no}`, actions: [] },
      ],
    });
  };
  /** Schritt löschen; Transitionen verlieren den Verweis, leere Transitionen entfallen */
  const removeStep = (s: GraphStep) => {
    const drop = (x: number | number[]) => stepList(x).filter((n) => n !== s.no);
    set({
      steps: steps.filter((x) => x !== s),
      transitions: transitions
        .map((x) => ({ ...x, from: parse(fmt(drop(x.from))), to: parse(fmt(drop(x.to))) }))
        .filter((x) => stepList(x.from).length && stepList(x.to).length),
    });
  };
  const renumber = (s: GraphStep, no: number) => {
    const map = (x: number | number[]) => {
      const l = stepList(x).map((n) => (n === s.no ? no : n));
      return l.length === 1 ? l[0]! : l;
    };
    set({
      steps: steps.map((x) => (x === s ? { ...s, no } : x)),
      transitions: transitions.map((x) => ({ ...x, from: map(x.from), to: map(x.to) })),
    });
  };
  const msgs = (stepIdx: number, id?: string) =>
    diagnostics.filter(
      (d) => d.location.network === stepIdx && (id === undefined || d.location.box === id),
    );
  const general = diagnostics.filter((d) => d.location.network === undefined);
  const modeText = [tx('Automatik', 'Auto'), tx('Tippen', 'Jog'), tx('Hand', 'Manual')];

  const permanent = (key: 'pre' | 'post', open: boolean, setOpen: (b: boolean) => void) => (
    <div className="graph-perm">
      <button className="iface-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {key === 'pre' ? t('graph.pre') : t('graph.post')}
      </button>
      {open && (
        <textarea
          className="mono graph-perm-text"
          rows={3}
          spellCheck={false}
          value={body.graph[key] ?? ''}
          placeholder={
            key === 'pre' ? '"Bereit" := "NotHalt" AND "Druck_ok";' : '"Lampe" := #S_NO = 1;'
          }
          onChange={(e) => set({ [key]: e.target.value || undefined })}
        />
      )}
    </div>
  );

  return (
    <div className="graph-editor">
      {live && (
        <div className="graph-status" role="status">
          {t('graph.mode')}: <b>{modeText[live.mode] ?? '?'}</b>
          {live.fault > 0 && (
            <span className="graph-fault-text"> · {t('graph.faultIn', { no: live.fault })}</span>
          )}
        </div>
      )}
      {general.map((d, i) => (
        <div key={i} className="graph-msg">
          {d.message}
        </div>
      ))}
      {permanent('pre', openPre, setOpenPre)}
      {steps.map((s, si) => (
        <section
          key={s.id}
          className={`graph-step ${s.initial ? 'graph-initial' : ''} ${live?.active(s.no) ? 'graph-active' : ''} ${live?.fault === s.no ? 'graph-faulted' : ''}`}
        >
          <header className="graph-step-head">
            <input
              type="number"
              min={1}
              className="graph-no"
              value={s.no}
              aria-label={t('graph.stepNo')}
              onChange={(e) => renumber(s, Math.max(1, Math.round(Number(e.target.value) || 1)))}
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
                  set({ steps: steps.map((x) => ({ ...x, initial: x === s || undefined })) })
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
          <div className="graph-conds">
            <label title={t('graph.interlockHint')}>
              <span className="graph-cv">C</span>
              <input
                className="mono"
                value={s.interlock ?? ''}
                placeholder={t('graph.interlock')}
                spellCheck={false}
                onChange={(e) => setStep(s, { interlock: e.target.value || undefined })}
              />
            </label>
            <label title={t('graph.supervisionHint')}>
              <span className="graph-cv">V</span>
              <input
                className="mono"
                value={s.supervision ?? ''}
                placeholder={t('graph.supervision')}
                spellCheck={false}
                onChange={(e) => setStep(s, { supervision: e.target.value || undefined })}
              />
            </label>
          </div>
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
            .filter((x) => stepList(x.from)[0] === s.no)
            .map((tr) => {
              const others = stepList(tr.from).slice(1);
              const targets = stepList(tr.to);
              return (
                <div
                  key={tr.id}
                  className={`graph-trans ${msgs(si, tr.id).length ? 'graph-error' : ''} ${targets.length > 1 ? 'graph-split' : ''} ${others.length ? 'graph-join' : ''}`}
                >
                  <span className="graph-bar" aria-hidden="true">
                    {others.length ? '╪' : '┿'}
                  </span>
                  <input
                    className="mono graph-cond"
                    value={tr.cond}
                    placeholder={'"Start" AND Schrittzeit > T#1s'}
                    spellCheck={false}
                    aria-label={t('graph.condition')}
                    onChange={(e) => setTrans(tr, { cond: e.target.value })}
                  />
                  <span title={t('graph.targetHint')}>→</span>
                  <input
                    className="mono graph-steps"
                    defaultValue={fmt(tr.to)}
                    key={`to-${fmt(tr.to)}`}
                    aria-label={t('graph.target')}
                    title={t('graph.targetHint')}
                    onBlur={(e) => {
                      const v = parse(e.target.value);
                      if (stepList(v).length) setTrans(tr, { to: v });
                      else e.target.value = fmt(tr.to);
                    }}
                  />
                  <label className="graph-join-field" title={t('graph.joinHint')}>
                    {t('graph.join')}
                    <input
                      className="mono graph-steps"
                      defaultValue={others.join(', ')}
                      key={`from-${fmt(tr.from)}`}
                      placeholder="–"
                      onBlur={(e) => {
                        const extra = stepList(parse(e.target.value)).filter((n) => n !== s.no);
                        setTrans(tr, { from: extra.length ? [s.no, ...extra] : s.no });
                      }}
                    />
                  </label>
                  <button
                    className="icon-btn"
                    onClick={() => set({ transitions: transitions.filter((x) => x !== tr) })}
                  >
                    ✕
                  </button>
                  {targets.length > 1 && <span className="graph-tag">{t('graph.split')}</span>}
                  {msgs(si, tr.id).map((d, i) => (
                    <span key={i} className="graph-msg">
                      {' '}
                      {d.message}
                    </span>
                  ))}
                </div>
              );
            })}
          <button
            className="btn btn-small"
            onClick={() => {
              const next = steps[si + 1] ?? steps.find((x) => x.initial) ?? s;
              set({
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
      {permanent('post', openPost, setOpenPost)}
      <p className="muted">{t('graph.hint')}</p>
      <p className="muted">{t('graph.paramsHint')}</p>
    </div>
  );
}
