import { useMemo, useState } from 'react';
import { byteLength, parseAddress, type PlcProject } from '@zyklus/sim-core';
import type { CallRef, XRef } from '@zyklus/scl-compiler';
import { t } from '../i18n';

interface Props {
  project: PlcProject;
  xref: XRef[];
  calls: CallRef[];
  /** Klick auf eine Stelle: Baustein öffnen und zur Zeile springen */
  onJump: (block: string, line: number) => void;
}

type View = 'xref' | 'calls' | 'assign';

/** Querverweisliste, Aufrufstruktur und Zuordnungsliste wie in TIA */
export function CrossRefPanel({ project, xref, calls, onJump }: Props) {
  const [view, setView] = useState<View>('xref');
  const [filter, setFilter] = useState('');
  return (
    <div className="xref-panel">
      <div className="segmented xref-views" role="group">
        {(
          [
            ['xref', t('xref.list')],
            ['calls', t('xref.calls')],
            ['assign', t('xref.assign')],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            className={`seg ${view === v ? 'seg-active' : ''}`}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
        {view === 'xref' && (
          <input
            className="xref-filter"
            value={filter}
            placeholder={t('xref.filter')}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
      {view === 'xref' && <XrefList xref={xref} filter={filter} onJump={onJump} />}
      {view === 'calls' && <CallTree project={project} calls={calls} onJump={onJump} />}
      {view === 'assign' && <AssignmentList project={project} xref={xref} />}
    </div>
  );
}

function XrefList({
  xref,
  filter,
  onJump,
}: {
  xref: XRef[];
  filter: string;
  onJump: Props['onJump'];
}) {
  // nach Symbol gruppiert; lokale Variablen je Baustein
  const groups = useMemo(() => {
    const m = new Map<string, XRef[]>();
    for (const x of xref) {
      const key = x.symbol.startsWith('#') ? `${x.symbol} (${x.block})` : x.symbol;
      if (filter && !key.toLowerCase().includes(filter.toLowerCase())) continue;
      const list = m.get(key) ?? [];
      list.push(x);
      m.set(key, list);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [xref, filter]);
  if (!groups.length) return <p className="empty">{t('xref.none')}</p>;
  return (
    <table className="var-table xref-table">
      <thead>
        <tr>
          <th>{t('xref.symbol')}</th>
          <th>{t('table.address')}</th>
          <th>{t('xref.where')}</th>
          <th>{t('xref.access')}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(([symbol, list]) => {
          const writes = list.filter((x) => x.access === 'w').length;
          return list.map((x, i) => (
            <tr key={`${symbol}|${i}`} className={i === 0 ? 'xref-first' : ''}>
              <td>
                {i === 0 && (
                  <>
                    <code>{symbol}</code>
                    {writes > 1 && (
                      <span className="xref-multi" title={t('xref.multi')}>
                        {' '}
                        ✎{writes}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td>{i === 0 && x.address ? <code>{x.address}</code> : ''}</td>
              <td>
                <button className="link-btn" onClick={() => onJump(x.block, x.line)}>
                  {x.block} Z. {x.line}
                </button>
              </td>
              <td className={x.access === 'w' ? 'xref-w' : 'xref-r'}>
                {x.access === 'w' ? t('xref.write') : t('xref.read')}
              </td>
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

function CallTree({
  project,
  calls,
  onJump,
}: {
  project: PlcProject;
  calls: CallRef[];
  onJump: Props['onJump'];
}) {
  const obs = project.blocks.filter((b) => b.kind === 'OB');
  const of = (block: string) => calls.filter((c) => c.from === block);
  const node = (c: CallRef, depth: number, seen: Set<string>): React.ReactNode => {
    const user = project.blocks.find(
      (b) => b.name === c.to && (b.kind === 'FB' || b.kind === 'FC'),
    );
    return (
      <li key={`${c.from}|${c.to}|${c.instance ?? ''}|${c.line}`}>
        <button className="link-btn" onClick={() => onJump(c.from, c.line)}>
          {user ? `${user.name} [${user.kind}${user.number}]` : c.to}
        </button>
        {c.instance && <span className="muted">, {c.instance}</span>}
        {user && !seen.has(user.name) && depth < 8 && of(user.name).length > 0 && (
          <ul>{of(user.name).map((x) => node(x, depth + 1, new Set([...seen, user.name])))}</ul>
        )}
      </li>
    );
  };
  return (
    <ul className="call-tree">
      {obs.map((ob) => (
        <li key={ob.name}>
          <b>
            {ob.name} [OB{ob.number}]
          </b>
          {of(ob.name).length > 0 ? (
            <ul>{of(ob.name).map((c) => node(c, 1, new Set([ob.name])))}</ul>
          ) : (
            <span className="muted"> – {t('xref.noCalls')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface BitUse {
  tags: string[];
  used: boolean;
}

function AssignmentList({ project, xref }: { project: PlcProject; xref: XRef[] }) {
  const rows = useMemo(() => {
    // Bereich+Byte → 8 Bits
    const bytes = new Map<string, BitUse[]>();
    const mark = (address: string, tag: string | undefined, used: boolean) => {
      let a;
      try {
        a = parseAddress(address);
      } catch {
        return;
      }
      const n = byteLength(a.size);
      for (let k = 0; k < n; k++) {
        const key = `${a.area}|${a.byte + k}`;
        const bits = bytes.get(key) ?? Array.from({ length: 8 }, () => ({ tags: [], used: false }));
        const which = a.size === 'X' ? [a.bit] : [0, 1, 2, 3, 4, 5, 6, 7];
        for (const b of which) {
          if (tag && !bits[b]!.tags.includes(tag)) bits[b]!.tags.push(tag);
          if (used) bits[b]!.used = true;
        }
        bytes.set(key, bits);
      }
    };
    for (const tg of project.tags) mark(tg.address, tg.name, false);
    for (const x of xref) if (x.address) mark(x.address, undefined, true);
    const order = { I: 0, Q: 1, M: 2 } as Record<string, number>;
    return [...bytes]
      .map(([k, bits]) => {
        const [area, byte] = k.split('|') as [string, string];
        return { area, byte: Number(byte), bits };
      })
      .sort((a, b) => order[a.area]! - order[b.area]! || a.byte - b.byte);
  }, [project, xref]);
  if (!rows.length) return <p className="empty">{t('xref.none')}</p>;
  return (
    <table className="var-table assign-table">
      <thead>
        <tr>
          <th>Byte</th>
          {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => (
            <th key={b}>{b}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.area}${r.byte}`}>
            <td>
              <code>
                %{r.area}B{r.byte}
              </code>
            </td>
            {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => {
              const u = r.bits[b]!;
              const cls = u.used ? 'assign-used' : u.tags.length ? 'assign-tag' : '';
              return (
                <td
                  key={b}
                  className={`assign-bit ${cls}`}
                  title={[`%${r.area}${r.byte}.${b}`, ...u.tags, u.used ? t('xref.usedInCode') : '']
                    .filter(Boolean)
                    .join('\n')}
                >
                  {u.used ? '■' : u.tags.length ? '□' : ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
