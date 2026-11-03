import { useState } from 'react';
import type { Block, CodeBlock, GlobalDb, InstanceDb, PlcProject, PlcType } from '@zyklus/sim-core';
import { LIBRARY, libraryBlock } from '@zyklus/scl-compiler';
import { t } from '../i18n';
import { showNotice } from '../state/commands';
import { addToLibrary } from '../state/library';
import { ELEMENTARY_TYPES, VarTable } from './VarTable';

export const INSTANCE_TYPES = [
  'IEC_TIMER',
  'IEC_COUNTER',
  'TON_TIME',
  'TOF_TIME',
  'TP_TIME',
  'TONR_TIME',
  'CTU_INT',
  'CTD_INT',
  'CTUD_INT',
  'R_TRIG',
  'F_TRIG',
  'TSEND_C',
  'TRCV_C',
  'PUT',
  'GET',
];

interface Props {
  project: PlcProject;
  onChange: (p: PlcProject) => void;
  /** eigene FBs als "Name" – mögliche Typen für Instanz-DBs */
  userFbs?: string[];
  /** Zeilen mit Fehlern je `Baustein:Bereich` */
  errorRows?: Map<string, Set<number>>;
}

/** PLC-Datentypen als "Name" für die Typvorschläge */
export function udtNames(project: PlcProject, except?: string): string[] {
  return (project.types ?? []).filter((t) => t.name !== except).map((t) => `"${t.name}"`);
}

