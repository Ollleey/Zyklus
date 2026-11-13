import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  MAIN_OB,
  isUnchangedLibraryBlock,
  OB_NUMBERS,
  SIMPLE_EVENTS,
  isSimpleEvent,
  type SimpleEvent,
  SECTIONS_BY_KIND,
  moduleType,
  type Block,
  type ProbeDecl,
  type CodeBlock,
  type IfaceSection,
  type ObEvent,
  type PlcProject,
  type Solution,
} from '@zyklus/sim-core';
import { formatDiagnostic, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import type { CpuCompileResult } from '@zyklus/levels';
import { msg, t, tx } from '../i18n';
import { setCompletionSymbols } from '../completion';
import { formatValue, useBoolFormat } from '../state/prefs';
import { updateProject } from '../state/edit';
import {
  emptyFup,
  emptyLad,
  fupToLad,
  isFupBody,
  isLadBody,
  ladBodyToFup,
  type LadNetwork,
  emptyGraph,
  isGraphBody,
} from '@zyklus/fup-model';
import { LadEditor } from './LadEditor';
import { showNotice } from '../state/commands';
import { addToLibrary, insertFromLibrary, latestEntries } from '../state/library';
import { LibraryDialog } from './LibraryDialog';
import { GraphEditor } from './GraphEditor';
import { DbPanel, INSTANCE_TYPES, udtNames } from './DbPanel';
import { FupEditor, libraryFor } from './FupEditor';
// SCL-Editor (Monaco) erst laden, wenn er gebraucht wird
const SclEditor = lazy(() => import('./SclEditor').then((m) => ({ default: m.SclEditor })));
import { TagTable } from './TagTable';
import { ELEMENTARY_TYPES, VarTable } from './VarTable';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { OnlinePanel, type OnlineAccess } from './OnlinePanel';
import { CrossRefPanel } from './CrossRefPanel';
import { EMPTY_TABLES, resolveOperand, type OnlineState, type OnlineTables } from '../state/online';
import { platform } from '@zyklus/platform';
import type { SclLiveItem } from './SclEditor';

type Tab = 'main' | 'tags' | 'dbs' | 'online' | 'xref';

/** Wert eines Operanden in der laufenden Simulation */
export type WatchReader = (
  cpu: string,
  ref: { tag?: string; db?: string; member?: string; local?: string; block?: string },
) => boolean | number | undefined;

interface Props {
  solution: Solution;
  compiled: Map<string, CpuCompileResult>;
  onChange: (s: Solution) => void;
  /** Beobachten: nur während einer Simulation gesetzt */
  watch?: WatchReader;
  /** Haltepunkte je CPU und Baustein; `hit`: erreichter Haltepunkt */
  breakpoints?: {
    lines: (cpu: string, block: string) => Set<number>;
    toggle: (cpu: string, block: string, line: number) => void;
    hit?: { cpu: string; block: string; line: number };
  };
  /** Beobachten: Werte der Messpunkte einer CPU (während einer Simulation) */
  probes?: (cpu: string) => readonly (boolean | number | string)[] | undefined;
  /** Beobachtungs- und Forcetabellen je CPU; `access` nur während einer Simulation */
  online?: {
    state: OnlineState;
    onChange: (cpu: string, t: OnlineTables) => void;
    access?: (cpu: string) => OnlineAccess | undefined;
  };
}

/** Operanden einer SCL-Zeile: "Tag", "DB".Element[.Element|[i]], #lokal[.Element], %I0.0 */
const OPERAND_RE =
  /"[^"]+"(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)*|#[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|%[IQM][BWD]?\d+(?:\.[0-7])?/g;

/** Beobachten ein/aus (wie die Brille im TIA-Portal), über Neustarts gemerkt */
const MONITOR_KEY = 'zyklus.beobachten';
function loadMonitor(): boolean {
  try {
    return platform.storage.getItem(MONITOR_KEY) !== 'aus';
  } catch {
    return true;
  }
}

