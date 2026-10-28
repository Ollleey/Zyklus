import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { SCL_LANGUAGE_ID, toMonacoMarkers, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import { monaco } from '../monaco-setup';

interface Props {
  value: string;
  onChange: (v: string) => void;
  diagnostics: ProjectDiagnostic[];
  /** Zeile, zu der gesprungen werden soll (ändert sich bei Klick auf eine Meldung) */
  jump?: { line: number; col: number; nonce: number };
}

export function SclEditor({ value, onChange, diagnostics, jump }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
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
          fontFamily: 'JetBrains Mono, Consolas, monospace',
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
