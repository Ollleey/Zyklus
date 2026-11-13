import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { SCL_LANGUAGE_ID, toMonacoMarkers, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import { monaco } from '../monaco-setup';
import { TOKENS } from '../theme';

/** beobachteter Operand einer Zeile */
export interface SclLiveItem {
  label: string;
  value: string;
  kind: 'on' | 'off' | 'num';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  diagnostics: ProjectDiagnostic[];
  /** Zeile, zu der gesprungen werden soll (ändert sich bei Klick auf eine Meldung) */
  jump?: { line: number; col: number; nonce: number };
  /** Beobachten: Operanden und Werte einer Codezeile (während der Simulation) */
  live?: (line: string) => SclLiveItem[] | undefined;
  /** Beobachten: Ergebnis der Bedingung je Zeile (TRUE grün, FALSE blau) */
  conditions?: Map<number, boolean>;
  /** Haltepunkte (Zeilen); Klick in den Rand schaltet um */
  breakpoints?: Set<number>;
  onToggleBreakpoint?: (line: number) => void;
  /** Zeile des erreichten Haltepunkts */
  hitLine?: number;
}

export function SclEditor({
  value,
  onChange,
  diagnostics,
  jump,
  live,
  conditions,
  breakpoints,
  onToggleBreakpoint,
  hitLine,
}: Props) {
  const toggleRef = useRef(onToggleBreakpoint);
  toggleRef.current = onToggleBreakpoint;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const liveRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const shown = useRef('');
  const diagRef = useRef(diagnostics);
  diagRef.current = diagnostics;

  const applyMarkers = () => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'scl', toMonacoMarkers(diagRef.current));
  };

  const onMount: OnMount = (editor) => {
    editorRef.current = editor as unknown as monaco.editor.IStandaloneCodeEditor;
    applyMarkers();
    // Klick in den Rand links (Glyphen oder Zeilennummer) setzt bzw. löscht einen Haltepunkt
    editor.onMouseDown((e) => {
      const T = monaco.editor.MouseTargetType;
      const t = e.target.type as unknown as number;
      if (t !== T.GUTTER_GLYPH_MARGIN && t !== T.GUTTER_LINE_NUMBERS) return;
      const line = e.target.position?.lineNumber;
      if (line && toggleRef.current) toggleRef.current(line);
    });
  };

  useEffect(applyMarkers, [diagnostics]);

  // Beobachten wie im TIA-Portal: Werte aller Operanden einer Zeile in einer Spalte rechts
  // neben dem Code (1 grün, 0 blau); nur neu setzen, wenn sich etwas geändert hat
  useEffect(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model) return;
    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    if (live) {
      const lines = model.getLinesContent();
      const perLine = lines.map((l) => live(l));
      // Spalte hinter der längsten Zeile mit Werten (höchstens 60 Zeichen; längere schieben nach rechts)
      const column =
        Math.min(
          60,
          Math.max(16, ...lines.map((l, k) => (perLine[k]?.length ? l.trimEnd().length : 0))),
        ) + 3;
      for (let n = 1; n <= lines.length; n++) {
        const items = perLine[n - 1];
        if (!items?.length) continue;
        const len = lines[n - 1]!.trimEnd().length;
        const col = model.getLineMaxColumn(n);
        items.forEach((it, k) => {
          const pad = k === 0 ? ' '.repeat(Math.max(2, column - len)) + '│ ' : '  ';
          decos.push(
            {
              range: new monaco.Range(n, col, n, col),
              options: {
                showIfCollapsed: true,
                after: { content: `${pad}${it.label} `, inlineClassName: 'live-name' },
              },
            },
            {
              range: new monaco.Range(n, col, n, col),
              options: {
                showIfCollapsed: true,
                after: { content: it.value, inlineClassName: `live-v live-v-${it.kind}` },
              },
            },
          );
        });
      }
    }
    for (const n of breakpoints ?? []) {
      if (n < 1 || n > model.getLineCount()) continue;
      decos.push({
        range: new monaco.Range(n, 1, n, 1),
        options: {
          glyphMarginClassName: 'bp-dot',
          glyphMarginHoverMessage: { value: 'Haltepunkt' },
        },
      });
    }
    if (hitLine && hitLine <= model.getLineCount()) {
      decos.push({
        range: new monaco.Range(hitLine, 1, hitLine, 1),
        options: { isWholeLine: true, className: 'bp-hit-line' },
      });
    }
    for (const [n, v] of conditions ?? []) {
      if (n < 1 || n > model.getLineCount()) continue;
      decos.push({
        range: new monaco.Range(n, 1, n, 1),
        options: {
          isWholeLine: true,
          className: v ? 'live-cond-true' : 'live-cond-false',
          linesDecorationsClassName: v ? 'live-mark-true' : 'live-mark-false',
        },
      });
    }
    const key = decos
      .map(
        (d) =>
          `${d.range.startLineNumber}:${d.options.after?.content ?? d.options.className ?? d.options.glyphMarginClassName}`,
      )
      .join('|');
    if (key === shown.current) return;
    shown.current = key;
    liveRef.current ??= ed.createDecorationsCollection();
    liveRef.current.set(decos);
  });

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !jump) return;
    ed.revealLineInCenter(jump.line);
    ed.setPosition({ lineNumber: jump.line, column: jump.col });
    ed.focus();
  }, [jump]);

  return (
    <div className="scl-editor">
      <Editor
        language={SCL_LANGUAGE_ID}
        theme="zyklus"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={onMount}
        options={{
          fontSize: 13,
          fontFamily: TOKENS.font.mono,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          renderWhitespace: 'none',
          wordBasedSuggestions: 'off',
          glyphMargin: !!onToggleBreakpoint,
        }}
      />
    </div>
  );
}
