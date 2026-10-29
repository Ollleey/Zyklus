import { useState } from 'react';
import { MODULE_TYPES, RANGE_LABEL, ioGroups, tr, type ModuleType } from '@zyklus/sim-core';
import { BOX_SPECS, CATEGORIES } from '@zyklus/fup-model';
import semantik from '../../../../docs/semantik.md?raw';
import scl from '../../../../docs/scl.md?raw';
import fup from '../../../../docs/fup.md?raw';
import { t } from '../i18n';
import { Markdown } from '../ui/Markdown';

const INTRO = `# Willkommen in der Werkstatt

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

const PAGES = [
  { id: 'intro', title: 'Erste Schritte' },
  { id: 'modules', title: 'Baugruppen' },
  { id: 'cycle', title: 'Zyklus und Alarme' },
  { id: 'scl', title: 'SCL' },
  { id: 'fup', title: 'FUP' },
  { id: 'boxes', title: 'FUP-Boxen' },
] as const;

type PageId = (typeof PAGES)[number]['id'];

/** Handbuch im Stil eines gedruckten Datenbuchs: Seitenleiste, Seiten wie Papier. */
export function Handbook({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<PageId>('intro');
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
              <span className="handbook-no">{i + 1}</span> {p.title}
            </button>
          ))}
        </nav>
        <article className="paper">
          {page === 'intro' && <Markdown text={INTRO} />}
          {page === 'modules' && <Modules />}
          {page === 'cycle' && <Markdown text={semantik} joinLines />}
          {page === 'scl' && <Markdown text={scl} joinLines />}
          {page === 'fup' && <Markdown text={fup} joinLines />}
          {page === 'boxes' && <Boxes />}
          <footer className="paper-foot">
            {t('handbook.title')}, Seite {PAGES.findIndex((p) => p.id === page) + 1}:{' '}
            {PAGES.find((p) => p.id === page)!.title}
          </footer>
        </article>
      </div>
    </div>
  );
}

function moduleRows(m: ModuleType): [string, string][] {
  const rows: [string, string][] = [
    ['Preis', `¤${m.price}`],
    ['Breite', `${m.width} ${m.width > 1 ? 'Steckplätze' : 'Steckplatz'}`],
  ];
  if (m.cpu) {
    rows.push(
      ['Zykluszeit', `${m.cpu.cycleMs} ms`],
      ['Befehle je Zyklus', `${m.cpu.maxOpsPerCycle} (sonst STOP)`],
      [
        'Programmspeicher',
        `${m.cpu.maxStatements} SCL-Anweisungen / ${m.cpu.maxNetworks} FUP-Netzwerke`,
      ],
      ['Weckalarm (OB30…38)', m.cpu.cyclicInterrupt ? 'ja' : 'nein'],
      ['Prozessalarm (OB40…47)', m.cpu.processInterrupt ? 'ja' : 'nein'],
    );
  }
  const groups = ioGroups(m);
  if (groups.length) {
    rows.push(['Kanäle', groups.map((g) => `${g.kind} ${g.count}`).join(', ')]);
    const ranges = [...new Set(groups.flatMap((g) => g.ranges ?? []))];
    if (ranges.length) rows.push(['Messbereich', ranges.map((r) => RANGE_LABEL[r]).join(' oder ')]);
  }
  if (m.delay) rows.push(['Schaltzeiten', `ein ${m.delay.on} ms, aus ${m.delay.off} ms`]);
  if (m.alarms) rows.push(['Prozessalarm', 'jede Flanke, wählbar steigend/fallend']);
  return rows;
}

function Modules() {
  return (
    <div className="md">
      <h2>Baugruppen</h2>
      <p>
        Adressen vergibt der Schrank automatisch in Steckplatzreihenfolge je CPU: Digitalbaugruppen
        ab Byte 0, Analogbaugruppen ab Wort 64, Koppelmodule fest auf Wort 100.
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
      <h2>FUP-Boxen</h2>
      <p>
        Alle Boxen des FUP-Editors. Bool-Pins werden verdrahtet oder mit einem Operanden belegt und
        lassen sich negieren; Wert-Pins bekommen einen Operanden oder eine Konstante.
      </p>
      {CATEGORIES.map((c) => (
        <section key={c}>
          <h3>{c}</h3>
          <table className="md-table">
            <thead>
              <tr>
                <th>Box</th>
                <th>Eingänge</th>
                <th>Ausgänge</th>
                <th>Funktion</th>
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
                    <td>{s.description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