function nextNumber(blocks: Block[]): number {
  const used = new Set(
    blocks.filter((b) => b.kind === 'DB' || b.kind === 'IDB').map((b) => b.number),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function uniqueName(project: PlcProject, base: string): string {
  const taken = new Set(
    [...project.blocks, ...(project.types ?? [])].map((b) => b.name.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`.toLowerCase())) return `${base}_${n}`;
}

/**
 * Datenbausteine der CPU: Global-DBs mit Variablen, Instanz-DBs für Zeiten, Zähler, Flanken;
 * darunter die PLC-Datentypen (eigene Strukturen).
 */
export function DbPanel({ project, onChange, userFbs = [], errorRows }: Props) {
  const dbs = project.blocks.filter(
    (b): b is GlobalDb | InstanceDb => b.kind === 'DB' || b.kind === 'IDB',
  );
  const types = project.types ?? [];
  const own = new Set(project.blocks.map((b) => b.name.toLowerCase()));
  const libFbs = LIBRARY.filter((b) => !own.has(b.name.toLowerCase())).map((b) => `"${b.name}"`);
  // DB-Nummer bzw. Position als stabiler Schlüssel, damit Umbenennen den Fokus nicht verliert
  const [open, setOpen] = useState<string | null>(dbs[0] ? `db${dbs[0].number}` : null);
  const toggle = (key: string) => setOpen(open === key ? null : key);
  const udts = udtNames(project);

  const setTypes = (next: PlcType[]) => onChange({ ...project, types: next });

  const replace = (db: GlobalDb | InstanceDb, next: Block | null) =>
    onChange({
      ...project,
      blocks: next
        ? project.blocks.map((b) => (b === db ? next : b))
        : project.blocks.filter((b) => b !== db),
    });

  const add = (block: GlobalDb | InstanceDb) => {
    onChange({ ...project, blocks: [...project.blocks, block] });
    setOpen(`db${block.number}`);
  };

  return (
    <div className="db-panel">
      <div className="db-actions">
        <button
          className="btn btn-small"
          onClick={() =>
            add({
              kind: 'DB',
              name: uniqueName(project, 'Daten'),
              number: nextNumber(project.blocks),
              vars: [],
            })
          }
        >
          + {t('db.addGlobal')}
        </button>
        <button
          className="btn btn-small"
          onClick={() =>
            add({
              kind: 'IDB',
              name: uniqueName(project, 'IEC_Timer_0_DB'),
              number: nextNumber(project.blocks),
              of: 'IEC_TIMER',
            })
          }
        >
          + {t('db.addInstance')}
        </button>
        <button
          className="btn btn-small"
          onClick={() => {
            setTypes([...types, { name: uniqueName(project, 'Datentyp'), fields: [] }]);
            setOpen(`type${types.length}`);
          }}
        >
          + {t('db.addType')}
        </button>
      </div>
      {dbs.map((db) => (
        <section key={db.number} className={`db ${open === `db${db.number}` ? 'db-open' : ''}`}>
          <header onClick={() => toggle(`db${db.number}`)}>
            <span className="db-caret">{open === `db${db.number}` ? '▾' : '▸'}</span>
            <input
              className="db-name"
              value={db.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => replace(db, { ...db, name: e.target.value })}
              spellCheck={false}
            />
            <span className="db-kind">
              [DB{db.number}] {db.kind === 'IDB' ? db.of : 'Global-DB'}
            </span>
            <button
              className="icon-btn"
              title={t('db.delete')}
              onClick={(e) => {
                e.stopPropagation();
                replace(db, null);
              }}
            >
              ✕
            </button>
          </header>
          {open === `db${db.number}` &&
            (db.kind === 'IDB' ? (
              <>
                <label className="db-type">
                  {t('db.instanceOf')}{' '}
                  <select
                    value={INSTANCE_TYPES.includes(db.of) ? db.of : `"${db.of.replace(/"/g, '')}"`}
                    onChange={(e) => replace(db, { ...db, of: e.target.value.replace(/"/g, '') })}
                  >
                    {userFbs.length > 0 && (
                      <optgroup label={t('db.userFbs')}>
                        {userFbs.map((ty) => (
                          <option key={ty}>{ty}</option>
                        ))}
                      </optgroup>
                    )}
                    {libFbs.length > 0 && (
                      <optgroup label={t('db.library')}>
                        {libFbs.map((ty) => (
                          <option key={ty}>{ty}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={t('db.systemTypes')}>
                      {INSTANCE_TYPES.map((ty) => (
                        <option key={ty}>{ty}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <IdbConfig project={project} db={db} onChange={(next) => replace(db, next)} />
              </>
            ) : (
              <VarTable
                rows={db.vars}
                types={[...ELEMENTARY_TYPES, ...udts, ...INSTANCE_TYPES]}
                withRetain
                errorRows={errorRows?.get(`${db.name}:Static`)}
                onChange={(vars) => replace(db, { ...db, vars })}
              />
            ))}
        </section>
      ))}
      {types.length > 0 && <h4 className="db-group">{t('db.types')}</h4>}
      {types.map((ty, i) => (
        <section key={`type${i}`} className={`db ${open === `type${i}` ? 'db-open' : ''}`}>
          <header onClick={() => toggle(`type${i}`)}>
            <span className="db-caret">{open === `type${i}` ? '▾' : '▸'}</span>
            <input
              className="db-name"
              value={ty.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                setTypes(types.map((x) => (x === ty ? { ...ty, name: e.target.value } : x)))
              }
              spellCheck={false}
            />
            <span className="db-kind">{t('db.typeKind')}</span>
            <button
              className="icon-btn"
              title={t('library.save')}
              onClick={(e) => {
                e.stopPropagation();
                const v = addToLibrary(ty);
                showNotice(t('library.saved', { name: ty.name, version: v }));
              }}
            >
              📚
            </button>
            <button
              className="icon-btn"
              title={t('db.delete')}
              onClick={(e) => {
                e.stopPropagation();
                setTypes(types.filter((x) => x !== ty));
              }}
            >
              ✕
            </button>
          </header>
          {open === `type${i}` && (
            <VarTable
              rows={ty.fields}
              types={[...ELEMENTARY_TYPES, ...udtNames(project, ty.name)]}
              errorRows={errorRows?.get(`${ty.name}:Static`)}
              onChange={(fields) => setTypes(types.map((x) => (x === ty ? { ...ty, fields } : x)))}
            />
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * Konfiguration eines Instanz-DBs eines eigenen FB oder Technologiebausteins: Startwerte der
 * Eingänge und statischen Daten (bei Technologiebausteinen nur die beschriebenen Parameter).
 */
function IdbConfig({
  project,
  db,
  onChange,
}: {
  project: PlcProject;
  db: InstanceDb;
  onChange: (db: InstanceDb) => void;
}) {
  const name = db.of.replace(/"/g, '').toLowerCase();
  const own = project.blocks.find(
    (b): b is CodeBlock => b.kind === 'FB' && b.name.toLowerCase() === name,
  );
  const fb = own ?? libraryBlock(name);
  if (!fb) return null;
  const rows = fb.protected
    ? (fb.iface.Static ?? []).filter((r) => r.comment)
    : [...(fb.iface.Input ?? []), ...(fb.iface.Static ?? [])].filter(
        (r) => !r.type.includes('"') && !INSTANCE_TYPES.includes(r.type.toUpperCase()),
      );
  if (!rows.length) return null;
  const start = db.start ?? {};
  const set = (key: string, value: string) => {
    const next = { ...start };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    const { start: _, ...rest } = db;
    onChange(Object.keys(next).length ? { ...rest, start: next } : rest);
  };
  return (
    <div className="idb-config">
      <h4>{t('db.config')}</h4>
      <table className="var-table">
        <thead>
          <tr>
            <th>{t('table.name')}</th>
            <th>{t('table.type')}</th>
            <th>{t('db.default')}</th>
            <th>{t('db.startValue')}</th>
            <th>{t('table.comment')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="mono">{r.name}</td>
              <td className="mono muted">{r.type}</td>
              <td className="mono muted">{r.init ?? '–'}</td>
              <td>
                <input
                  className="mono"
                  value={start[r.name] ?? ''}
                  placeholder={r.init ?? ''}
                  spellCheck={false}
                  aria-label={`${t('db.startValue')} ${r.name}`}
                  onChange={(e) => set(r.name, e.target.value)}
                />
              </td>
              <td className="muted">{r.comment ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
