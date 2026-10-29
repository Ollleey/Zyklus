import { useState } from 'react';
import type { Block, GlobalDb, InstanceDb, PlcProject } from '@zyklus/sim-core';
import { t } from '../i18n';
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
];

interface Props {
  project: PlcProject;
  onChange: (p: PlcProject) => void;
  /** eigene FBs als "Name" – mögliche Typen für Instanz-DBs */
  userFbs?: string[];
}

function nextNumber(blocks: Block[]): number {
  const used = new Set(
    blocks.filter((b) => b.kind === 'DB' || b.kind === 'IDB').map((b) => b.number),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function uniqueName(blocks: Block[], base: string): string {
  const taken = new Set(blocks.map((b) => b.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`.toLowerCase())) return `${base}_${n}`;
}

/** Datenbausteine der CPU: Global-DBs mit Variablen, Instanz-DBs für Zeiten, Zähler, Flanken. */
export function DbPanel({ project, onChange, userFbs = [] }: Props) {
  const dbs = project.blocks.filter(
    (b): b is GlobalDb | InstanceDb => b.kind === 'DB' || b.kind === 'IDB',
  );
  // DB-Nummer als stabiler Schlüssel, damit Umbenennen den Fokus nicht verliert
  const [open, setOpen] = useState<number | null>(dbs[0]?.number ?? null);

  const replace = (db: GlobalDb | InstanceDb, next: Block | null) =>
    onChange({
      ...project,
      blocks: next
        ? project.blocks.map((b) => (b === db ? next : b))
        : project.blocks.filter((b) => b !== db),
    });

  const add = (block: GlobalDb | InstanceDb) => {
    onChange({ ...project, blocks: [...project.blocks, block] });
    setOpen(block.number);
  };

  return (
    <div className="db-panel">
      <div className="db-actions">
        <button
          className="btn btn-small"
          onClick={() =>
            add({
              kind: 'DB',
              name: uniqueName(project.blocks, 'Daten'),
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
              name: uniqueName(project.blocks, 'IEC_Timer_0_DB'),
              number: nextNumber(project.blocks),
              of: 'IEC_TIMER',
            })
          }
        >
          + {t('db.addInstance')}
        </button>
      </div>
      {dbs.map((db) => (
        <section key={db.number} className={`db ${open === db.number ? 'db-open' : ''}`}>
          <header onClick={() => setOpen(open === db.number ? null : db.number)}>
            <span className="db-caret">{open === db.number ? '▾' : '▸'}</span>
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
          {open === db.number &&
            (db.kind === 'IDB' ? (
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
                  <optgroup label={t('db.systemTypes')}>
                    {INSTANCE_TYPES.map((ty) => (
                      <option key={ty}>{ty}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
            ) : (
              <VarTable
                rows={db.vars}
                types={[...ELEMENTARY_TYPES, ...INSTANCE_TYPES]}
                onChange={(vars) => replace(db, { ...db, vars })}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
