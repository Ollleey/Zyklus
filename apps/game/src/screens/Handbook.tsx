import { useState } from 'react';
import { MODULE_TYPES, RANGE_LABEL, ioGroups, tr, type ModuleType } from '@zyklus/sim-core';
import { BOX_SPECS, CATEGORIES } from '@zyklus/fup-model';
import semantik from '../../../../docs/semantik.md?raw';
import scl from '../../../../docs/scl.md?raw';
import fup from '../../../../docs/fup.md?raw';
import online from '../../../../docs/online.md?raw';
import geraete from '../../../../docs/geraete.md?raw';
import technologie from '../../../../docs/technologie.md?raw';
import graph from '../../../../docs/graph.md?raw';
import szenarien from '../../../../docs/szenarien.md?raw';
import schrittketten from '../../../../docs/schrittketten.md?raw';
import semantikEn from '../../../../docs/en/semantik.md?raw';
import sclEn from '../../../../docs/en/scl.md?raw';
import fupEn from '../../../../docs/en/fup.md?raw';
import onlineEn from '../../../../docs/en/online.md?raw';
import geraeteEn from '../../../../docs/en/geraete.md?raw';
import technologieEn from '../../../../docs/en/technologie.md?raw';
import graphEn from '../../../../docs/en/graph.md?raw';
import szenarienEn from '../../../../docs/en/szenarien.md?raw';
import schrittkettenEn from '../../../../docs/en/schrittketten.md?raw';
import { categoryLabel } from '../components/FupEditor';
import { boxDescription } from '../i18n/boxes-en';
import { language, t, tx } from '../i18n';
import { Markdown } from '../ui/Markdown';

const INTRO = `# Willkommen in der Werkstatt

> Neu bei SPS? Der **🎓 Grundkurs** im Posteingang erklärt alles von null an – Signale, Logik,
> Zeiten, Zähler und Schrittketten – mit kleinen Quizfragen.

Kunden schicken Aufträge per Mail. Zu jedem Auftrag gibt es ein **Datenblatt** mit den Feldgeräten
und der gewünschten Funktion. Deine Aufgabe in drei Schritten:

1. **Aufbauen** – Baugruppen auf die Hutschiene stecken, Feldgeräte an passende Kanäle anschließen.
   Jede Leitung belegt Platz im Kabelkanal; ist eine Spalte voll, muss der Aufbau anders werden.
2. **Programmieren** – je CPU ein Projekt wie im TIA-Bausteineditor: PLC-Variablen, OB1 „Main“ in
   SCL oder FUP, Datenbausteine, eigene FB/FC und Alarm-OBs.
3. **Prüfen** – „Prüfen“ startet alle Testfälle mit festen Seeds. Der Logikanalysator zeigt Soll und Ist.

## Bewertung

Ein gelöster Auftrag wird in drei Größen gemessen – jeweils kleiner ist besser:

| Größe | Bedeutung |
|---|---|
| Kosten | Summe der Baugruppenpreise |
| Energie | gewichtete Befehle, gemittelt über alle Testläufe |
| Größe | SCL-Anweisungen bzw. FUP-Boxen |

Die Histogramme im Prüfergebnis zeigen, wo deine Lösung im Vergleich liegt.

## Bedienung

- Baugruppe in der Palette wählen, dann Steckplatz anklicken. Gesteckte Baugruppe anklicken und
  einen freien Steckplatz wählen verschiebt sie; **Entf** entfernt sie.
- Feldgerät anklicken, dann Kanal anklicken: Leitung. **Esc** bricht ab.
- Handbetrieb: Taster gedrückt halten, Schalter klicken, Analoggeber mit dem Schieber.
- Lösungen lassen sich als Datei speichern und laden; „.scl exportieren“ schreibt eine externe Quelle.

## Werkstatt

- **Sandkasten**: freier Aufbau mit allen Baugruppen und Testgeräten, ohne Prüfung.
- **Klemmen-Patience**: eine kleine Pause zwischen zwei Aufträgen.`;

