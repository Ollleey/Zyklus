/**
 * KOP (Kontaktplan) im Stil des TIA-Portals: je Netzwerk ein Strompfad von der linken
 * Stromschiene über Kontakte und Boxen (in Reihe und parallel) zu einer oder mehreren Spulen.
 *
 * KOP wird zum Übersetzen in das FUP-Netzwerkmodell umgeformt – dieselbe Absenkung nach SCL,
 * dieselbe Semantik. Umgekehrt lässt sich ein FUP-Netzwerk in KOP darstellen, wenn seine
 * Verknüpfungen einen Baum bilden (jeder Ausgang speist genau einen Eingang).
 */
import { boxSpec, inputPins, outputPins } from './catalog';
import type { FupBody, FupBox, FupNetwork, FupWire, PinRef } from './model';

export type LadNode =
  /** Schließer, mit `neg` Öffner */
  | { k: 'contact'; id: string; operand: string; neg?: boolean }
  /** P-/N-Kontakt: Flanke des Operanden, `mem` = Flankenmerker */
  | { k: 'edge'; id: string; operand: string; mem: string; dir: 'P' | 'N' }
  /**
   * Box aus dem FUP-Katalog (Zeiten, Zähler, Vergleicher, MOVE …): der Strompfad läuft in den ersten
   * Bool-Eingang und aus dem ersten Bool-Ausgang weiter; Vergleicher wirken wie ein Kontakt
   */
  | {
      k: 'box';
      id: string;
      type: string;
      operand?: string;
      inputs: Record<string, string>;
      outputs: Record<string, string>;
    }
  | { k: 'parallel'; id: string; branches: LadNode[][] };

export type CoilKind = '=' | '/=' | 'S' | 'R' | 'P' | 'N';

export interface LadCoil {
  id: string;
  kind: CoilKind;
  operand: string;
  /** Flankenmerker bei P-/N-Spule */
  mem?: string;
}

export interface LadNetwork {
  id: string;
  title: string;
  comment?: string;
  /** Elemente in Reihe von links nach rechts */
  items: LadNode[];
  /** Spulen am Ende (parallel geschaltet) */
  coils: LadCoil[];
}

export interface LadBody {
  lad: LadNetwork[];
}

export function isLadBody(x: unknown): x is LadBody {
  return typeof x === 'object' && x !== null && Array.isArray((x as LadBody).lad);
}

export function emptyLad(): LadBody {
  return { lad: [{ id: 'nw1', title: '', items: [], coils: [] }] };
}

/** Programmgröße in KOP: Kontakte, Boxen und Spulen */
export function countLadElements(body: LadBody): number {
  const count = (items: LadNode[]): number =>
    items.reduce(
      (n, i) => n + (i.k === 'parallel' ? i.branches.reduce((m, b) => m + count(b), 0) : 1),
      0,
    );
  return body.lad.reduce((n, nw) => n + count(nw.items) + nw.coils.length, 0);
}

/** erster Bool-Eingang bzw. -Ausgang einer Box (Strompfad) */
function powerIn(type: string): string | undefined {
  return inputPins(type).find((p) => p.kind === 'bool')?.name;
}
function powerOut(type: string): string | undefined {
  return outputPins(type).find((p) => p.kind === 'bool')?.name;
}

/** Signal im Strompfad: Ausgang einer FUP-Box oder die linke Stromschiene (immer 1) */
type Signal = PinRef | 'rail';

