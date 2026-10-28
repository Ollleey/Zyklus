import { useEffect, useMemo, useState } from 'react';
import {
  MAIN_OB,
  moduleType,
  type CodeBlock,
  type IfaceSection,
  type PlcProject,
  type Solution,
} from '@zyklus/sim-core';
import { formatDiagnostic, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import type { CpuCompileResult } from '@zyklus/levels';
import { t } from '../i18n';
import { setCompletionSymbols } from '../monaco-setup';
import { updateProject } from '../state/edit';
import { emptyFup, isFupBody } from '@zyklus/fup-model';
import { DbPanel } from './DbPanel';
import { FupEditor } from './FupEditor';
import { SclEditor } from './SclEditor';
import { TagTable } from './TagTable';
import { VarTable } from './VarTable';

type Tab = 'main' | 'tags' | 'dbs';

interface Props {
  solution: Solution;
  compiled: Map<string, CpuCompileResult>;
  onChange: (s: Solution) => void;
}

function mainBlock(p: PlcProject): CodeBlock | undefined {
  return p.blocks.find((b): b is CodeBlock => b.kind === 'OB' && b.name === MAIN_OB);
}

export function ProgramPanel({ solution, compiled, onChange }: Props) {
  const cpus = solution.modules.filter((m) => moduleType(m.type).kind === 'cpu');
  const [cpuId, setCpuId] = useState<string | undefined>(cpus[0]?.id);
  const [tab, setTab] = useState<Tab>('main');
  const [showIface, setShowIface] = useState(false);
  const [jump, setJump] = useState<{ line: number; col: number; nonce: number }>();
  const [fupFocus, setFupFocus] = useState<{ network?: number; box?: string; nonce: number }>();

  useEffect(() => {
    if (!cpus.some((c) => c.id === cpuId)) setCpuId(cpus[0]?.id);
  }, [cpus, cpuId]);

  const project = cpuId ? solution.projects[cpuId] : undefined;
  const result = cpuId ? compiled.get(cpuId) : undefined;
  const diagnostics = result?.diagnostics ?? [];

  // Autovervollständigung mit Variablen und Datenbausteinen der gewählten CPU
  useEffect(() => {
    if (!project) return;
    const main = mainBlock(project);
    setCompletionSymbols([
      ...project.tags.map((tg) => ({
        label: `"${tg.name}"`,
        detail: `${tg.address}`,
        insert: `"${tg.name}"`,
      })),
      ...project.blocks
        .filter((b) => b.kind === 'DB' || b.kind === 'IDB')
        .map((b) => ({
          label: `"${b.name}"`,
          detail: b.kind === 'IDB' ? b.of : 'Global-DB',
          insert: `"${b.name}"`,
        })),
      ...Object.values(main?.iface ?? {})
        .flat()
        .map((v) => ({ label: `#${v!.name}`, detail: v!.type, insert: `#${v!.name}` })),
    ]);
  }, [project]);

  const errorRows = useMemo(() => {
    const rows = new Map<string, Set<number>>();
    for (const d of diagnostics) {
      if (d.severity !== 'error' || d.location.row === undefined) continue;
      const key = d.location.part === 'tags' ? 'tags' : `${d.location.section}`;
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

  const main = mainBlock(project);
  const change = (f: (p: PlcProject) => PlcProject) => onChange(updateProject(solution, cpuId, f));
  const changeMain = (f: (b: CodeBlock) => CodeBlock) =>
    change((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b === mainBlock(p) ? f(b as CodeBlock) : b)),
    }));
  const setSection = (s: IfaceSection, rows: CodeBlock['iface'][IfaceSection]) =>
    changeMain((b) => ({ ...b, iface: { ...b.iface, [s]: rows } }));

  const counts = {
    main: diagnostics.filter((d) => d.location.part === 'code' || d.location.part === 'interface')
      .length,
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
          {t('program.main')}
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
          <span className={`size ${result.used > result.limit ? 'size-over' : ''}`}>
            {result.lang === 'FUP'
              ? `${result.size} Boxen · ${result.used} / ${result.limit} Netzwerke`
              : `${result.used} / ${result.limit} ${t('program.statements')}`}
          </span>
        )}
      </div>

      {tab === 'main' && main && (
        <div className="main-block">
          <div className="iface iface-bar">
            <div className="lang-switch" role="radiogroup" aria-label="Sprache">
              {(['SCL', 'FUP'] as const).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={main.lang === l}
                  className={`lang ${main.lang === l ? 'lang-active' : ''}`}
                  onClick={() =>
                    changeMain((b) => ({
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
                Temp {main.iface.Temp?.length ?? 0} · Constant {main.iface.Constant?.length ?? 0}
              </span>
            </button>
            {showIface && (
              <div className="iface-sections">
                {(['Temp', 'Constant'] as const).map((s) => (
                  <div key={s} className="iface-section">
                    <h4>{s}</h4>
                    <VarTable
                      rows={main.iface[s] ?? []}
                      onChange={(rows) => setSection(s, rows)}
                      errorRows={errorRows.get(s)}
                      withInit={s === 'Constant'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          {main.lang === 'FUP' ? (
            <FupEditor
              project={project}
              block={main}
              diagnostics={diagnostics.filter((d) => d.location.block === MAIN_OB)}
              onChange={(p) => change(() => p)}
              focus={fupFocus}
            />
          ) : (
            <SclEditor
              value={main.source}
              onChange={(source) => changeMain((b) => ({ ...b, source }))}
              diagnostics={diagnostics.filter(
                (d) => d.location.part === 'code' && d.location.block === MAIN_OB,
              )}
              jump={jump}
            />
          )}
        </div>
      )}
      {tab === 'tags' && (
        <div className="scroll">
          <TagTable
            tags={project.tags}
            onChange={(tags) => change((p) => ({ ...p, tags }))}
            errorRows={errorRows.get('tags')}
          />
        </div>
      )}
      {tab === 'dbs' && (
        <div className="scroll">
          <DbPanel project={project} onChange={(p) => change(() => p)} />
        </div>
      )}

      <Problems
        diagnostics={diagnostics}
        onJump={(d) => {
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
          } else if (d.location.block && d.location.block !== MAIN_OB) {
            setTab('dbs');
          }
        }}
      />
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
