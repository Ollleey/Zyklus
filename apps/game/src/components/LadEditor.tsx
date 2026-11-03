import { useMemo, useState } from 'react';
import type { Block, CodeBlock, PlcProject } from '@zyklus/sim-core';
import type { ProjectDiagnostic } from '@zyklus/scl-compiler';
import {
  boxSpec,
  callType,
  setCallSignatures,
  inputPins,
  isLadBody,
  outputPins,
  type CoilKind,
  type LadBody,
  type LadCoil,
  type LadNetwork,
  type LadNode,
} from '@zyklus/fup-model';
import { libraryFor, newInstanceName, nextDbNumber } from './FupEditor';

interface Props {
  project: PlcProject;
  block: CodeBlock;
  diagnostics: ProjectDiagnostic[];
  onChange: (p: PlcProject) => void;
  /** Beobachten: Wert eines Operanden (während der Simulation) */
  live?: (operand: string) => boolean | number | string | undefined;
}

/** Boxen, die sich in einen Strompfad setzen lassen */
const LAD_BOXES = [
  'TON',
  'TOF',
  'TP',
  'TONR',
  'CTU',
  'CTD',
  'R_TRIG',
  'F_TRIG',
  'CMP_EQ',
  'CMP_NE',
  'CMP_GT',
  'CMP_GE',
  'CMP_LT',
  'CMP_LE',
  'IN_RANGE',
  'MOVE',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
];

const COILS: [CoilKind, string, string][] = [
  ['=', '( )', 'Spule: Operand = Verknüpfungsergebnis'],
  ['/=', '(/)', 'negierte Spule'],
  ['S', '(S)', 'Setzen'],
  ['R', '(R)', 'Rücksetzen'],
  ['P', '(P)', 'Spule bei steigender Flanke (einen Zyklus)'],
  ['N', '(N)', 'Spule bei fallender Flanke (einen Zyklus)'],
];

type Sel = { network: number; id: string } | null;

// ---------- Baumoperationen (Elemente über ihre id) ----------

function mapItems(items: LadNode[], f: (items: LadNode[]) => LadNode[]): LadNode[] {
  return f(
    items.map((n) =>
      n.k === 'parallel' ? { ...n, branches: n.branches.map((b) => mapItems(b, f)) } : n,
    ),
  );
}

function insertAfter(items: LadNode[], id: string | undefined, node: LadNode): LadNode[] {
  if (!id) return [...items, node];
  let done = false;
  const out = mapItems(items, (list) => {
    const i = list.findIndex((n) => n.id === id);
    if (i < 0) return list;
    done = true;
    return [...list.slice(0, i + 1), node, ...list.slice(i + 1)];
  });
  return done ? out : [...items, node];
}

function removeNode(items: LadNode[], id: string): LadNode[] {
  return mapItems(items, (list) =>
    list
      .filter((n) => n.id !== id)
      .flatMap((n): LadNode[] => {
        if (n.k !== 'parallel') return [n];
        const branches = n.branches.filter((b) => b.length > 0);
        if (branches.length === 0) return [];
        if (branches.length === 1) return branches[0]!;
        return [{ ...n, branches }];
      }),
  );
}

function updateNode(items: LadNode[], id: string, f: (n: LadNode) => LadNode): LadNode[] {
  return mapItems(items, (list) => list.map((n) => (n.id === id ? f(n) : n)));
}

/** Element in einen Parallelzweig einpacken (neuer leerer Kontakt darunter) */
function wrapParallel(items: LadNode[], id: string, fresh: () => string): LadNode[] {
  return mapItems(items, (list) => {
    const i = list.findIndex((n) => n.id === id);
    if (i < 0) return list;
    const n = list[i]!;
    if (n.k === 'parallel') {
      return list.map((x) =>
        x === n
          ? { ...n, branches: [...n.branches, [{ k: 'contact', id: fresh(), operand: '' }]] }
          : x,
      );
    }
    const p: LadNode = {
      k: 'parallel',
      id: fresh(),
      branches: [[n], [{ k: 'contact', id: fresh(), operand: '' }]],
    };
    return [...list.slice(0, i), p, ...list.slice(i + 1)];
  });
}

function allIds(body: LadBody): Set<string> {
  const ids = new Set<string>();
  const walk = (items: LadNode[]) => {
    for (const n of items) {
      ids.add(n.id);
      if (n.k === 'parallel') n.branches.forEach(walk);
    }
  };
  for (const nw of body.lad) {
    ids.add(nw.id);
    walk(nw.items);
    nw.coils.forEach((c) => ids.add(c.id));
  }
  return ids;
}

