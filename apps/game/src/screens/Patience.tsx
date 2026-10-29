import { useEffect, useState } from 'react';
import { t } from '../i18n';
import {
  CELLS,
  COLORS,
  RANKS,
  deal,
  isRun,
  move,
  toRail,
  won,
  type Card,
  type Game,
  type Source,
  type Target,
} from '../patience/rules';

const STORE = 'zyklus.patience';

interface Stats {
  seed: number;
  wins: number;
}

function loadStats(): Stats {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '') as Stats;
    if (typeof s.seed === 'number' && typeof s.wins === 'number') return s;
  } catch {
    // erster Start oder Speicher nicht verfügbar
  }
  return { seed: 1, wins: 0 };
}

function saveStats(s: Stats) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // ohne Speicher spielbar
  }
}

const COLOR_NAME: Record<Card['color'], string> = {
  braun: 'Braun',
  schwarz: 'Schwarz',
  grau: 'Grau',
  blau: 'Blau',
};

function Klemme({
  card,
  selected,
  onClick,
  onDoubleClick,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      className={`klemme klemme-${card.color} ${selected ? 'klemme-selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={`${COLOR_NAME[card.color]} ${RANKS[card.rank]} mm²`}
    >
      <span className="klemme-ader" />
      <span className="klemme-rank">{RANKS[card.rank]}</span>
      <span className="klemme-unit">mm²</span>
      <span className="klemme-screw" />
    </button>
  );
}

/** Bonusspiel: Reihenklemmen nach Farbe und Querschnitt auf die Sammelschienen sortieren. */
export function Patience({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats>(loadStats);
  const [game, setGame] = useState<Game>(() => deal(stats.seed));
  const [history, setHistory] = useState<Game[]>([]);
  const [sel, setSel] = useState<Source | null>(null);
  const done = won(game);

  useEffect(() => saveStats(stats), [stats]);

  const apply = (next: Game | null) => {
    setSel(null);
    if (!next) return;
    setHistory((h) => [...h, game]);
    setGame(next);
    if (won(next)) setStats((s) => ({ ...s, wins: s.wins + 1 }));
  };

  const newGame = (seed: number) => {
    setStats((s) => ({ ...s, seed }));
    setGame(deal(seed));
    setHistory([]);
    setSel(null);
  };

  const target = (tg: Target) => {
    if (!sel) return;
    apply(move(game, sel, tg));
  };

  const pickColumn = (i: number, index: number) => {
    if (sel) {
      // gleicher Kanal: Auswahl ändern; sonst ist der Klick ein Ziel
      if (sel.kind === 'column' && sel.i === i) {
        setSel(isRun(game.columns[i]!, index) ? { kind: 'column', i, index } : null);
        return;
      }
      target({ kind: 'column', i });
      return;
    }
    if (isRun(game.columns[i]!, index)) setSel({ kind: 'column', i, index });
  };

  return (
    <div className="patience">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('level.back')}
        </button>
        <div className="topbar-title">
          <span className="topbar-name">{t('patience.title')}</span>
          <span className="customer meta-list">
            <span>
              {t('patience.deal')} {game.seed}
            </span>
            <span>
              {game.moves} {t('patience.moves')}
            </span>
            <span>
              {stats.wins} {t('patience.wins')}
            </span>
          </span>
        </div>
        <div className="topbar-actions">
          <button
            className="btn"
            disabled={!history.length}
            onClick={() => {
              setGame(history[history.length - 1]!);
              setHistory((h) => h.slice(0, -1));
              setSel(null);
            }}
          >
            ↶ {t('patience.undo')}
          </button>
          <button className="btn" onClick={() => newGame(game.seed)}>
            ⟲ {t('patience.restart')}
          </button>
          <button className="btn btn-primary" onClick={() => newGame(game.seed + 1)}>
            {t('patience.new')}
          </button>
        </div>
      </header>

      <div className="patience-table" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
        <div className="patience-top">
          <div className="rails">
            {COLORS.map((color, i) => (
              <div
                key={color}
                className={`rail-slot rail-${color}`}
                onClick={() => target({ kind: 'rail', i })}
                title={`${t('patience.rail')} ${COLOR_NAME[color]}`}
              >
                {game.rails[i]! >= 0 ? (
                  <Klemme card={{ color, rank: game.rails[i]! }} />
                ) : (
                  <span className="slot-label">{COLOR_NAME[color]}</span>
                )}
              </div>
            ))}
          </div>
          <div className="cells">
            {Array.from({ length: CELLS }, (_, i) => {
              const card = game.cells[i];
              return (
                <div
                  key={i}
                  className="cell-slot"
                  onClick={() => (card ? undefined : target({ kind: 'cell', i }))}
                >
                  {card ? (
                    <Klemme
                      card={card}
                      selected={sel?.kind === 'cell' && sel.i === i}
                      onClick={() =>
                        sel ? target({ kind: 'cell', i }) : setSel({ kind: 'cell', i })
                      }
                      onDoubleClick={() => apply(toRail(game, { kind: 'cell', i }))}
                    />
                  ) : (
                    <span className="slot-label">{t('patience.cell')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="channels">
          {game.columns.map((col, i) => (
            <div
              key={i}
              className="channel-col"
              onClick={(e) => e.target === e.currentTarget && target({ kind: 'column', i })}
            >
              {col.length === 0 && (
                <div className="channel-empty" onClick={() => target({ kind: 'column', i })} />
              )}
              {col.map((card, k) => (
                <div key={`${card.color}${card.rank}`} className="stack-item">
                  <Klemme
                    card={card}
                    selected={sel?.kind === 'column' && sel.i === i && k >= sel.index}
                    onClick={() => pickColumn(i, k)}
                    onDoubleClick={() =>
                      k === col.length - 1 && apply(toRail(game, { kind: 'column', i, index: k }))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {done && (
          <div className="patience-won">
            <h2>{t('patience.won')}</h2>
            <p>
              {game.moves} {t('patience.moves')}
            </p>
            <button className="btn btn-primary" onClick={() => newGame(game.seed + 1)}>
              {t('patience.new')}
            </button>
          </div>
        )}
      </div>
      <p className="patience-help">{t('patience.help')}</p>
    </div>
  );
}
