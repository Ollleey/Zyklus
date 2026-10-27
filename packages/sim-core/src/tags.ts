import { byteLength, formatAddress, parseAddress, sizeOfType, type Address } from './address';
import type { Operand } from './ir';
import type { DataType } from './types';

export interface Tag {
  name: string;
  address: string;
  t: DataType;
  comment?: string;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Symbolische Variablentabelle (PLC-Tags) einer CPU. Namen sind unabhängig von Groß-/Kleinschreibung eindeutig. */
export class TagTable {
  private readonly tags = new Map<string, Tag & { addr: Address }>();

  constructor(tags: Tag[] = []) {
    for (const t of tags) this.add(t);
  }

  add(tag: Tag): void {
    if (!NAME_RE.test(tag.name)) {
      throw new Error(
        `Ungültiger Name „${tag.name}“ (Buchstaben, Ziffern, _; nicht mit Ziffer beginnen)`,
      );
    }
    const key = tag.name.toLowerCase();
    if (this.tags.has(key)) throw new Error(`Name „${tag.name}“ ist bereits vergeben`);
    const addr = parseAddress(tag.address);
    if (sizeOfType(tag.t) !== addr.size) {
      throw new Error(`Typ ${tag.t} passt nicht zur Adresse ${tag.address}`);
    }
    this.tags.set(key, { ...tag, address: formatAddress(addr), addr });
  }

  remove(name: string): boolean {
    return this.tags.delete(name.toLowerCase());
  }

  get(name: string): Tag | undefined {
    const t = this.tags.get(name.toLowerCase());
    return t && { name: t.name, address: t.address, t: t.t, comment: t.comment };
  }

  list(): Tag[] {
    return [...this.tags.values()].map(({ addr: _addr, ...t }) => t);
  }

  /** Operand für einen Tag-Namen, undefined wenn unbekannt. */
  resolve(name: string): Operand | undefined {
    const t = this.tags.get(name.toLowerCase());
    if (!t) return undefined;
    return { k: 'io', area: t.addr.area, t: t.t, byte: t.addr.byte, bit: t.addr.bit };
  }

  /** Paare von Tags, deren Speicherbereiche sich überlappen (Warnung, kein Fehler). */
  overlaps(): [string, string][] {
    const all = [...this.tags.values()];
    const out: [string, string][] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (overlap(all[i]!.addr, all[j]!.addr)) out.push([all[i]!.name, all[j]!.name]);
      }
    }
    return out;
  }
}

function overlap(a: Address, b: Address): boolean {
  if (a.area !== b.area) return false;
  if (a.size === 'X' && b.size === 'X') return a.byte === b.byte && a.bit === b.bit;
  const aEnd = a.byte + byteLength(a.size);
  const bEnd = b.byte + byteLength(b.size);
  return a.byte < bEnd && b.byte < aEnd;
}
