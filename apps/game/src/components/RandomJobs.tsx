import { useState } from 'react';
import { tr } from '@zyklus/sim-core';
import {
  dailyCode,
  formatCode,
  parseCode,
  randomCode,
  type Blueprint,
  type Difficulty,
  type Variant,
} from '@zyklus/zufall';
import { msg, t } from '../i18n';
import { generateLevel } from '../random/generate';
import { putCustomLevel, removeCustomLevel, type CustomLevel } from '../state/customLevels';
import type { LevelProgress } from '../state/persistence';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface Props {
  /** bereits erzeugte Zufallsaufträge */
  list: CustomLevel[];
  progress: Record<string, LevelProgress>;
  onOpen: (id: string) => void;
  /** neue Liste aller eigenen Aufträge */
  onChange: (all: CustomLevel[]) => void;
}

const DIFF: Difficulty[] = ['L', 'G', 'M'];

/**
 * Zufallsaufträge im Posteingang: aus Bauplan, Schwierigkeit und Art entsteht ein geprüfter
 * Auftrag mit Code. Den Code kann man weitergeben; gleicher Code ergibt denselben Auftrag.
 */
export function RandomJobs({ list, progress, onOpen, onChange }: Props) {
  const [blueprint, setBlueprint] = useState<Blueprint | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('L');
  const [variant, setVariant] = useState<Variant>('N');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomLevel | null>(null);

  const open = async (code: string) => {
    setError(null);
    const have = list.find((c) => c.random?.code === code);
    if (have) {
      onOpen(have.level.id);
      return;
    }
    setBusy(code);
    try {
      const level = await generateLevel(code);
      onChange(putCustomLevel({ level, author: 'ZYKLUS', random: { code } }));
      onOpen(level.id);
    } catch (e) {
      setError(msg((e as Error).message));
    }
    setBusy(null);
  };

  const fromInput = () => {
    const c = parseCode(input);
    if (!c) {
      setError(t('random.badCode'));
      return;
    }
    void open(formatCode(c));
  };

  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(code),
      () => setCopied(null),
    );
  };

  const today = formatCode(dailyCode(new Date()));

  return (
    <section className="random-jobs">
      <h2>{t('random.title')}</h2>
      <p className="muted">{t('random.intro')}</p>
      <div className="random-form">
        <label className="pe-field">
          <span>{t('random.blueprint')}</span>
          <select
            value={blueprint}
            onChange={(e) => setBlueprint(e.target.value as Blueprint | '')}
          >
            <option value="">{t('random.any')}</option>
            <option value="S">{t('random.bp.S')}</option>
            <option value="T">{t('random.bp.T')}</option>
          </select>
        </label>
        <label className="pe-field">
          <span>{t('random.difficulty')}</span>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFF.map((d) => (
              <option key={d} value={d}>
                {t(`random.diff.${d}` as never)}
              </option>
            ))}
          </select>
        </label>
        <label className="pe-field">
          <span>{t('random.variant')}</span>
          <select value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            <option value="N">{t('random.var.N')}</option>
            <option value="F">{t('random.var.F')}</option>
          </select>
        </label>
        <button
          className="btn btn-primary"
          disabled={!!busy}
          onClick={() =>
            void open(
              formatCode(randomCode({ blueprint: blueprint || undefined, difficulty, variant })),
            )
          }
        >
          🎲 {t('random.generate')}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => void open(today)}>
          📅 {t('random.daily')} <code>{today}</code>
        </button>
      </div>
      <div className="random-form">
        <label className="pe-field">
          <span>{t('random.code')}</span>
          <input
            value={input}
            placeholder="SGN-4K7Q2M"
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fromInput()}
          />
        </label>
        <button className="btn" disabled={!!busy || !input.trim()} onClick={fromInput}>
          {t('random.openCode')}
        </button>
      </div>
      {busy && (
        <p className="random-busy" aria-live="polite">
          ⏳ {t('random.busy', { code: busy })}
        </p>
      )}
      {error && (
        <p className="pe-error" role="alert">
          {error}
        </p>
      )}
      {list.length > 0 && (
        <ul className="mail-list">
          {list.map((c) => {
            const p = progress[c.level.id];
            const code = c.random!.code;
            const parsed = parseCode(code);
            return (
              <li key={c.level.id} className="custom-item">
                <button
                  className={`mail-item ${p?.solved ? 'solved' : ''}`}
                  onClick={() => onOpen(c.level.id)}
                >
                  <span className="mail-no">🎲</span>
                  <span className="mail-from">{tr(c.level.customer)}</span>
                  <span className="mail-subject">
                    {tr(c.level.mail.subject)}
                    {parsed && (
                      <span className="random-meta">
                        {' '}
                        · {t(`random.diff.${parsed.difficulty}` as never)}
                        {parsed.variant === 'F' ? ` · ${t('random.var.F')}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="mail-status">
                    {p?.solved ? `✓ ${t('inbox.solved')}` : t('inbox.open')}
                  </span>
                </button>
                <div className="custom-actions">
                  <button
                    className="btn btn-small random-code"
                    title={t('random.copy')}
                    onClick={() => copy(code)}
                  >
                    {copied === code ? '✓' : '⧉'} {code}
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => setDeleting(c)}>
                    {t('custom.delete')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {deleting && (
        <ConfirmDialog
          title={t('custom.delete')}
          text={t('random.deleteConfirm', { code: deleting.random!.code })}
          confirmLabel={t('custom.delete')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onChange(removeCustomLevel(deleting.level.id));
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