const INTRO_EN = `# Welcome to the workshop

> New to PLCs? The **🎓 Basics course** in the inbox explains everything from scratch – signals,
> logic, timers, counters and step sequences – with small quiz questions.

Customers send jobs by mail. Every job comes with a **datasheet** listing the field devices and the
required function. Your task in three steps:

1. **Build** – plug modules onto the DIN rail, connect field devices to matching channels. Every
   cable takes room in the cable duct; if a column is full, the layout has to change.
2. **Program** – one project per CPU as in the TIA block editor: PLC tags, OB1 “Main” in SCL, FBD or
   LAD, data blocks, own FB/FC (also in GRAPH) and interrupt OBs.
3. **Verify** – “Verify” runs all test cases with fixed seeds. The logic analyzer shows expected and
   actual signals.

## Scoring

A solved job is measured in three quantities – smaller is better in each:

| Quantity | Meaning |
|---|---|
| Cost | sum of the module prices |
| Energy | weighted instructions, averaged over all test runs |
| Size | SCL statements or FBD boxes |

Existing plants additionally count the **changes** to the supplied program. The histograms in the
result show where your solution stands.

## Operation

- Choose a module in the palette, then click a slot. Click a plugged-in module and choose a free
  slot to move it; **Del** removes it.
- Click a field device, then a channel: cable. **Esc** cancels.
- Manual mode: hold buttons pressed, click switches, analog sensors with the slider.
- Solutions can be saved to and loaded from files; “Export .scl” writes an external source.

## Workshop

- **Sandbox**: free building with all modules and test devices, without verification.
- **Terminal Patience**: a small break between two jobs.`;

const PAGES = [
  { id: 'intro', title: 'Erste Schritte', en: 'Getting started' },
  { id: 'modules', title: 'Baugruppen', en: 'Modules' },
  { id: 'cycle', title: 'Zyklus und Alarme', en: 'Cycle and interrupts' },
  { id: 'scl', title: 'SCL', en: 'SCL' },
  { id: 'fup', title: 'FUP', en: 'FBD and LAD' },
  { id: 'boxes', title: 'FUP-Boxen', en: 'FBD boxes' },
  { id: 'online', title: 'Online-Funktionen', en: 'Online functions' },
  { id: 'geraete', title: 'Geräte und Fehler', en: 'Devices and faults' },
  { id: 'technologie', title: 'Technologie', en: 'Technology' },
  { id: 'schrittketten', title: 'Schrittketten verstehen', en: 'Understanding step sequences' },
  { id: 'graph', title: 'GRAPH (Schrittketten)', en: 'GRAPH (step sequences)' },
  { id: 'szenarien', title: 'Szenarien und Zufallsaufträge', en: 'Scenarios and random jobs' },
] as const;

const pageTitle = (p: (typeof PAGES)[number]) => tx(p.title, p.en);

type PageId = (typeof PAGES)[number]['id'];