/** Bedingungen eines Bausteins aus den Messpunkten: Zeile → TRUE/FALSE */
function conditionsOf(
  decls: ProbeDecl[] | undefined,
  values: readonly (boolean | number | string)[] | undefined,
  block: string,
): Map<number, boolean> | undefined {
  if (!decls || !values) return undefined;
  const m = new Map<number, boolean>();
  decls.forEach((d, i) => {
    if (d.kind === 'cond' && d.block === block && typeof values[i] === 'boolean') {
      m.set(d.line, values[i] as boolean);
    }
  });
  return m;
}

const isCode = (b: Block): b is CodeBlock => b.kind === 'OB' || b.kind === 'FB' || b.kind === 'FC';

/** Anzeige wie im Projektbaum: „Main [OB1]“, „PI [FB1]“ */
export const blockLabel = (b: CodeBlock) => `${b.name} [${b.kind}${b.number}]`;

type NewBlock = 'FB' | 'FC' | 'cyclic' | 'process' | SimpleEvent;

/** Neuer Codebaustein mit freier Nummer und freiem Namen (wie „Neuen Baustein hinzufügen“). */
function newBlock(blocks: Block[], what: NewBlock): CodeBlock {
  const code = blocks.filter(isCode);
  const taken = new Set(blocks.map((b) => b.name.toLowerCase()));
  const kind = what === 'FB' || what === 'FC' ? what : 'OB';
  let number = what === 'FB' || what === 'FC' ? 1 : OB_NUMBERS[what][0];
  while (code.some((b) => b.kind === kind && b.number === number)) number++;
  const base =
    what === 'cyclic'
      ? 'Weckalarm'
      : what === 'process'
        ? 'Prozessalarm'
        : what in SIMPLE_EVENTS
          ? what === 'startup'
            ? 'Startup'
            : SIMPLE_EVENTS[what as SimpleEvent]
          : `${kind}_${number}`;
  let name = base;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base}_${n}`;
  const event: ObEvent | undefined =
    what === 'cyclic'
      ? { kind: 'cyclic', intervalMs: 100, phaseMs: 0 }
      : what === 'process'
        ? { kind: 'process', input: '%I0.0', edge: 'rising' }
        : what in SIMPLE_EVENTS
          ? ({ kind: what } as ObEvent)
          : undefined;
  const iface = Object.fromEntries(SECTIONS_BY_KIND[kind].map((s) => [s, []]));
  return { kind, name, number, lang: 'SCL', iface, source: '', ...(event ? { event } : {}) };
}

export function ProgramPanel({
  solution,
  compiled,
  onChange,
  watch,
  probes,
  online,
  breakpoints,
}: Props) {
  const boolFormat = useBoolFormat();
  const cpus = solution.modules.filter((m) => moduleType(m.type).kind === 'cpu');
  const [cpuId, setCpuId] = useState<string | undefined>(cpus[0]?.id);
  const [tab, setTab] = useState<Tab>('main');
  const [blockName, setBlockName] = useState<string>(MAIN_OB);
  const [showIface, setShowIface] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [jump, setJump] = useState<{ line: number; col: number; nonce: number }>();
  const [fupFocus, setFupFocus] = useState<{ network?: number; box?: string; nonce: number }>();
  const [monitor, setMonitorState] = useState(loadMonitor);
  const setMonitor = (on: boolean) => {
    setMonitorState(on);
    try {
      platform.storage.setItem(MONITOR_KEY, on ? 'ein' : 'aus');
    } catch {
      /* nur für diese Sitzung */
    }
  };
  /** Aufrufumgebung eines FB beim Beobachten: Instanz-DB, dessen Werte gezeigt werden */
  const [envSel, setEnvSel] = useState<string>();

  useEffect(() => {
    if (!cpus.some((c) => c.id === cpuId)) setCpuId(cpus[0]?.id);
  }, [cpus, cpuId]);

  const project = cpuId ? solution.projects[cpuId] : undefined;
  const result = cpuId ? compiled.get(cpuId) : undefined;
  const diagnostics = useMemo(
    () => (result?.diagnostics ?? []).map((d) => ({ ...d, message: msg(d.message) })),
    [result],
  );
  const codeBlocks = project?.blocks.filter(isCode) ?? [];
  const block =
    codeBlocks.find((b) => b.name === blockName) ?? codeBlocks.find((b) => b.name === MAIN_OB);

  // Autovervollständigung mit Variablen und Bausteinen der gewählten CPU
  useEffect(() => {
    if (!project) return;
    setCompletionSymbols([
      ...project.tags.map((tg) => ({
        label: `"${tg.name}"`,
        detail: `${tg.address}`,
        insert: `"${tg.name}"`,
      })),
      ...project.blocks
        .filter((b) => b.kind === 'DB' || b.kind === 'IDB' || b.kind === 'FC')
        .map((b) => ({
          label: `"${b.name}"`,
          detail: b.kind === 'IDB' ? b.of : b.kind === 'FC' ? 'Funktion' : 'Global-DB',
          insert: `"${b.name}"`,
        })),
      ...Object.values(block?.iface ?? {})
        .flat()
        .map((v) => ({ label: `#${v!.name}`, detail: v!.type, insert: `#${v!.name}` })),
    ]);
  }, [project, block]);

  const errorRows = useMemo(() => {
    const rows = new Map<string, Set<number>>();
    for (const d of diagnostics) {
      if (d.severity !== 'error' || d.location.row === undefined) continue;
      const key = d.location.part === 'tags' ? 'tags' : `${d.location.block}:${d.location.section}`;
      if (!rows.has(key)) rows.set(key, new Set());
      rows.get(key)!.add(d.location.row);
    }
    return rows;
  }, [diagnostics]);

  if (!cpuId || !project) {
    return (
      <div className="program-panel">
        <p className="empty">{t('program.none')}</p>
      </div>
    );
  }

  /**
   * Sprache wechseln wie in TIA: FUP ↔ KOP wird umgewandelt (FUP → KOP nur, wo darstellbar),
   * SCL ↔ Grafik nicht (eigener Inhalt je Sprache)
   */
  const switchLang = (l: 'SCL' | 'FUP' | 'KOP' | 'GRAPH') => {
    if (!block || l === block.lang) return;
    if (l === 'KOP' && block.lang === 'FUP' && isFupBody(block.fup) && block.fup.networks.length) {
      const lad: LadNetwork[] = [];
      for (const [n, nw] of block.fup.networks.entries()) {
        const r = fupToLad(nw);
        if ('reason' in r) {
          showNotice(
            tx(
              `Netzwerk ${n + 1} lässt sich nicht in KOP darstellen: ${r.reason}`,
              `Network ${n + 1} cannot be shown in LAD: ${msg(r.reason)}`,
            ),
          );
          return;
        }
        lad.push(r.lad);
      }
      changeBlock((b) => ({ ...b, lang: 'KOP', kop: { lad } }));
      return;
    }
    if (l === 'FUP' && block.lang === 'KOP' && isLadBody(block.kop) && block.kop.lad.length) {
      const fup = ladBodyToFup(block.kop);
      changeBlock((b) => ({ ...b, lang: 'FUP', fup }));
      return;
    }
    changeBlock((b) => ({
      ...b,
      lang: l,
      fup: l === 'FUP' && !isFupBody(b.fup) ? emptyFup() : b.fup,
      kop: l === 'KOP' && !isLadBody(b.kop) ? emptyLad() : b.kop,
      graph: l === 'GRAPH' && !isGraphBody(b.graph) ? emptyGraph() : b.graph,
    }));
  };

  /** Beobachten in FUP/KOP: Wert eines Operanden */
  const instances =
    block?.kind === 'FB'
      ? (project?.blocks ?? [])
          .filter((b) => b.kind === 'IDB' && b.of.replace(/"/g, '') === block.name)
          .map((b) => b.name)
      : [];
  const env = envSel && instances.includes(envSel) ? envSel : instances[0];
  const watching = !!watch && monitor;
  const liveOperand =
    watch && monitor && block
      ? (text: string) => {
          if (text.startsWith('#')) {
            if (block.kind === 'OB')
              return watch(cpuId, {
                local: text.slice(1).split('.')[0]!,
                block: block.name === MAIN_OB ? undefined : block.name,
              });
            // FB: Werte aus dem Instanz-DB der gewählten Aufrufumgebung
            if (block.kind !== 'FB' || !env) return undefined;
            text = `"${env}".${text.slice(1)}`;
          }
          const target = resolveOperand(project, text);
          return 'error' in target ? undefined : online?.access?.(cpuId)?.read(target);
        }
      : undefined;

  const userFbs = codeBlocks.filter((b) => b.kind === 'FB').map((b) => `"${b.name}"`);
  const libFbs = libraryFor(project).map((b) => `"${b.name}"`);
  const isCodeName = (name?: string) => !!name && codeBlocks.some((b) => b.name === name);
  const change = (f: (p: PlcProject) => PlcProject) => onChange(updateProject(solution, cpuId, f));
  const changeBlock = (f: (b: CodeBlock) => CodeBlock) =>
    change((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (isCode(b) && b.name === block?.name ? f(b) : b)),
    }));
  const setSection = (s: IfaceSection, rows: CodeBlock['iface'][IfaceSection]) =>
    changeBlock((b) => ({ ...b, iface: { ...b.iface, [s]: rows } }));

  /** Umbenennen; Instanz-DBs eines FB ziehen mit */
  const rename = (name: string) => {
    const old = block!.name;
    const fb = block!.kind === 'FB';
    change((p) => ({
      ...p,
      blocks: p.blocks.map((b) =>
        isCode(b) && b.name === old
          ? { ...b, name }
          : fb && b.kind === 'IDB' && b.of.replace(/"/g, '') === old
            ? { ...b, of: name }
            : b,
      ),
    }));
    setBlockName(name);
  };
  const addBlock = (what: NewBlock) => {
    const b = newBlock(project.blocks, what);
    change((p) => ({ ...p, blocks: [...p.blocks, b] }));
    setBlockName(b.name);
    setTab('main');
  };
  const removeBlock = () => {
    setConfirmDelete(false);
    if (!block || block.name === MAIN_OB) return;
    change((p) => ({
      ...p,
      blocks: p.blocks.filter((b) => !(isCode(b) && b.name === block.name)),
    }));
    setBlockName(MAIN_OB);
  };
  const sections = block ? SECTIONS_BY_KIND[block.kind] : [];

  const counts = {
    main: diagnostics.filter(
      (d) =>
        d.location.part === 'code' ||
        d.location.part === 'interface' ||
        isCodeName(d.location.block),
    ).length,
    tags: diagnostics.filter((d) => d.location.part === 'tags').length,
  };

  return (
    <div className="program-panel">
      <div className="tabs">
        {cpus.length > 1 && (
          <select className="cpu-select" value={cpuId} onChange={(e) => setCpuId(e.target.value)}>
            {cpus.map((c) => (
              <option key={c.id}>{c.id}</option>
            ))}
          </select>
        )}
        <button
          className={`tab ${tab === 'main' ? 'tab-active' : ''}`}
          onClick={() => setTab('main')}
        >
          {t('program.blocks')}
          {counts.main > 0 && <span className="badge">{counts.main}</span>}
        </button>
        <button
          className={`tab ${tab === 'tags' ? 'tab-active' : ''}`}
          onClick={() => setTab('tags')}
        >
          {t('program.tags')}
          {counts.tags > 0 && <span className="badge">{counts.tags}</span>}
        </button>
        <button
          className={`tab ${tab === 'dbs' ? 'tab-active' : ''}`}
          onClick={() => setTab('dbs')}
        >
          {t('program.dbs')}
        </button>
        <button
          className={`tab ${tab === 'xref' ? 'tab-active' : ''}`}
          onClick={() => setTab('xref')}
        >
          {t('program.xref')}
        </button>
        {online && (
          <button
            className={`tab ${tab === 'online' ? 'tab-active' : ''}`}
            onClick={() => setTab('online')}
          >
            {t('program.online')}
            {online.state[cpuId]?.force.some((f) => f.active) && (
              <span className="badge badge-warn">F</span>
            )}
          </button>
        )}
        <span className="tab-spacer" />
        {result && (
          <span
            className={`size-meter ${result.used > result.limit ? 'size-over' : ''}`}
            title={
              result.lang !== 'SCL' ? `${result.size} ${t('program.boxes')}` : t('program.memory')
            }
          >
            <span className="size-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (100 * result.used) / result.limit)}%` }} />
            </span>
            <span>
              <b>
                {result.used} / {result.limit}
              </b>{' '}
              {result.lang !== 'SCL' ? t('program.networks') : t('program.statements')}
            </span>
            <span
              className={result.dataBytes > result.dataLimit ? 'size-over' : 'muted'}
              title={t('program.data')}
            >
              · {result.dataBytes} / {result.dataLimit} Byte
            </span>
          </span>
        )}
      </div>

      {tab === 'main' && block && (
        <div className="main-block">
          <div className="block-bar">
            <select
              className="block-select"
              value={block.name}
              onChange={(e) => setBlockName(e.target.value)}
              aria-label={t('program.blocks')}
            >
              {codeBlocks.map((b) => {
                const errs = diagnostics.filter(
                  (d) => d.severity === 'error' && d.location.block === b.name,
                ).length;
                return (
                  <option key={b.name} value={b.name}>
                    {blockLabel(b)}
                    {errs ? ` ⚠ ${errs}` : ''}
                  </option>
                );
              })}
            </select>
            <select
              className="block-add"
              value=""
              onChange={(e) =>
                e.target.value === 'library'
                  ? setShowLibrary(true)
                  : e.target.value && addBlock(e.target.value as NewBlock)
              }
              aria-label={t('block.add')}
            >
              <option value="">+ {t('block.add')}</option>
              <option value="FB">{t('block.add.fb')}</option>
              <option value="FC">{t('block.add.fc')}</option>
              <option value="cyclic">{t('block.add.cyclic')}</option>
              <option value="process">{t('block.add.process')}</option>
              <option value="startup">{t('block.add.startup')}</option>
              <option value="timeError">{t('block.add.timeError')}</option>
              <option value="diagnostic">{t('block.add.diagnostic')}</option>
              <option value="rackFailure">{t('block.add.rackFailure')}</option>
              <option value="programError">{t('block.add.programError')}</option>
              <option value="library">{t('library.fromLibrary')}</option>
            </select>
            {block.name !== MAIN_OB && !block.protected && (
              <>
                <input
                  className="block-name"
                  value={block.name}
                  onChange={(e) => rename(e.target.value)}
                  spellCheck={false}
                  aria-label={t('table.name')}
                />
                {(block.kind === 'FB' || block.kind === 'FC') && (
                  <button
                    className="icon-btn"
                    title={t('library.save')}
                    onClick={() => {
                      const v = addToLibrary(block);
                      showNotice(t('library.saved', { name: block.name, version: v }));
                    }}
                  >
                    📚
                  </button>
                )}
                {block.library && (
                  <span className="muted" title={t('library.badgeHint')}>
                    {t('library.badge', { version: block.library.version })}
                    {isUnchangedLibraryBlock(block) ? '' : ` (${t('library.changed')})`}
                    {(() => {
                      const newest = latestEntries().find(
                        (e) =>
                          e.kind === 'block' && e.name.toLowerCase() === block.name.toLowerCase(),
                      );
                      return newest && newest.version > block.library.version
                        ? ` · ${t('library.available', { version: newest.version })}`
                        : '';
                    })()}
                  </span>
                )}
                <button
                  className="icon-btn"
                  title={t('db.delete')}
                  onClick={() => setConfirmDelete(true)}
                >
                  ✕
                </button>
              </>
            )}
          </div>
          <textarea
            className="block-comment"
            rows={1}
            placeholder={t('block.comment')}
            aria-label={t('block.comment')}
            value={block.comment ?? ''}
            readOnly={block.protected}
            onChange={(e) =>
              changeBlock((b) => {
                const { comment: _, ...rest } = b;
                return e.target.value ? { ...rest, comment: e.target.value } : rest;
              })
            }
          />
          {block.event && (
            <EventEditor
              event={block.event}
              onChange={(event) => changeBlock((b) => ({ ...b, event }))}
            />
          )}
          <div className="iface iface-bar">
            <div className="lang-switch" role="radiogroup" aria-label="Sprache">
              {(block.kind === 'FB'
                ? (['SCL', 'FUP', 'KOP', 'GRAPH'] as const)
                : (['SCL', 'FUP', 'KOP'] as const)
              ).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={block.lang === l}
                  disabled={block.protected}
                  className={`lang ${block.lang === l ? 'lang-active' : ''}`}
                  onClick={() => switchLang(l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              className={`btn btn-small monitor-toggle ${watching ? 'monitor-live' : ''}`}
              aria-pressed={monitor}
              onClick={() => setMonitor(!monitor)}
              title={t('monitor.title')}
            >
              👓 {monitor ? t('monitor.on') : t('monitor.off')}
            </button>
            {monitor && !watch && <span className="monitor-hint">{t('monitor.startSim')}</span>}
            {watching &&
              block.kind === 'FB' &&
              (instances.length ? (
                <label className="monitor-env">
                  {t('monitor.env')}
                  <select value={env} onChange={(e) => setEnvSel(e.target.value)}>
                    {instances.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="monitor-hint">{t('monitor.noInstance')}</span>
              ))}
            {watching && block.kind === 'FC' && (
              <span className="monitor-hint">{t('monitor.fc')}</span>
            )}
            <button className="iface-toggle" onClick={() => setShowIface(!showIface)}>
              {showIface ? '▾' : '▸'} {t('program.interface')}{' '}
              <span className="muted">
                {sections.map((s) => `${s} ${block.iface[s]?.length ?? 0}`).join(' · ')}
              </span>
            </button>
            {showIface && (
              <fieldset className="iface-sections" disabled={block.protected}>
                {block.kind === 'FC' && (
                  <div className="iface-section">
                    <h4>Return</h4>
                    <label className="iface-return">
                      <span>Ret_Val :</span>
                      <input
                        value={block.returnType ?? 'Void'}
                        list="fc-return-types"
                        spellCheck={false}
                        onChange={(e) =>
                          changeBlock((b) => {
                            const v = e.target.value;
                            const { returnType: _, ...rest } = b;
                            return v.trim() && v.trim().toLowerCase() !== 'void'
                              ? { ...rest, returnType: v }
                              : rest;
                          })
                        }
                      />
                      <datalist id="fc-return-types">
                        {['Void', ...ELEMENTARY_TYPES].map((ty) => (
                          <option key={ty} value={ty} />
                        ))}
                      </datalist>
                    </label>
                  </div>
                )}
                {sections.map((s) => (
                  <div key={s} className="iface-section">
                    <h4>{s}</h4>
                    <VarTable
                      rows={block.iface[s] ?? []}
                      onChange={(rows) => setSection(s, rows)}
                      errorRows={errorRows.get(`${block.name}:${s}`)}
                      withInit={s !== 'Temp' && s !== 'InOut'}
                      withRetain={
                        block.kind === 'FB' && (s === 'Input' || s === 'Output' || s === 'Static')
                      }
                      types={
                        s === 'Static'
                          ? [
                              ...ELEMENTARY_TYPES,
                              ...udtNames(project),
                              ...INSTANCE_TYPES,
                              ...userFbs,
                              ...libFbs,
                            ]
                          : [...ELEMENTARY_TYPES, ...udtNames(project)]
                      }
                    />
                  </div>
                ))}
              </fieldset>
            )}
          </div>
          {block.protected ? (
            <div className="block-protected">🔒 {t('block.protected')}</div>
          ) : block.lang === 'GRAPH' ? (
            <GraphEditor
              key={block.name}
              project={project}
              block={block}
              diagnostics={diagnostics.filter((d) => d.location.block === block.name)}
              onChange={(p) => change(() => p)}
              activeStep={(() => {
                const idb = project.blocks.find((b) => b.kind === 'IDB' && b.of === block.name);
                const v = idb ? liveOperand?.(`"${idb.name}".__Schritt`) : undefined;
                return typeof v === 'number' ? v : undefined;
              })()}
            />
          ) : block.lang === 'KOP' ? (
            <LadEditor
              key={block.name}
              project={project}
              block={block}
              diagnostics={diagnostics.filter((d) => d.location.block === block.name)}
              onChange={(p) => change(() => p)}
              live={liveOperand}
            />
          ) : block.lang === 'FUP' ? (
            <FupEditor
              key={block.name}
              project={project}
              block={block}
              diagnostics={diagnostics.filter((d) => d.location.block === block.name)}
              onChange={(p) => change(() => p)}
              focus={fupFocus}
              live={liveOperand}
            />
          ) : (
            <Suspense fallback={<div className="muted editor-loading">…</div>}>
              <SclEditor
                live={
                  liveOperand &&
                  ((line): SclLiveItem[] | undefined => {
                    const code = line.replace(/\/\/.*$/, '').replace(/'[^']*'/g, "''");
                    const items: SclLiveItem[] = [];
                    const seen = new Set<string>();
                    for (const [op] of code.matchAll(OPERAND_RE)) {
                      if (seen.has(op) || items.length >= 8) continue;
                      seen.add(op);
                      const v = liveOperand(op);
                      if (v === undefined || typeof v === 'object') continue;
                      items.push({
                        label: op.replace(/"/g, ''),
                        value: formatValue(
                          v,
                          boolFormat,
                          typeof v === 'number' && !Number.isInteger(v) ? 2 : 0,
                        ),
                        kind: typeof v === 'boolean' ? (v ? 'on' : 'off') : 'num',
                      });
                    }
                    return items.length ? items : undefined;
                  })
                }
                conditions={
                  watching
                    ? conditionsOf(result?.program?.probes, probes?.(cpuId), block.name)
                    : undefined
                }
                breakpoints={breakpoints?.lines(cpuId, block.name)}
                onToggleBreakpoint={
                  breakpoints && ((line) => breakpoints.toggle(cpuId, block.name, line))
                }
                hitLine={
                  breakpoints?.hit?.cpu === cpuId && breakpoints.hit.block === block.name
                    ? breakpoints.hit.line
                    : undefined
                }
                key={block.name}
                value={block.source}
                onChange={(source) => changeBlock((b) => ({ ...b, source }))}
                diagnostics={diagnostics.filter(
                  (d) => d.location.part === 'code' && d.location.block === block.name,
                )}
                jump={jump}
              />
            </Suspense>
          )}
        </div>
      )}
      {tab === 'tags' && (
        <div className="scroll">
          <TagTable
            live={
              watch &&
              ((tag) => {
                const v = watch(cpuId, { tag: tag.name });
                return v === undefined
                  ? ''
                  : formatValue(
                      v,
                      boolFormat,
                      typeof v === 'number' && !Number.isInteger(v) ? 2 : 0,
                    );
              })
            }
            tags={project.tags}
            onChange={(tags) => change((p) => ({ ...p, tags }))}
            errorRows={errorRows.get('tags')}
          />
        </div>
      )}
      {tab === 'xref' && (
        <div className="scroll">
          <CrossRefPanel
            project={project}
            xref={result?.xref ?? []}
            calls={result?.calls ?? []}
            onJump={(name, line) => {
              if (!isCodeName(name)) return;
              setBlockName(name);
              setTab('main');
              setJump({ line, col: 1, nonce: Math.random() });
            }}
          />
        </div>
      )}
      {tab === 'online' && online && (
        <div className="scroll">
          <OnlinePanel
            project={project}
            tables={online.state[cpuId] ?? EMPTY_TABLES}
            onChange={(tb) => online.onChange(cpuId, tb)}
            live={online.access?.(cpuId)}
          />
        </div>
      )}
      {tab === 'dbs' && (
        <div className="scroll">
          <DbPanel
            project={project}
            onChange={(p) => change(() => p)}
            userFbs={userFbs}
            errorRows={errorRows}
          />
        </div>
      )}

      {showLibrary && (
        <LibraryDialog
          project={project}
          onClose={() => setShowLibrary(false)}
          onInsert={(e) => {
            change((p) => insertFromLibrary(p, e));
            setShowLibrary(false);
            if (e.kind === 'block') {
              setBlockName(e.name);
              setTab('main');
            } else setTab('dbs');
            showNotice(t('library.inserted', { name: e.name, version: e.version }));
          }}
        />
      )}
      {confirmDelete && block && (
        <ConfirmDialog
          title={t('block.delete.title', { name: block.name })}
          text={t('block.delete.confirm')}
          confirmLabel={t('db.delete')}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={removeBlock}
        />
      )}
      <Problems
        diagnostics={diagnostics}
        onJump={(d) => {
          if (isCodeName(d.location.block)) setBlockName(d.location.block!);
          if (d.location.part === 'code' && d.location.network !== undefined) {
            setTab('main');
            setFupFocus({ network: d.location.network, box: d.location.box, nonce: Math.random() });
          } else if (d.location.part === 'code') {
            setTab('main');
            setJump({ line: d.start.line, col: d.start.col, nonce: Math.random() });
          } else if (d.location.part === 'interface') {
            setTab('main');
            setShowIface(true);
          } else if (d.location.part === 'tags') {
            setTab('tags');
          } else if (isCodeName(d.location.block)) {
            setTab('main');
          } else if (d.location.block) {
            setTab('dbs');
          }
        }}
      />
    </div>
  );
}

/** Startereignis eines Alarm-OBs (in TIA: Eigenschaften des OB bzw. des Eingangskanals) */
function EventEditor({ event, onChange }: { event: ObEvent; onChange: (e: ObEvent) => void }) {
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  if (isSimpleEvent(event)) {
    return (
      <div className="event-bar">
        <span className="event-kind">
          {SIMPLE_EVENTS[event.kind]} (OB{OB_NUMBERS[event.kind][0]})
        </span>
      </div>
    );
  }
  return (
    <div className="event-bar">
      {event.kind === 'cyclic' ? (
        <>
          <span className="event-kind">{t('block.cyclic')}</span>
          <label>
            {t('block.interval')}{' '}
            <input
              type="number"
              min={1}
              value={event.intervalMs}
              onChange={(e) => onChange({ ...event, intervalMs: Math.max(1, num(e.target.value)) })}
            />{' '}
            ms
          </label>
          <label>
            {t('block.phase')}{' '}
            <input
              type="number"
              min={0}
              value={event.phaseMs ?? 0}
              onChange={(e) => onChange({ ...event, phaseMs: num(e.target.value) })}
            />{' '}
            ms
          </label>
        </>
      ) : (
        <>
          <span className="event-kind">{t('block.process')}</span>
          <label>
            {t('block.input')}{' '}
            <input
              value={event.input}
              onChange={(e) => onChange({ ...event, input: e.target.value })}
              spellCheck={false}
              placeholder={t('block.input.placeholder')}
            />
          </label>
          <label>
            {t('block.edge')}{' '}
            <select
              value={event.edge}
              onChange={(e) => onChange({ ...event, edge: e.target.value as 'rising' | 'falling' })}
            >
              <option value="rising">{t('block.edge.rising')}</option>
              <option value="falling">{t('block.edge.falling')}</option>
            </select>
          </label>
        </>
      )}
      <label title={t('block.tpaHint')}>
        TPA{' '}
        <select
          value={event.tpa ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            const { tpa: _, ...rest } = event;
            onChange(v ? { ...rest, tpa: v } : rest);
          }}
        >
          <option value={0}>{t('block.tpaNone')}</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              TPA {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Problems({
  diagnostics,
  onJump,
}: {
  diagnostics: ProjectDiagnostic[];
  onJump: (d: ProjectDiagnostic) => void;
}) {
  return (
    <div className="problems">
      <div className="problems-title">{t('program.problems')}</div>
      {diagnostics.length === 0 ? (
        <div className="problem problem-ok">✓ {t('program.noProblems')}</div>
      ) : (
        diagnostics.map((d, i) => (
          <button key={i} className={`problem problem-${d.severity}`} onClick={() => onJump(d)}>
            <span className="problem-where">
              {d.location.part === 'code' && d.location.network !== undefined
                ? `${t('problem.network')} ${d.location.network + 1}${d.location.box ? ` · ${d.location.box}` : ''}${d.location.pin ? `.${d.location.pin}` : ''}`
                : d.location.part === 'code'
                  ? `${d.location.block ?? ''} ${t('problem.line')} ${d.start.line}`
                  : d.location.part === 'interface'
                    ? `${d.location.block} · ${d.location.section} ${t('problem.row')} ${(d.location.row ?? 0) + 1}`
                    : d.location.part === 'tags'
                      ? `${t('program.tags')} ${t('problem.row')} ${(d.location.row ?? 0) + 1}`
                      : (d.location.block ?? t('problem.project'))}
            </span>
            {d.message}
          </button>
        ))
      )}
    </div>
  );
}
