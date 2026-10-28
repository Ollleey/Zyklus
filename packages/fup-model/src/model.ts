/**
 * FUP-Programm im Stil des TIA-Portals: Netzwerke mit Boxen.
 * Verbindungen zwischen Boxen tragen wie in TIA nur Bool-Signale (VKE); Zahlenwerte werden
 * über Operanden an den Pins angegeben (Variable, Konstante, Absolutadresse).
 */

export interface FupBox {
  id: string;
  /** Typ aus dem Katalog, z. B. AND, TON, CMP_GE, MOVE */
  type: string;
  /** Lage im Netzwerk (px, für die Darstellung und die Auswertungsreihenfolge) */
  x: number;
  y: number;
  /** Operand über der Box: Zuweisungsziel, Speicherbit, Flankenmerker oder Instanz-DB */
  operand?: string;
  /** Operanden an nicht verbundenen Eingängen, z. B. { IN1: '"Start"', PT: 'T#2s' } */
  inputs: Record<string, string>;
  /** Operanden an Ausgängen, z. B. { Q: '"Lampe"', ET: '"Zeit"' } */
  outputs: Record<string, string>;
  /** negierte Bool-Pins (Eingänge und Ausgänge) */
  negated: string[];
  /** Anzahl der Eingänge bei erweiterbaren Boxen (AND, OR, ADD, MUX …) */
  count?: number;
}

export interface PinRef {
  box: string;
  pin: string;
}

/** Bool-Verbindung von einem Ausgang zu einem Eingang. Ein Ausgang darf mehrere Eingänge speisen. */
export interface FupWire {
  from: PinRef;
  to: PinRef;
}

export interface FupNetwork {
  id: string;
  title: string;
  comment?: string;
  boxes: FupBox[];
  wires: FupWire[];
}

export interface FupBody {
  networks: FupNetwork[];
}

export function emptyFup(): FupBody {
  return { networks: [{ id: 'nw1', title: '', boxes: [], wires: [] }] };
}

/** Programmgröße nach Spielregel: Anzahl der Boxen. */
export function countBoxes(body: FupBody): number {
  return body.networks.reduce((n, nw) => n + nw.boxes.length, 0);
}

export function isFupBody(x: unknown): x is FupBody {
  return typeof x === 'object' && x !== null && Array.isArray((x as FupBody).networks);
}
