import type { Block } from '@zyklus/sim-core';
import type { FupBody } from '@zyklus/fup-model';

/**
 * Referenzlösungen in FUP (je Level ein OB1-Programm plus benötigte Datenbausteine).
 * Aufbau wie im TIA-FUP-Editor: Bool-Verbindungen zwischen Boxen, Werte über Operanden.
 */

type BoxSeed = {
  id: string;
  type: string;
  y: number;
  operand?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  negated?: string[];
  count?: number;
};

const b = (s: BoxSeed) => ({ x: 0, inputs: {}, outputs: {}, negated: [], ...s });
const w = (from: string, pin: string, to: string, tpin: string) => ({
  from: { box: from, pin },
  to: { box: to, pin: tpin },
});
let n = 0;
const nw = (title: string, boxes: ReturnType<typeof b>[], wires: ReturnType<typeof w>[] = []) => ({
  id: `nw${++n}`,
  title,
  boxes,
  wires,
});

export const FUP_REFERENCES: Record<string, { fup: FupBody; blocks: Block[] }> = {
  '01-foerderband': {
    blocks: [],
    fup: {
      networks: [
        nw(
          'Band mit Selbsthaltung',
          [
            b({ id: 'or', type: 'OR', y: 0, inputs: { IN1: '"Start"', IN2: '"Bandmotor"' } }),
            b({ id: 'and', type: 'AND', y: 0, inputs: { IN2: '"Stopp"' } }),
            b({ id: 'q', type: 'ASSIGN', y: 0, operand: '"Bandmotor"' }),
          ],
          [w('or', 'OUT', 'and', 'IN1'), w('and', 'OUT', 'q', 'IN')],
        ),
      ],
    },
  },

  '02-zweihand': {
    blocks: [
      { kind: 'IDB', name: 'Fenster', number: 1, of: 'IEC_TIMER' },
      {
        kind: 'DB',
        name: 'Zweihand',
        number: 2,
        vars: [
          { name: 'bereit', type: 'Bool' },
          { name: 'aktiv', type: 'Bool' },
        ],
      },
    ],
    fup: {
      networks: [
        nw(
          'Zeitfenster 0,5 s ab dem ersten Taster',
          [
            b({ id: 'or', type: 'OR', y: 0, inputs: { IN1: '"Links"', IN2: '"Rechts"' } }),
            b({ id: 'ton', type: 'TON', y: 0, operand: '"Fenster"', inputs: { PT: 'T#500ms' } }),
          ],
          [w('or', 'OUT', 'ton', 'IN')],
        ),
        nw(
          'Bereit, wenn beide losgelassen',
          [
            b({
              id: 'and',
              type: 'AND',
              y: 0,
              inputs: { IN1: '"Links"', IN2: '"Rechts"' },
              negated: ['IN1', 'IN2'],
            }),
            b({ id: 's', type: 'SET', y: 0, operand: '"Zweihand".bereit' }),
          ],
          [w('and', 'OUT', 's', 'IN')],
        ),
        nw('Zeitfenster abgelaufen', [
          b({
            id: 'r',
            type: 'RESET',
            y: 0,
            operand: '"Zweihand".bereit',
            inputs: { IN: '"Fenster".Q' },
          }),
        ]),
        nw(
          'Hub starten',
          [
            b({
              id: 'and',
              type: 'AND',
              y: 0,
              count: 3,
              inputs: { IN1: '"Links"', IN2: '"Rechts"', IN3: '"Zweihand".bereit' },
            }),
            b({ id: 's', type: 'SET', y: 0, operand: '"Zweihand".aktiv' }),
          ],
          [w('and', 'OUT', 's', 'IN')],
        ),
        nw(
          'Loslassen beendet den Hub',
          [
            b({
              id: 'nand',
              type: 'AND',
              y: 0,
              inputs: { IN1: '"Links"', IN2: '"Rechts"' },
              negated: ['OUT'],
            }),
            b({ id: 'and', type: 'AND', y: 10, inputs: { IN1: '"Zweihand".aktiv' } }),
            b({ id: 'rb', type: 'RESET', y: 10, operand: '"Zweihand".bereit' }),
            b({ id: 'ra', type: 'RESET', y: 20, operand: '"Zweihand".aktiv' }),
          ],
          [
            w('nand', 'OUT', 'and', 'IN2'),
            w('and', 'OUT', 'rb', 'IN'),
            w('nand', 'OUT', 'ra', 'IN'),
          ],
        ),
        nw('Presse ansteuern', [
          b({
            id: 'q',
            type: 'ASSIGN',
            y: 0,
            operand: '"Presse"',
            inputs: { IN: '"Zweihand".aktiv' },
          }),
        ]),
      ],
    },
  },

  '03-stromstoss': {
    blocks: [
      { kind: 'IDB', name: 'Entprellen', number: 1, of: 'TON_TIME' },
      { kind: 'IDB', name: 'Flanke', number: 2, of: 'R_TRIG' },
    ],
    fup: {
      networks: [
        nw(
          'Entprellen, Flanke, Umschalten',
          [
            b({
              id: 'ton',
              type: 'TON',
              y: 0,
              operand: '"Entprellen"',
              inputs: { IN: '"Taster"', PT: 'T#20ms' },
            }),
            b({ id: 'trig', type: 'R_TRIG', y: 0, operand: '"Flanke"' }),
            b({ id: 'x', type: 'XOR', y: 0, inputs: { IN2: '"Licht"' } }),
            b({ id: 'q', type: 'ASSIGN', y: 0, operand: '"Licht"' }),
          ],
          [w('ton', 'Q', 'trig', 'CLK'), w('trig', 'Q', 'x', 'IN1'), w('x', 'OUT', 'q', 'IN')],
        ),
      ],
    },
  },
};
