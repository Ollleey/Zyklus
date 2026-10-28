import * as monaco from 'monaco-editor';
// Exportpfad von monaco-editor ≥ 0.5x: "monaco-editor/<pfad>" → esm/vs/<pfad>.js
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';
import {
  KEYWORDS,
  SCL_FB_TYPES,
  SCL_FUNCTIONS,
  SCL_LANGUAGE_ID,
  sclLanguageConfiguration,
  sclMonarch,
} from '@zyklus/scl-compiler';

// Monaco lokal bündeln (offline), kein Nachladen aus dem Netz
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

monaco.languages.register({ id: SCL_LANGUAGE_ID });
monaco.languages.setMonarchTokensProvider(
  SCL_LANGUAGE_ID,
  sclMonarch as unknown as monaco.languages.IMonarchLanguage,
);
monaco.languages.setLanguageConfiguration(
  SCL_LANGUAGE_ID,
  sclLanguageConfiguration as unknown as monaco.languages.LanguageConfiguration,
);

monaco.editor.defineTheme('zyklus', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'f2b84b', fontStyle: 'bold' },
    { token: 'keyword.operator', foreground: 'f2b84b' },
    { token: 'type', foreground: '7fd1c7' },
    { token: 'predefined', foreground: '9ecbff' },
    { token: 'constant', foreground: 'd6a0ff' },
    { token: 'number', foreground: 'd6a0ff' },
    { token: 'number.time', foreground: 'd6a0ff' },
    { token: 'number.hex', foreground: 'd6a0ff' },
    { token: 'number.float', foreground: 'd6a0ff' },
    { token: 'variable.local', foreground: 'e6e6e6' },
    { token: 'variable.global', foreground: '8fd694' },
    { token: 'variable.address', foreground: 'ff9d7a' },
    { token: 'comment', foreground: '6f7a86', fontStyle: 'italic' },
    { token: 'string', foreground: 'c3e88d' },
  ],
  colors: {
    'editor.background': '#171a1e',
    'editor.lineHighlightBackground': '#1f2329',
    'editorLineNumber.foreground': '#4a525c',
    'editorGutter.background': '#171a1e',
  },
});

/** Namen, die die Autovervollständigung zusätzlich anbietet (Variablen, DBs). */
let symbols: { label: string; detail: string; insert: string }[] = [];

export function setCompletionSymbols(
  list: { label: string; detail: string; insert: string }[],
): void {
  symbols = list;
}

monaco.languages.registerCompletionItemProvider(SCL_LANGUAGE_ID, {
  triggerCharacters: ['"', '#', '.'],
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    const K = monaco.languages.CompletionItemKind;
    const items: monaco.languages.CompletionItem[] = [
      ...KEYWORDS.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range })),
      ...SCL_FUNCTIONS.map((f) => ({ label: f, kind: K.Function, insertText: f, range })),
      ...SCL_FB_TYPES.map((f) => ({ label: f, kind: K.Class, insertText: f, range })),
      ...symbols.map((s) => ({
        label: s.label,
        detail: s.detail,
        kind: K.Variable,
        insertText: s.insert,
        range,
      })),
    ];
    return { suggestions: items };
  },
});

export { monaco };