/** Handbuch im Stil eines gedruckten Datenbuchs: Seitenleiste, Seiten wie Papier. */
export function Handbook({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<PageId>('intro');
  const en = language() === 'en';
  return (
    <div className="handbook">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('level.back')}
        </button>
        <div className="topbar-title">{t('handbook.title')}</div>
      </header>
      <div className="handbook-body">
        <nav className="handbook-nav">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              className={`handbook-link ${page === p.id ? 'active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              <span className="handbook-no">{i + 1}</span> {pageTitle(p)}
            </button>
          ))}
        </nav>
        <article className="paper">
          {page === 'intro' && <Markdown text={en ? INTRO_EN : INTRO} />}
          {page === 'modules' && <Modules />}
          {page === 'cycle' && <Markdown text={en ? semantikEn : semantik} joinLines />}
          {page === 'scl' && <Markdown text={en ? sclEn : scl} joinLines />}
          {page === 'fup' && <Markdown text={en ? fupEn : fup} joinLines />}
          {page === 'boxes' && <Boxes />}
          {page === 'online' && <Markdown text={en ? onlineEn : online} joinLines />}
          {page === 'geraete' && <Markdown text={en ? geraeteEn : geraete} joinLines />}
          {page === 'technologie' && <Markdown text={en ? technologieEn : technologie} joinLines />}
          {page === 'schrittketten' && (
            <Markdown text={en ? schrittkettenEn : schrittketten} joinLines />
          )}
          {page === 'graph' && <Markdown text={en ? graphEn : graph} joinLines />}
          {page === 'szenarien' && <Markdown text={en ? szenarienEn : szenarien} joinLines />}
          <footer className="paper-foot">
            {t('handbook.title')}, {tx('Seite', 'page')} {PAGES.findIndex((p) => p.id === page) + 1}
            : {pageTitle(PAGES.find((p) => p.id === page)!)}
          </footer>
        </article>
      </div>
    </div>
  );
}

function moduleRows(m: ModuleType): [string, string][] {
  const rows: [string, string][] = [
    [tx('Preis', 'Price'), `¤${m.price}`],
    [
      tx('Breite', 'Width'),
      `${m.width} ${m.width > 1 ? tx('Steckplätze', 'slots') : tx('Steckplatz', 'slot')}`,
    ],
  ];
  if (m.cpu) {
    rows.push(
      [tx('Zykluszeit', 'Cycle time'), `${m.cpu.cycleMs} ms`],
      [
        tx('Befehle je Zyklus', 'Instructions per cycle'),
        `${m.cpu.maxOpsPerCycle} (${tx('sonst STOP', 'otherwise STOP')})`,
      ],
      [
        tx('Programmspeicher', 'Program memory'),
        tx(
          `${m.cpu.maxStatements} SCL-Anweisungen / ${m.cpu.maxNetworks} FUP-Netzwerke`,
          `${m.cpu.maxStatements} SCL statements / ${m.cpu.maxNetworks} FBD networks`,
        ),
      ],
      [
        tx('Arbeitsspeicher (Daten)', 'Work memory (data)'),
        `${m.cpu.workMemory} ${tx('Byte', 'bytes')}`,
      ],
      [
        tx('Weckalarm (OB30…38)', 'Cyclic interrupt (OB30…38)'),
        m.cpu.cyclicInterrupt ? tx('ja', 'yes') : tx('nein', 'no'),
      ],
      [
        tx('Prozessalarm (OB40…47)', 'Hardware interrupt (OB40…47)'),
        m.cpu.processInterrupt ? tx('ja', 'yes') : tx('nein', 'no'),
      ],
    );
  }
  const groups = ioGroups(m);
  if (groups.length) {
    rows.push([tx('Kanäle', 'Channels'), groups.map((g) => `${g.kind} ${g.count}`).join(', ')]);
    const ranges = [...new Set(groups.flatMap((g) => g.ranges ?? []))];
    if (ranges.length)
      rows.push([
        tx('Messbereich', 'Measuring range'),
        ranges.map((r) => RANGE_LABEL[r]).join(tx(' oder ', ' or ')),
      ]);
  }
  if (m.delay)
    rows.push([
      tx('Schaltzeiten', 'Switching times'),
      tx(
        `ein ${m.delay.on} ms, aus ${m.delay.off} ms`,
        `on ${m.delay.on} ms, off ${m.delay.off} ms`,
      ),
    ]);
  if (m.alarms)
    rows.push([
      tx('Prozessalarm', 'Hardware interrupt'),
      tx('jede Flanke, wählbar steigend/fallend', 'every edge, rising/falling selectable'),
    ]);
  return rows;
}

function Modules() {
  return (
    <div className="md">
      <h2>{tx('Baugruppen', 'Modules')}</h2>
      <p>
        {tx(
          'Adressen vergibt der Schrank automatisch in Steckplatzreihenfolge je CPU: Digitalbaugruppen ab Byte 0, Analogbaugruppen ab Wort 64, Koppelmodule fest auf Wort 100.',
          'The cabinet assigns addresses automatically in slot order per CPU: digital modules from byte 0, analog modules from word 64, coupler modules fixed at word 100.',
        )}
      </p>
      <div className="datasheets">
        {Object.values(MODULE_TYPES).map((m) => (
          <section key={m.id} className={`datasheet-card ds-${m.kind}`}>
            <h3>
              <span className={`chip chip-${m.kind}`} /> {tr(m.name)}
            </h3>
            <p>{tr(m.description)}</p>
            <table className="md-table">
              <tbody>
                {moduleRows(m).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

function Boxes() {
  const specs = Object.values(BOX_SPECS);
  return (
    <div className="md">
      <h2>{tx('FUP-Boxen', 'FBD boxes')}</h2>
      <p>
        {tx(
          'Alle Boxen des FUP-Editors. Bool-Pins werden verdrahtet oder mit einem Operanden belegt und lassen sich negieren; Wert-Pins bekommen einen Operanden oder eine Konstante.',
          'All boxes of the FBD editor. Bool pins are wired or given an operand and can be negated; value pins get an operand or a constant.',
        )}
      </p>
      {CATEGORIES.map((c) => (
        <section key={c}>
          <h3>{categoryLabel(c)}</h3>
          <table className="md-table">
            <thead>
              <tr>
                <th>Box</th>
                <th>{tx('Eingänge', 'Inputs')}</th>
                <th>{tx('Ausgänge', 'Outputs')}</th>
                <th>{tx('Funktion', 'Function')}</th>
              </tr>
            </thead>
            <tbody>
              {specs
                .filter((s) => s.category === c)
                .map((s) => (
                  <tr key={s.type}>
                    <td>
                      <code>{s.label}</code>
                    </td>
                    <td>
                      {[
                        ...s.inputs.map((p) => p.name),
                        ...(s.variadic ? [`${s.variadic.prefix}${s.variadic.start}…`] : []),
                      ].join(', ')}
                    </td>
                    <td>{s.outputs.map((p) => p.name).join(', ')}</td>
                    <td>{boxDescription(s.type, s.description)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
