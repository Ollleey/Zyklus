import type { Rng } from '@zyklus/sim-core';

/** Erfundene Kundschaft für Zufallsaufträge (keine echten Firmen) */
const FIRMS: [de: string, en: string][] = [
  ['Brückner Fördertechnik', 'Brückner Conveying'],
  ['Hallstein Feinkost', 'Hallstein Delicatessen'],
  ['Moorbach Recycling', 'Moorbach Recycling'],
  ['Ehrenfels Metallbau', 'Ehrenfels Metalworks'],
  ['Kranich Logistik', 'Kranich Logistics'],
  ['Wendel Kunststoffe', 'Wendel Plastics'],
  ['Quellhof Getränke', 'Quellhof Beverages'],
  ['Stadtwerke Erlenau', 'Erlenau Municipal Utilities'],
  ['Molkerei Talwiesen', 'Talwiesen Dairy'],
  ['Spielwaren Lindgruber', 'Lindgruber Toys'],
  ['Tischlerei Ambros', 'Ambros Joinery'],
  ['Gärtnerei Sonnfeld', 'Sonnfeld Nursery'],
  ['Farbenwerk Rieder', 'Rieder Paintworks'],
  ['Brauhaus Kesselgrund', 'Kesselgrund Brewery'],
  ['Kläranlage Unterau', 'Unterau Sewage Works'],
  ['Mühlbach Verpackung', 'Mühlbach Packaging'],
];

const PEOPLE = [
  'Frau Albers',
  'Herr Demir',
  'Frau Novak',
  'Herr Lindqvist',
  'Frau Okafor',
  'Herr Brandstätter',
  'Frau Yilmaz',
  'Herr Castellano',
  'Frau Hartmann',
  'Herr Petrović',
];

const EN_TITLE: Record<string, string> = { Frau: 'Ms', Herr: 'Mr' };

export interface Customer {
  firm: { de: string; en: string };
  person: { de: string; en: string };
}

export function customerOf(rng: Rng): Customer {
  const [de, en] = FIRMS[rng.int(0, FIRMS.length - 1)]!;
  const p = PEOPLE[rng.int(0, PEOPLE.length - 1)]!;
  const [title, ...rest] = p.split(' ');
  return {
    firm: { de, en },
    person: { de: p, en: `${EN_TITLE[title!] ?? title} ${rest.join(' ')}` },
  };
}

/** Grußzeile am Ende einer Mail */
export const sign = (c: Customer, en: boolean) =>
  en ? `Kind regards\n${c.person.en}, ${c.firm.en}` : `Viele Grüße\n${c.person.de}, ${c.firm.de}`;
