import { defaultTypeForSize, parseAddress, sizeOfType, AddressError } from './address';
import type {
  InstanceDecl,
  InstanceField,
  InstanceKind,
  Instr,
  IrProgram,
  Operand,
  SlotDecl,
} from './ir';
import { defaultValue, normalize, type DataType, type Value } from './types';

/** Konstanten-Operanden. */
export const c = {
  bool: (v: boolean): Operand => ({ k: 'const', t: 'BOOL', v }),
  int: (v: number): Operand => ({ k: 'const', t: 'INT', v: normalize('INT', v) }),
  dint: (v: number): Operand => ({ k: 'const', t: 'DINT', v: normalize('DINT', v) }),
  real: (v: number): Operand => ({ k: 'const', t: 'REAL', v: normalize('REAL', v) }),
  word: (v: number): Operand => ({ k: 'const', t: 'WORD', v: normalize('WORD', v) }),
  time: (ms: number): Operand => ({ k: 'const', t: 'TIME', v: normalize('TIME', ms) }),
};

/** Operand für eine Absolutadresse, z. B. `io('%I0.0')`, `io('%MD4', 'REAL')`. */
export function io(address: string, t?: DataType): Operand {
  const a = parseAddress(address);
  const type = t ?? defaultTypeForSize(a.size);
  if (sizeOfType(type) !== a.size) {
    throw new AddressError(`Typ ${type} passt nicht zur Adresse ${address}`);
  }
  return { k: 'io', area: a.area, t: type, byte: a.byte, bit: a.bit };
}

export interface InstanceRef {
  i: number;
  field(f: InstanceField): Operand;
}

/** Hilfsklasse zum Erzeugen von IR-Programmen (für Compiler und Tests). */
export class ProgramBuilder {
  private readonly slots: SlotDecl[] = [];
  private readonly instances: InstanceDecl[] = [];
  private readonly code: Instr[] = [];

  slot(name: string, t: DataType, init?: Value): Operand {
    this.slots.push({ name, t, init: normalize(t, init ?? defaultValue(t)) });
    return { k: 'slot', i: this.slots.length - 1 };
  }

  temp(name: string, t: DataType, init?: Value): Operand {
    this.slots.push({ name, t, init: normalize(t, init ?? defaultValue(t)), temp: true });
    return { k: 'slot', i: this.slots.length - 1 };
  }

  instance(name: string, kind: InstanceKind): InstanceRef {
    this.instances.push({ name, kind });
    const i = this.instances.length - 1;
    return { i, field: (f) => ({ k: 'inst', i, f }) };
  }

  /** Hängt einen Befehl an und gibt das Befehlsobjekt zurück (z. B. zum späteren Patchen von Sprungzielen). */
  emit<T extends Instr>(instr: T): T {
    this.code.push(instr);
    return instr;
  }

  /** Verwirft alle Befehle ab `pc` (Variablen und Instanzen bleiben). */
  truncate(pc: number): void {
    this.code.length = pc;
  }

  /** Index des nächsten Befehls – als Sprungziel verwendbar. */
  get pc(): number {
    return this.code.length;
  }

  build(): IrProgram {
    return {
      slots: this.slots.map((s) => ({ ...s })),
      instances: this.instances.map((s) => ({ ...s })),
      code: this.code.map((s) => ({ ...s })),
    };
  }
}