/**
 * KOP-Editor wie im TIA-Portal: linke Stromschiene, Kontakte und Boxen in Reihe, Parallelzweige,
 * Spulen rechts. Element anklicken wählt es aus; die Werkzeugleiste fügt hinter der Auswahl ein.
 */
export function LadEditor({ project, block, diagnostics, onChange, live }: Props) {
  const body: LadBody = isLadBody(block.kop) ? block.kop : { lad: [] };
  // eigene FB/FC als Boxen (ohne den Baustein selbst)
  setCallSignatures(project);
  const ownBlocks = project.blocks.filter(
    (b): b is CodeBlock => (b.kind === 'FB' || b.kind === 'FC') && b.name !== block.name,
  );
  const [sel, setSel] = useState<Sel>(null);
  const [boxType, setBoxType] = useState('TON');

  const fresh = (() => {
    const ids = allIds(body);
    let n = 0;
    return (p = 'e') => {
      while (ids.has(`${p}${++n}`));
      ids.add(`${p}${n}`);
      return `${p}${n}`;
    };
  })();

  const setBody = (next: LadBody, extra: Block[] = []) =>
    onChange({
      ...project,
      blocks: [...project.blocks.map((b) => (b === block ? { ...block, kop: next } : b)), ...extra],
    });
  const setNetwork = (i: number, nw: LadNetwork, extra: Block[] = []) =>
    setBody({ lad: body.lad.map((x, k) => (k === i ? nw : x)) }, extra);

  const byId = useMemo(() => {
    const m = new Map<string, ProjectDiagnostic[]>();
    for (const d of diagnostics) {
      if (d.location.network === undefined || !d.location.box) continue;
      const k = `${d.location.network}:${d.location.box.replace(/~.*$/, '')}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [diagnostics]);
  const netErrors = (i: number) =>
    diagnostics.filter((d) => d.location.network === i && d.severity === 'error');

  /** Netzwerk der Auswahl bzw. das letzte */
  const target = sel?.network ?? Math.max(0, body.lad.length - 1);
  const nwT = body.lad[target];
  const selId = sel && sel.network === target ? sel.id : undefined;
  const isCoil = (id?: string) => !!id && !!nwT?.coils.some((c) => c.id === id);

  const insert = (node: LadNode, extra: Block[] = []) => {
    if (!nwT) return;
    setNetwork(
      target,
      { ...nwT, items: insertAfter(nwT.items, isCoil(selId) ? undefined : selId, node) },
      extra,
    );
    setSel({ network: target, id: node.id });
  };
  const addContact = (neg: boolean) =>
    insert({ k: 'contact', id: fresh('k'), operand: '', ...(neg ? { neg } : {}) });
  const addEdge = (dir: 'P' | 'N') =>
    insert({ k: 'edge', id: fresh('f'), operand: '', mem: '', dir });
  const addBox = () => {
    const spec = boxSpec(boxType);
    const extra: Block[] = [];
    let operand: string | undefined;
    if (spec.instanceType) {
      const name = newInstanceName(project.blocks, boxType);
      extra.push({
        kind: 'IDB',
        name,
        number: nextDbNumber(project.blocks),
        of: spec.instanceType,
      });
      operand = `"${name}"`;
    }
    insert(
      {
        k: 'box',
        id: fresh('b'),
        type: boxType,
        ...(operand ? { operand } : {}),
        inputs: {},
        outputs: {},
      },
      extra,
    );
  };
  const addCoil = (kind: CoilKind) => {
    if (!nwT) return;
    const c: LadCoil = {
      id: fresh('q'),
      kind,
      operand: '',
      ...(kind === 'P' || kind === 'N' ? { mem: '' } : {}),
    };
    setNetwork(target, { ...nwT, coils: [...nwT.coils, c] });
    setSel({ network: target, id: c.id });
  };
  const parallel = () => {
    if (!nwT || !selId || isCoil(selId)) return;
    setNetwork(target, { ...nwT, items: wrapParallel(nwT.items, selId, () => fresh('p')) });
  };
  const remove = () => {
    if (!nwT || !selId) return;
    setNetwork(target, {
      ...nwT,
      items: removeNode(nwT.items, selId),
      coils: nwT.coils.filter((c) => c.id !== selId),
    });
    setSel(null);
  };

  const value = (op: string | undefined) => (live && op?.trim() ? live(op.trim()) : undefined);

  /** Kontakt bzw. Box (Strompfad von links nach rechts) */
  const renderNode = (n: LadNode, i: number): React.ReactNode => {
    const selected = sel?.network === i && sel.id === n.id;
    const errs = byId.get(`${i}:${n.id}`) ?? [];
    const cls = `lad-el ${selected ? 'lad-sel' : ''} ${errs.length ? 'lad-err' : ''}`;
    const pick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSel({ network: i, id: n.id });
    };
    const upd = (f: (x: LadNode) => LadNode) =>
      setNetwork(i, { ...body.lad[i]!, items: updateNode(body.lad[i]!.items, n.id, f) });
    const title = errs.map((d) => d.message).join('\n');
    if (n.k === 'parallel') {
      return (
        <div
          key={n.id}
          className={`lad-par ${selected ? 'lad-sel' : ''}`}
          onClick={pick}
          title="Parallelzweig"
        >
          {n.branches.map((b, k) => (
            <div key={k} className="lad-branch">
              {b.map((x) => renderNode(x, i))}
              <span className="lad-wire" />
            </div>
          ))}
        </div>
      );
    }
    if (n.k === 'contact' || n.k === 'edge') {
      const v = value(n.operand);
      const on = typeof v === 'boolean' ? (n.k === 'contact' && n.neg ? !v : v) : undefined;
      return (
        <div key={n.id} className={cls} onClick={pick} title={title}>
          <input
            className="lad-op"
            value={n.operand}
            placeholder="<??.?>"
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => setSel({ network: i, id: n.id })}
            onChange={(e) => upd((x) => ({ ...x, operand: e.target.value }) as LadNode)}
          />
          <span className={`lad-contact ${on === true ? 'lad-on' : on === false ? 'lad-off' : ''}`}>
            ─┤{n.k === 'edge' ? n.dir : n.neg ? '/' : ' '}├─
          </span>
          {n.k === 'edge' && (
            <input
              className="lad-op lad-mem"
              value={n.mem}
              placeholder="Flankenmerker"
              spellCheck={false}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => upd((x) => ({ ...x, mem: e.target.value }) as LadNode)}
            />
          )}
        </div>
      );
    }
    const spec = boxSpec(n.type);
    const pins = inputPins(n.type).filter((p) => p.kind === 'value');
    const outs = outputPins(n.type).filter((p) => p.kind === 'value');
    return (
      <div
        key={n.id}
        className={`${cls} lad-boxwrap`}
        onClick={pick}
        title={title || spec.description}
      >
        {spec.operandLabel && (
          <input
            className="lad-op"
            value={n.operand ?? ''}
            placeholder={`<${spec.operandLabel}>`}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => upd((x) => ({ ...x, operand: e.target.value }) as LadNode)}
          />
        )}
        <div className="lad-box">
          <div className="lad-box-head">{spec.label}</div>
          {pins.map((p) => (
            <label key={p.name} className="lad-pin">
              <input
                value={n.inputs[p.name] ?? ''}
                placeholder="<???>"
                spellCheck={false}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  upd((x) =>
                    x.k === 'box' ? { ...x, inputs: { ...x.inputs, [p.name]: e.target.value } } : x,
                  )
                }
              />
              {p.name}
            </label>
          ))}
          {outs.map((p) => (
            <label key={p.name} className="lad-pin lad-pin-out">
              {p.name}
              <input
                value={n.outputs[p.name] ?? ''}
                placeholder={p.optional ? '' : '<???>'}
                spellCheck={false}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  upd((x) =>
                    x.k === 'box'
                      ? { ...x, outputs: { ...x.outputs, [p.name]: e.target.value } }
                      : x,
                  )
                }
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderCoil = (c: LadCoil, i: number) => {
    const selected = sel?.network === i && sel.id === c.id;
    const errs = byId.get(`${i}:${c.id}`) ?? [];
    const v = value(c.operand);
    const upd = (patch: Partial<LadCoil>) =>
      setNetwork(i, {
        ...body.lad[i]!,
        coils: body.lad[i]!.coils.map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
      });
    return (
      <div
        key={c.id}
        className={`lad-el lad-coilwrap ${selected ? 'lad-sel' : ''} ${errs.length ? 'lad-err' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setSel({ network: i, id: c.id });
        }}
        title={errs.map((d) => d.message).join('\n')}
      >
        <input
          className="lad-op"
          value={c.operand}
          placeholder="<??.?>"
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => upd({ operand: e.target.value })}
        />
        <span className={`lad-coil ${v === true ? 'lad-on' : v === false ? 'lad-off' : ''}`}>
          ─{COILS.find(([k]) => k === c.kind)![1]}
        </span>
        {(c.kind === 'P' || c.kind === 'N') && (
          <input
            className="lad-op lad-mem"
            value={c.mem ?? ''}
            placeholder="Flankenmerker"
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => upd({ mem: e.target.value })}
          />
        )}
      </div>
    );
  };

  return (
    <div className="lad">
      <div className="lad-tools" role="toolbar" aria-label="KOP-Elemente">
        <button className="btn btn-small" onClick={() => addContact(false)} title="Schließer">
          ┤ ├
        </button>
        <button className="btn btn-small" onClick={() => addContact(true)} title="Öffner">
          ┤/├
        </button>
        <button
          className="btn btn-small"
          onClick={() => addEdge('P')}
          title="P-Kontakt (steigende Flanke)"
        >
          ┤P├
        </button>
        <button
          className="btn btn-small"
          onClick={() => addEdge('N')}
          title="N-Kontakt (fallende Flanke)"
        >
          ┤N├
        </button>
        <button
          className="btn btn-small"
          onClick={parallel}
          disabled={!selId || isCoil(selId)}
          title="Parallelzweig zur Auswahl (ODER)"
        >
          ⫴ Parallel
        </button>
        <span className="lad-sep" />
        <select value={boxType} onChange={(e) => setBoxType(e.target.value)} aria-label="Box">
          {LAD_BOXES.map((b) => (
            <option key={b} value={b}>
              {boxSpec(b).label}
            </option>
          ))}
          {libraryFor(project).length > 0 && (
            <optgroup label="Technologie">
              {libraryFor(project).map((b) => (
                <option key={b.name} value={callType(b.name)}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          )}
          {ownBlocks.length > 0 && (
            <optgroup label="Eigene Bausteine">
              {ownBlocks.map((b) => (
                <option key={b.name} value={callType(b.name)}>
                  {b.name} ({b.kind})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button className="btn btn-small" onClick={addBox} title="Box hinter der Auswahl einfügen">
          + Box
        </button>
        <span className="lad-sep" />
        {COILS.map(([k, label, title]) => (
          <button key={k} className="btn btn-small" onClick={() => addCoil(k)} title={title}>
            {label}
          </button>
        ))}
        <span className="lad-sep" />
        <button
          className="btn btn-small"
          onClick={remove}
          disabled={!selId}
          title="Auswahl löschen (Entf)"
        >
          ✕
        </button>
      </div>
      <div className="lad-networks" onClick={() => setSel(null)}>
        {body.lad.map((nw, i) => (
          <div key={nw.id} className={`fup-network ${netErrors(i).length ? 'lad-net-err' : ''}`}>
            <header className="fup-nw-head" onClick={(e) => e.stopPropagation()}>
              <span className="fup-nw-no">Netzwerk {i + 1}:</span>
              <input
                className="fup-nw-title"
                value={nw.title}
                placeholder="Titel"
                onChange={(e) => setNetwork(i, { ...nw, title: e.target.value })}
              />
              <button
                className="icon-btn"
                title="Netzwerk löschen"
                onClick={() => setBody({ lad: body.lad.filter((_, k) => k !== i) })}
              >
                ✕
              </button>
            </header>
            <input
              className="lad-comment"
              value={nw.comment ?? ''}
              placeholder="Kommentar"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setNetwork(i, { ...nw, comment: e.target.value || undefined })}
            />
            <div
              className={`lad-rung ${target === i ? 'lad-rung-target' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setSel({ network: i, id: '' });
              }}
            >
              <span className="lad-rail" />
              {nw.items.map((n) => renderNode(n, i))}
              <span className="lad-wire lad-grow" />
              <div className="lad-coils">
                {nw.coils.length ? (
                  nw.coils.map((c) => renderCoil(c, i))
                ) : (
                  <span className="lad-hint">Spule fehlt</span>
                )}
              </div>
              <span className="lad-rail" />
            </div>
            {netErrors(i).length > 0 && (
              <div className="lad-msgs">
                {netErrors(i).map((d, k) => (
                  <div key={k}>{d.message}</div>
                ))}
              </div>
            )}
          </div>
        ))}
        <button
          className="btn btn-small fup-add-nw"
          onClick={(e) => {
            e.stopPropagation();
            const id = fresh('nw');
            setBody({ lad: [...body.lad, { id, title: '', items: [], coils: [] }] });
            setSel({ network: body.lad.length, id: '' });
          }}
        >
          + Netzwerk
        </button>
      </div>
    </div>
  );
}
