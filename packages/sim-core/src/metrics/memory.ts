import type { IrProgram } from '../ir';
import { STRING_DEFAULT_LEN, bitWidth, type DataType } from '../types';

/** Bytes je Instanz eines Systembausteins (Zeit, Zähler, Flanke) – Spiel-Balancing */
export const INSTANCE_BYTES = 16;

/** Speicherbedarf eines Werts in Byte (wie in optimierten Bausteinen: Bool belegt 1 Byte) */
export function byteSize(t: DataType, len?: number): number {
  if (t === 'STRING') return (len ?? STRING_DEFAULT_LEN) + 2;
  return Math.max(1, bitWidth(t) / 8);
}

/**
 * Datenbedarf eines Programms im Arbeitsspeicher: alle nicht temporären Variablen
 * (Datenbausteine, Instanzdaten) plus Instanzen der Systembausteine.
 */
export function dataBytes(p: IrProgram): number {
  let n = p.instances.length * INSTANCE_BYTES;
  for (const s of p.slots) if (!s.temp) n += byteSize(s.t, s.len);
  return n;
}
