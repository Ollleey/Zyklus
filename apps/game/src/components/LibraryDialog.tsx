import { useState } from 'react';
import type { CodeBlock, PlcProject } from '@zyklus/sim-core';
import { t } from '../i18n';
import { latestEntries, listLibrary, removeFromLibrary, type LibraryEntry } from '../state/library';

interface Props {
  /** aktuelles Projekt: zeigt, welche Version es schon enthält */
  project?: PlcProject;
  onInsert: (e: LibraryEntry) => void;
  onClose: () => void;
}

/** Stand eines Bibliothekseintrags im Projekt: fehlt, gleiche, ältere oder fremde Version */
function inProject(project: PlcProject | undefined, e: LibraryEntry) {
  if (!project) return undefined;
  if (e.kind === 'type') {
    return (project.types ?? []).some((t) => t.name.toLowerCase() === e.name.toLowerCase())
      ? ('own' as const)
      : undefined;
  }
  const b = project.blocks.find(
    (x): x is CodeBlock =>
      (x.kind === 'FB' || x.kind === 'FC') && x.name.toLowerCase() === e.name.toLowerCase(),
  );
  if (!b) return undefined;
  if (!b.library) return 'own' as const;
  return b.library.version < e.version ? ('older' as const) : ('current' as const);
}

/** Eigene Bibliothek: Bausteine und Datentypen einfügen bzw. aktualisieren oder entfernen */
export function LibraryDialog({ project, onInsert, onClose }: Props) {
  const [entries, setEntries] = useState(() => latestEntries());
  const versions = (e: LibraryEntry) =>
    listLibrary().filter((x) => x.kind === e.kind && x.name === e.name).length;
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog library-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('library.title')}
      >
        <h2>{t('library.title')}</h2>
        {entries.length === 0 ? (
          <p className="muted">{t('library.empty')}</p>
        ) : (
          <table className="var-table">
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.kind}:${e.name}`}>
                  <td className="mono">{e.name}</td>
                  <td className="muted">
                    {e.kind === 'block' ? e.block.kind : 'UDT'} · v{e.version}
                    {versions(e) > 1 ? ` (${versions(e)} ${t('library.versions')})` : ''}
                  </td>
                  <td className="muted">{e.from ?? ''}</td>
                  <td className="muted">
                    {(() => {
                      const st = inProject(project, e);
                      return st === 'current'
                        ? t('library.inProject')
                        : st === 'older'
                          ? t('library.newer')
                          : st === 'own'
                            ? t('library.sameName')
                            : '';
                    })()}
                  </td>
                  <td>
                    <button className="btn btn-small" onClick={() => onInsert(e)}>
                      {inProject(project, e) ? t('library.update') : t('library.insert')}
                    </button>{' '}
                    <button
                      className="icon-btn"
                      title={t('library.remove')}
                      onClick={() => {
                        removeFromLibrary(e.kind, e.name);
                        setEntries(latestEntries());
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">{t('library.hint')}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            {t('result.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
