import type { Device } from '@zyklus/sim-core';
import { CATALOG, type IoPoint } from './catalog';
import type { Layout, Part } from './model';

/** Geräte-id eines Anschlusses: hängt an der Bauteil-id, damit Umbenennen die Verdrahtung behält */
export const deviceId = (part: Pick<Part, 'id'>, key: string) =>
  key ? `${part.id}_${key}` : part.id;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Kennzeichnung als gültiger Variablenname: Umlaute ersetzen, Sonderzeichen zu „_“ */
export function identifier(s: string): string {
  const t = s
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!t) return 'X';
  return IDENT.test(t) ? t : `Z${t}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Vorgeschlagener Variablenname, z. B. B1_Induktiv, Z1A1_Ausfahren */
export function suggestedTag(part: Part, io: IoPoint): string {
  const word = io.key ? cap(io.key) : cap(io.label.split(/[ ,(]/)[0] ?? '');
  return identifier(`${part.tag}_${word}`);
}

export interface Connection {
  part: Part;
  io: IoPoint;
  device: Device;
}

/** Alle elektrischen Anschlüsse der Anlage als Feldgeräte (Eingänge links, Ausgänge rechts) */
export function connectionsOf(layout: Layout): Connection[] {
  const out: Connection[] = [];
  for (const part of layout.parts) {
    for (const io of CATALOG[part.type].io(part)) {
      const device: Device = {
        id: deviceId(part, io.key),
        label: io.key ? `${part.tag}.${io.key}` : part.tag,
        tag: suggestedTag(part, io),
        name: { de: `${io.label} (${part.tag})` },
        kind: io.kind,
        side: io.kind === 'DI' || io.kind === 'AI' ? 'left' : 'right',
        role: io.role,
      };
      if (io.nc) device.nc = true;
      if (io.power) device.power = true;
      if (io.analog) device.analog = { ...io.analog };
      if (io.signal) device.signal = io.signal;
      out.push({ part, io, device });
    }
  }
  return out;
}

export const devicesOf = (layout: Layout): Device[] => connectionsOf(layout).map((c) => c.device);
