import { useState } from 'react';
import { tr } from '@zyklus/sim-core';
import { LESSONS, pagesOf, type Lesson } from '../course/lessons';
import { language, t } from '../i18n';
import { loadDone, saveDone } from '../state/course';
import { Markdown } from '../ui/Markdown';

interface Props {
  onBack: () => void;
  /** zum ersten Auftrag (Einführung mit Schrittkarte) */
  onFirstJob: () => void;
}

/** Quiz am Ende einer Lektion: jede Frage gilt als gelöst, sobald einmal richtig geantwortet wurde */
function Quiz({ lesson, onSolved }: { lesson: Lesson; onSolved: () => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const pick = (qi: number, oi: number) => {
    setPicked({ ...picked, [qi]: oi });
    if (oi === lesson.quiz[qi]!.correct && !solved.has(qi)) {
      const next = new Set(solved).add(qi);
      setSolved(next);
      if (next.size === lesson.quiz.length) onSolved();
    }
  };
  return (
    <section className="course-quiz" aria-label={t('course.quiz')}>
      <h2>{t('course.quiz')}</h2>
      {lesson.quiz.map((q, qi) => {
        const p = picked[qi];
        const ok = p === q.correct;
        return (
          <div key={qi} className="course-question">
            <p className="course-q">
              {qi + 1}. {tr(q.q)}
            </p>
            <div className="course-options" role="group">
              {q.options.map((o, oi) => (
                <button
                  key={oi}
                  className={`btn btn-small ${p === oi ? (ok ? 'course-right' : 'course-wrong') : ''}`}
                  aria-pressed={p === oi}
                  onClick={() => pick(qi, oi)}
                >
                  {tr(o)}
                </button>
              ))}
            </div>
            {p !== undefined && (
              <p
                className={ok ? 'course-why course-why-ok' : 'course-why course-why-bad'}
                aria-live="polite"
              >
                {ok ? `✓ ${t('course.right')} ` : `✗ ${t('course.wrong')} `}
                {ok ? tr(q.why) : ''}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Grundkurs für Einsteiger: Lektionen wie im Handbuch, seitenweise, mit kurzem Quiz. Der
 * Fortschritt wird gespeichert; am Ende geht es zur Einführung (Auftrag 0).
 */
export function Course({ onBack, onFirstJob }: Props) {
  const [done, setDoneState] = useState<string[]>(loadDone);
  const [idx, setIdx] = useState(() => {
    const first = LESSONS.findIndex((l) => !done.includes(l.id));
    return first < 0 ? 0 : first;
  });
  const [page, setPage] = useState(0);
  const en = language() === 'en';
  const lesson = LESSONS[idx]!;
  const pages = pagesOf(lesson, en);
  const last = page >= pages.length - 1;
  const isDone = done.includes(lesson.id);

  const markDone = () => {
    if (done.includes(lesson.id)) return;
    const next = [...done, lesson.id];
    setDoneState(next);
    saveDone(next);
  };
  const go = (i: number) => {
    setIdx(i);
    setPage(0);
  };
  const nextPage = () => {
    if (!last) setPage(page + 1);
    // Lektion ohne Quiz: mit der letzten Seite erledigt
    if (page + 1 >= pages.length - 1 && !lesson.quiz.length) markDone();
  };

  return (
    <div className="handbook course">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('level.back')}
        </button>
        <div className="topbar-title">{t('course.title')}</div>
        <span className="course-count">
          {t('course.progress', { done: done.length, n: LESSONS.length })}
        </span>
      </header>
      <div className="handbook-body">
        <nav className="handbook-nav" aria-label={t('course.lessons')}>
          {LESSONS.map((l, i) => (
            <button
              key={l.id}
              className={`handbook-link ${i === idx ? 'active' : ''}`}
              onClick={() => go(i)}
            >
              <span className="handbook-no">{done.includes(l.id) ? '✓' : i + 1}</span> {tr(l.title)}
            </button>
          ))}
        </nav>
        <article className="paper">
          <Markdown text={pages[page] ?? ''} joinLines />
          {last && lesson.quiz.length > 0 && (
            <Quiz key={lesson.id} lesson={lesson} onSolved={markDone} />
          )}
          <footer className="course-foot">
            <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← {t('course.prev')}
            </button>
            <span className="course-page">
              {t('course.page', { page: page + 1, n: pages.length })}
            </span>
            {!last ? (
              <button className="btn btn-primary" onClick={nextPage}>
                {t('course.next')} →
              </button>
            ) : idx < LESSONS.length - 1 ? (
              <button
                className="btn btn-primary"
                disabled={!isDone}
                title={isDone ? '' : t('course.quizFirst')}
                onClick={() => go(idx + 1)}
              >
                {t('course.nextLesson')} →
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  markDone();
                  onFirstJob();
                }}
              >
                {t('course.firstJob')} →
              </button>
            )}
          </footer>
          {last && !isDone && lesson.quiz.length > 0 && (
            <p className="muted course-hint">{t('course.quizFirst')}</p>
          )}
        </article>
      </div>
    </div>
  );
}