/** KOP-Netzwerk → FUP-Netzwerk (Box-ids der Kontaktgruppen = id des ersten Kontakts) */
export function ladToFup(nw: LadNetwork): FupNetwork {
  const boxes: FupBox[] = [];
  const wires: FupWire[] = [];
  let col = 0;
  let row = 0;
  const newBox = (b: Omit<FupBox, 'x' | 'y' | 'negated'> & { negated?: string[] }): FupBox => {
    const box: FupBox = { negated: [], ...b, x: col * 120, y: row * 80 };
    boxes.push(box);
    return box;
  };
  const connect = (from: Signal, to: PinRef, box: FupBox) => {
    if (from === 'rail') box.inputs[to.pin] = 'TRUE';
    else wires.push({ from, to });
  };
  /** UND aus Signal und Operanden (Kontakte in Reihe) */
  const andOf = (id: string, sig: Signal, ops: { operand: string; neg?: boolean }[]): Signal => {
    if (!ops.length) return sig;
    const pins = (sig === 'rail' ? 0 : 1) + ops.length;
    const box = newBox({ id, type: 'AND', inputs: {}, outputs: {}, count: Math.max(2, pins) });
    let k = 1;
    if (sig !== 'rail') wires.push({ from: sig, to: { box: id, pin: `IN${k++}` } });
    for (const o of ops) {
      const pin = `IN${k++}`;
      box.inputs[pin] = o.operand;
      if (o.neg) box.negated.push(pin);
    }
    if (k === 2) box.inputs.IN2 = 'TRUE';
    col++;
    return { box: id, pin: 'OUT' };
  };

  /** Signal UND Ausgang einer Box (Element in Reihe) */
  const joinAnd = (id: string, sig: Signal, here: PinRef): Signal => {
    if (sig === 'rail') return here;
    const g = newBox({ id, type: 'AND', inputs: {}, outputs: {}, count: 2 });
    wires.push({ from: sig, to: { box: g.id, pin: 'IN1' } });
    wires.push({ from: here, to: { box: g.id, pin: 'IN2' } });
    col++;
    return { box: g.id, pin: 'OUT' };
  };

  const series = (items: LadNode[], sig: Signal): Signal => {
    let pending: { id: string; ops: { operand: string; neg?: boolean }[] } | null = null;
    const flush = () => {
      if (pending) sig = andOf(pending.id, sig, pending.ops);
      pending = null;
    };
    for (const it of items) {
      if (it.k === 'contact') {
        pending ??= { id: it.id, ops: [] };
        pending.ops.push({ operand: it.operand, neg: it.neg });
        continue;
      }
      flush();
      if (it.k === 'edge') {
        const trig = newBox({
          id: it.id,
          type: it.dir === 'P' ? 'P_TRIG' : 'N_TRIG',
          operand: it.mem,
          inputs: { CLK: it.operand },
          outputs: {},
        });
        col++;
        sig = joinAnd(`${it.id}~and`, sig, { box: trig.id, pin: 'Q' });
        continue;
      }
      if (it.k === 'box') {
        const spec = boxSpec(it.type);
        const box = newBox({
          id: it.id,
          type: it.type,
          operand: it.operand,
          inputs: { ...it.inputs },
          outputs: { ...it.outputs },
        });
        col++;
        const pin = powerIn(it.type);
        const out = powerOut(it.type);
        if (pin) {
          connect(sig, { box: box.id, pin }, box);
          sig = out ? { box: box.id, pin: out } : sig;
        } else if (spec.kind === 'compare' && out) {
          // Vergleicher wirkt wie ein Kontakt in Reihe
          sig = joinAnd(`${it.id}~and`, sig, { box: box.id, pin: out });
        }
        continue;
      }
      // Parallelzweige: jeder Zweig mit dem Signal davor, dann ODER
      const startCol = col;
      const outs: Signal[] = [];
      it.branches.forEach((b, i) => {
        col = startCol;
        row += i ? 1 : 0;
        outs.push(series(b, sig));
      });
      col = startCol + 3;
      if (outs.some((o) => o === 'rail')) {
        // ein leerer Zweig überbrückt die Parallelschaltung
        continue;
      }
      const or = newBox({
        id: it.id,
        type: 'OR',
        inputs: {},
        outputs: {},
        count: Math.max(2, outs.length),
      });
      outs.forEach((o, i) =>
        wires.push({ from: o as PinRef, to: { box: or.id, pin: `IN${i + 1}` } }),
      );
      if (outs.length === 1) or.inputs.IN2 = 'FALSE';
      sig = { box: or.id, pin: 'OUT' };
      col++;
    }
    flush();
    return sig;
  };

  const rlo = series(nw.items, 'rail');
  for (const c of nw.coils) {
    row++;
    let sig: Signal = rlo;
    if (c.kind === 'P' || c.kind === 'N') {
      const trig = newBox({
        id: `${c.id}~trig`,
        type: c.kind === 'P' ? 'P_TRIG' : 'N_TRIG',
        operand: c.mem ?? '',
        inputs: {},
        outputs: {},
      });
      connect(sig, { box: trig.id, pin: 'CLK' }, trig);
      sig = { box: trig.id, pin: 'Q' };
    }
    const type = c.kind === 'S' ? 'SET' : c.kind === 'R' ? 'RESET' : 'ASSIGN';
    const box = newBox({
      id: c.id,
      type,
      operand: c.operand,
      inputs: {},
      outputs: {},
      negated: c.kind === '/=' ? ['IN'] : [],
    });
    connect(sig, { box: box.id, pin: 'IN' }, box);
  }
  return {
    id: nw.id,
    title: nw.title,
    ...(nw.comment ? { comment: nw.comment } : {}),
    boxes,
    wires,
  };
}

export function ladBodyToFup(body: LadBody): FupBody {
  return { networks: body.lad.map(ladToFup) };
}

/**
 * FUP-Netzwerk → KOP, wenn darstellbar: Zuweisungen am Ende, davor ein Baum aus UND/ODER mit
 * Operanden, Flanken, Zeiten, Zählern, Vergleichern; alle Zuweisungen am selben Verknüpfungsergebnis.
 * Sonst `undefined` mit Begründung.
 */
