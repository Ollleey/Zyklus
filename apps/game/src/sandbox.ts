import { MODULE_TYPES, validateLevel, type Device, type Level } from '@zyklus/sim-core';

const T = (de: string) => ({ de });

const dev = (
  id: string,
  tag: string,
  name: string,
  kind: Device['kind'],
  side: Device['side'],
  role: Device['role'],
  extra: Partial<Device> = {},
): Device => ({ id, tag, name: T(name), kind, side, role, ...extra });

/**
 * Sandkasten: freier Aufbau mit allen Baugruppen und einem Satz Testgeräte. Es gibt keine
 * Prüfung – nur den Handbetrieb. Technisch ein Level mit einem leeren Testfall.
 */
export const SANDBOX: Level = validateLevel({
  id: 'sandbox',
  order: 0,
  title: T('Sandkasten'),
  customer: T('Eigene Werkstatt'),
  mail: {
    from: T('Werkstatt'),
    subject: T('Freies Experimentieren'),
    body: T(
      'Hier gibt es keinen Auftrag und keine Prüfung. Alle Baugruppen sind erlaubt, die Testgeräte hängen am Rand. ' +
        'Simulation im Handbetrieb: Taster gedrückt halten, Schalter klicken, Poti mit dem Schieber stellen.',
    ),
  },
  datasheet: T(
    '# Testgeräte\n\n| Gerät | Art | Beschreibung |\n|---|---|---|\n' +
      '| S1, S2 | DI | Taster |\n| S3 | DI | Schalter |\n| S4 | DI | Taster als **Öffner** |\n' +
      '| S5 | DI | Taster, **prellt** |\n| B1 | AI | Poti 0…100 % |\n' +
      '| H1…H3 | DO | Leuchtmelder |\n| M1 | DO | Motor – **Leistungsausgang** (über REL 4) |\n' +
      '| P1 | AO | Zeigerinstrument 0…100 % |\n\n' +
      'Es gibt keine Bewertung. Speichern und Export funktionieren wie in jedem Auftrag.',
  ),
  board: { width: 16, ductCapacity: 12 },
  allowedModules: Object.keys(MODULE_TYPES),
  toleranceMs: 0,
  plant: { type: 'panel' },
  devices: [
    dev('S1', 'Taster_1', 'Taster 1 (S1)', 'DI', 'left', 'button'),
    dev('S2', 'Taster_2', 'Taster 2 (S2)', 'DI', 'left', 'button'),
    dev('S3', 'Schalter', 'Schalter (S3)', 'DI', 'left', 'switch'),
    dev('S4', 'Oeffner', 'Öffner (S4)', 'DI', 'left', 'button', { nc: true }),
    dev('S5', 'Prellt', 'Prellender Taster (S5)', 'DI', 'left', 'button', {
      bounce: { minToggles: 2, maxToggles: 6, gapMs: [1, 3] },
    }),
    dev('B1', 'Poti', 'Poti (B1)', 'AI', 'left', 'sensor', {
      analog: { unit: '%', min: 0, max: 100, noise: 20 },
    }),
    dev('H1', 'Lampe_1', 'Leuchte 1 (H1)', 'DO', 'right', 'lamp'),
    dev('H2', 'Lampe_2', 'Leuchte 2 (H2)', 'DO', 'right', 'lamp'),
    dev('H3', 'Lampe_3', 'Leuchte 3 (H3)', 'DO', 'right', 'lamp'),
    dev('M1', 'Motor', 'Motor (M1)', 'DO', 'right', 'motor', { power: true }),
    dev('P1', 'Anzeige', 'Zeigerinstrument (P1)', 'AO', 'right', 'actuator', {
      analog: { unit: '%', min: 0, max: 100 },
    }),
  ],
  tests: [
    {
      id: 'frei',
      name: T('Frei'),
      durationMs: 1000,
      seeds: [1],
      stimuli: {},
      checks: [],
    },
  ],
});
