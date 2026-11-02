import { useEffect, useMemo, useState } from 'react';
import {
  MAIN_OB,
  OB_NUMBERS,
  SECTIONS_BY_KIND,
  moduleType,
  type Block,
  type CodeBlock,
  type IfaceSection,
  type ObEvent,
  type PlcProject,
  type Solution,
} from '@zyklus/sim-core';
import { formatDiagnostic, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import type { CpuCompileResult } from '@zyklus/levels';
import { t } from '../i18n';
import { setCompletionSymbols } from '../monaco-setup';
import { formatValue, useBoolFormat } from '../state/prefs';
import { updateProject } from '../state/edit';
import { emptyFup, isFupBody } from '@zyklus/fup-model';
import { DbPanel, INSTANCE_TYPES, udtNames } from './DbPanel';
import { FupEditor } from './FupEditor';
import { SclEditor } from './SclEditor';
import { TagTable } from './TagTable';
import { ELEMENTARY_TYPES, VarTable } from './VarTable';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type Tab = 'main' | 'tags' | 'dbs';

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
}

const REF_RE = /"([^"]+)"(?:\.([A-Za-z_][A-Za-z0-9_]*))?|#([A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*)/g;

const isCode = (b: Block): b is CodeBlock => b.kind === 'OB' || b.kind === 'FB' || b.kind === 'FC';

/** Anzeige wie im Projektbaum: „Main [OB1]“, „PI [FB1]“ */
export const blockLabel = (b: CodeBlock) => `${b.name} [${b.kind}${b.number}]`;

type NewBlock = 'FB' | 'FC' | 'cyclic' | 'process' | 'startup';

