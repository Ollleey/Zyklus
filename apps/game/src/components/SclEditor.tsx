import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { SCL_LANGUAGE_ID, toMonacoMarkers, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import { monaco } from '../monaco-setup';
import { TOKENS } from '../theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  diagnostics: ProjectDiagnostic[];
  /** Zeile, zu der gesprungen werden soll (ändert sich bei Klick auf eine Meldung) */
  jump?: { line: number; col: number; nonce: number };
  /** Beobachten: Werte zu einer Codezeile (während der Simulation) */
  live?: (line: string) => string | undefined;
}

export function SclEditor({ value, onChange, diagnostics, jump, live }: Props) {
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
  };

  useEffect(applyMarkers, [diagnostics]);

  // Werte am Zeilenende wie „Beobachten ein“; nur neu setzen, wenn sich etwas geändert hat
  useEffect(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model) return;
    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    if (live) {
      for (let n = 1; n <= model.getLineCount(); n++) {
        const text = live(model.getLineContent(n));
        if (!text) continue;
        const col = model.getLineMaxColumn(n);
        decos.push({
          range: new monaco.Range(n, col, n, col),
          options: {
            showIfCollapsed: true,
            after: { content: `   ${text}`, inlineClassName: 'live-value' },
          },
        });
      }
    }
    const key = decos
      .map((d) => `${d.range.startLineNumber}:${d.options.after?.content}`)
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
        }}
      />
    </div>
  );
}