export function fupToLad(nw: FupNetwork): { lad: LadNetwork } | { reason: string } {
  const byId = new Map(nw.boxes.map((b) => [b.id, b]));
  const source = new Map<string, PinRef>();
  const fanout = new Map<string, number>();
  for (const w of nw.wires) {
    source.set(`${w.to.box}.${w.to.pin}`, w.from);
    const k = `${w.from.box}.${w.from.pin}`;
    fanout.set(k, (fanout.get(k) ?? 0) + 1);
  }
  const coilBoxes = nw.boxes.filter((b) => ['ASSIGN', 'SET', 'RESET'].includes(b.type));
  const consumed = new Set<string>();
  let ids = 0;
  const fresh = (p: string) => `${p}${++ids}`;

  /** Signal am Bool-Eingang als Reihe von KOP-Elementen */
  const input = (box: FupBox, pin: string): LadNode[] => {
    const src = source.get(`${box.id}.${pin}`);
    if (!src) {
      const op = box.inputs[pin]?.trim() ?? '';
      if (op.toUpperCase() === 'TRUE' && !box.negated.includes(pin)) return [];
      return [
        { k: 'contact', id: fresh('c'), operand: op, neg: box.negated.includes(pin) || undefined },
      ];
    }
    if (box.negated.includes(pin)) throw new Error('negierte Verbindung');
    return node(src);
  };
  const node = (src: PinRef): LadNode[] => {
    const b = byId.get(src.box);
    if (!b) throw new Error('Verbindung zu einer gelöschten Box');
    if ((fanout.get(`${src.box}.${src.pin}`) ?? 0) > 1)
      throw new Error('Verzweigung eines Ausgangs');
    if (consumed.has(b.id)) throw new Error('Box mehrfach verwendet');
    consumed.add(b.id);
    const spec = boxSpec(b.type);
    if (b.type === 'AND') return inputPins(b.type, b.count).flatMap((p) => input(b, p.name));
    if (b.type === 'OR') {
      const branches = inputPins(b.type, b.count)
        .map((p) => input(b, p.name))
        .filter(
          (br) =>
            !(
              br.length === 1 &&
              br[0]!.k === 'contact' &&
              br[0]!.operand.toUpperCase() === 'FALSE'
            ),
        );
      return [{ k: 'parallel', id: b.id, branches }];
    }
    if ((b.type === 'P_TRIG' || b.type === 'N_TRIG') && !source.has(`${b.id}.CLK`)) {
      return [
        {
          k: 'edge',
          id: b.id,
          operand: b.inputs.CLK ?? '',
          mem: b.operand ?? '',
          dir: b.type === 'P_TRIG' ? 'P' : 'N',
        },
      ];
    }
    if (spec.kind === 'logic' || spec.kind === 'memory')
      throw new Error(`${spec.label} gibt es in KOP nicht als Element`);
    const pin = powerIn(b.type);
    const before = pin ? input(b, pin) : [];
    const outs = { ...b.outputs };
    if (powerOut(b.type) !== src.pin)
      throw new Error('Strompfad läuft nicht über den ersten Ausgang');
    return [
      ...before,
      {
        k: 'box',
        id: b.id,
        type: b.type,
        operand: b.operand,
        inputs: Object.fromEntries(Object.entries(b.inputs).filter(([k]) => k !== pin)),
        outputs: outs,
      },
    ];
  };

  try {
    if (!coilBoxes.length) {
      if (nw.boxes.length) return { reason: 'Netzwerk endet nicht mit einer Zuweisung' };
      return { lad: { id: nw.id, title: nw.title, items: [], coils: [] } };
    }
    let items: LadNode[] | undefined;
    let key: string | undefined;
    const coils: LadCoil[] = [];
    for (const c of coilBoxes) {
      const src = source.get(`${c.id}.IN`);
      let kind: CoilKind =
        c.type === 'SET' ? 'S' : c.type === 'RESET' ? 'R' : c.negated.includes('IN') ? '/=' : '=';
      let from = src;
      let mem: string | undefined;
      // P-/N-Spule: Flanke direkt vor der Zuweisung
      const t = src ? byId.get(src.box) : undefined;
      if (
        t &&
        (t.type === 'P_TRIG' || t.type === 'N_TRIG') &&
        c.type === 'ASSIGN' &&
        source.has(`${t.id}.CLK`)
      ) {
        kind = t.type === 'P_TRIG' ? 'P' : 'N';
        mem = t.operand;
        from = source.get(`${t.id}.CLK`);
        consumed.add(t.id);
      }
      const k = from ? `${from.box}.${from.pin}` : `op:${c.inputs.IN ?? ''}`;
      if (key === undefined) {
        key = k;
        fanout.set(k, 1);
        items = from
          ? node(from)
          : c.inputs.IN?.trim().toUpperCase() === 'TRUE'
            ? []
            : input(c, 'IN');
      } else if (k !== key) {
        return { reason: 'Zuweisungen hängen an verschiedenen Verknüpfungen' };
      }
      coils.push({
        id: c.id,
        kind,
        operand: c.operand ?? '',
        ...(mem !== undefined ? { mem } : {}),
      });
    }
    const unused = nw.boxes.filter((b) => !consumed.has(b.id) && !coilBoxes.includes(b));
    if (unused.length)
      return { reason: `Box ${boxSpec(unused[0]!.type).label} hängt an keiner Zuweisung` };
    return {
      lad: {
        id: nw.id,
        title: nw.title,
        ...(nw.comment ? { comment: nw.comment } : {}),
        items: items ?? [],
        coils,
      },
    };
  } catch (e) {
    return { reason: (e as Error).message };
  }
}