/** Neuer Codebaustein mit freier Nummer und freiem Namen (wie „Neuen Baustein hinzufügen“). */
function newBlock(blocks: Block[], what: NewBlock): CodeBlock {
  const code = blocks.filter(isCode);
  const taken = new Set(blocks.map((b) => b.name.toLowerCase()));
  const kind = what === 'FB' || what === 'FC' ? what : 'OB';
  let number =
    what === 'cyclic' || what === 'process' || what === 'startup' ? OB_NUMBERS[what][0] : 1;
  while (code.some((b) => b.kind === kind && b.number === number)) number++;
  const base =
    what === 'cyclic'
      ? 'Weckalarm'
      : what === 'process'
        ? 'Prozessalarm'
        : what === 'startup'
          ? 'Startup'
          : `${kind}_${number}`;
  let name = base;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base}_${n}`;
  const event: ObEvent | undefined =
    what === 'cyclic'
      ? { kind: 'cyclic', intervalMs: 100, phaseMs: 0 }
      : what === 'process'
        ? { kind: 'process', input: '%I0.0', edge: 'rising' }
        : what === 'startup'
          ? { kind: 'startup' }
          : undefined;
  const iface = Object.fromEntries(SECTIONS_BY_KIND[kind].map((s) => [s, []]));
  return { kind, name, number, lang: 'SCL', iface, source: '', ...(event ? { event } : {}) };
}

export function ProgramPanel({ solution, compiled, onChange, watch }: Props) {
  const boolFormat = useBoolFormat();
  const cpus = solution.modules.filter((m) => moduleType(m.type).kind === 'cpu');
  const [cpuId, setCpuId] = useState<string | undefined>(cpus[0]?.id);
  const [tab, setTab] = useState<Tab>('main');
  const [blockName, setBlockName] = useState<string>(MAIN_OB);
  const [showIface, setShowIface] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [jump, setJump] = useState<{ line: number; col: number; nonce: number }>();
  const [fupFocus, setFupFocus] = useState<{ network?: number; box?: string; nonce: number }>();

  useEffect(() => {
    if (!cpus.some((c) => c.id === cpuId)) setCpuId(cpus[0]?.id);
  }, [cpus, cpuId]);

  const project = cpuId ? solution.projects[cpuId] : undefined;
  const result = cpuId ? compiled.get(cpuId) : undefined;
  const diagnostics = result?.diagnostics ?? [];
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

  const userFbs = codeBlocks.filter((b) => b.kind === 'FB').map((b) => `"${b.name}"`);
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
        <span className="tab-spacer" />
        {result && (
          <span
            className={`size-meter ${result.used > result.limit ? 'size-over' : ''}`}
            title={
              result.lang === 'FUP' ? `${result.size} ${t('program.boxes')}` : t('program.memory')
            }
          >
            <span className="size-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (100 * result.used) / result.limit)}%` }} />
            </span>
            <span>
              <b>
                {result.used} / {result.limit}
              </b>{' '}
              {result.lang === 'FUP' ? t('program.networks') : t('program.statements')}
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
              onChange={(e) => e.target.value && addBlock(e.target.value as NewBlock)}
              aria-label={t('block.add')}
            >
              <option value="">+ {t('block.add')}</option>
              <option value="FB">{t('block.add.fb')}</option>
              <option value="FC">{t('block.add.fc')}</option>
              <option value="cyclic">{t('block.add.cyclic')}</option>
              <option value="process">{t('block.add.process')}</option>
              <option value="startup">{t('block.add.startup')}</option>
            </select>
            {block.name !== MAIN_OB && (
              <>
                <input
                  className="block-name"
                  value={block.name}
                  onChange={(e) => rename(e.target.value)}
                  spellCheck={false}
                  aria-label={t('table.name')}
                />
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
          {block.event && (
            <EventEditor
              event={block.event}
              onChange={(event) => changeBlock((b) => ({ ...b, event }))}
            />
          )}
          <div className="iface iface-bar">
            <div className="lang-switch" role="radiogroup" aria-label="Sprache">
              {(['SCL', 'FUP'] as const).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={block.lang === l}
                  className={`lang ${block.lang === l ? 'lang-active' : ''}`}
                  onClick={() =>
                    changeBlock((b) => ({
                      ...b,
                      lang: l,
                      fup: l === 'FUP' && !isFupBody(b.fup) ? emptyFup() : b.fup,
                    }))
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            <button className="iface-toggle" onClick={() => setShowIface(!showIface)}>
              {showIface ? '▾' : '▸'} {t('program.interface')}{' '}
              <span className="muted">
                {sections.map((s) => `${s} ${block.iface[s]?.length ?? 0}`).join(' · ')}
              </span>
            </button>
            {showIface && (
              <div className="iface-sections">
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
                            ]
                          : [...ELEMENTARY_TYPES, ...udtNames(project)]
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          {block.lang === 'FUP' ? (
            <FupEditor
              key={block.name}
              project={project}
              block={block}
              diagnostics={diagnostics.filter((d) => d.location.block === block.name)}
              onChange={(p) => change(() => p)}
              focus={fupFocus}
            />
          ) : (
            <SclEditor
              live={
                watch &&
                ((line) => {
                  const code = line.replace(/\/\/.*$/, '');
                  const parts: string[] = [];
                  const seen = new Set<string>();
                  for (const m of code.matchAll(REF_RE)) {
                    const [all, name, member, local] = m;
                    if (seen.has(all) || parts.length >= 4) continue;
                    seen.add(all);
                    const isDb =
                      !!member ||
                      project.blocks.some(
                        (b) =>
                          b.name === name && b.kind !== 'OB' && b.kind !== 'FB' && b.kind !== 'FC',
                      );
                    const v = local
                      ? block.kind === 'OB'
                        ? watch(cpuId, {
                            local,
                            block: block.name === MAIN_OB ? undefined : block.name,
                          })
                        : undefined
                      : isDb && member
                        ? watch(cpuId, { db: name, member })
                        : watch(cpuId, { tag: name });
                    if (v === undefined) continue;
                    parts.push(
                      `${local ? `#${local}` : member ? `${name}.${member}` : name} = ${formatValue(v, boolFormat, typeof v === 'number' && !Number.isInteger(v) ? 2 : 0)}`,
                    );
                  }
                  return parts.length ? parts.join('   ') : undefined;
                })
              }
              key={block.name}
              value={block.source}
              onChange={(source) => changeBlock((b) => ({ ...b, source }))}
              diagnostics={diagnostics.filter(
                (d) => d.location.part === 'code' && d.location.block === block.name,
              )}
              jump={jump}
            />
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
  if (event.kind === 'startup') {
    return (
      <div className="event-bar">
        <span className="event-kind">Anlauf (OB100)</span>
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
                ? `NW ${d.location.network + 1}${d.location.box ? ` · ${d.location.box}` : ''}${d.location.pin ? `.${d.location.pin}` : ''}`
                : d.location.part === 'code'
                  ? `${d.location.block ?? ''} Z. ${d.start.line}`
                  : d.location.part === 'interface'
                    ? `${d.location.block} · ${d.location.section} Zeile ${(d.location.row ?? 0) + 1}`
                    : d.location.part === 'tags'
                      ? `Variablen Zeile ${(d.location.row ?? 0) + 1}`
                      : (d.location.block ?? 'Projekt')}
            </span>
            {formatDiagnostic(d).replace(/^(Fehler|Warnung) in Zeile \d+, Spalte \d+: /, '')}
          </button>
        ))
      )}
    </div>
  );
}
