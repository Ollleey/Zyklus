import * as monaco from 'monaco-editor';
// Exportpfad von monaco-editor ≥ 0.5x: "monaco-editor/<pfad>" → esm/vs/<pfad>.js
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';
import { TOKENS } from './theme';
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

// Editorfarben aus den Design-Tokens: Schlüsselwörter im Auswahlblau, Literale gelb,
// Symbole cyan wie Signale, Absolutadressen violett wie im Schrank die Analogadern
const c = TOKENS.color;
const hex = (v: string) => v.replace('#', '');
monaco.editor.defineTheme('zyklus', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: hex(c.select), fontStyle: 'bold' },
    { token: 'keyword.operator', foreground: hex(c.select) },
    { token: 'type', foreground: hex(c.signal) },
    { token: 'predefined', foreground: 'A9C4EE' },
    { token: 'constant', foreground: hex(c.ledYellow) },
    { token: 'number', foreground: hex(c.ledYellow) },
    { token: 'number.time', foreground: hex(c.ledYellow) },
    { token: 'number.hex', foreground: hex(c.ledYellow) },
    { token: 'number.float', foreground: hex(c.ledYellow) },
    { token: 'variable.local', foreground: hex(c.text) },
    { token: 'variable.global', foreground: hex(c.signal) },
    { token: 'variable.address', foreground: 'B79BE6' },
    { token: 'comment', foreground: hex(c.textFaint), fontStyle: 'italic' },
    { token: 'string', foreground: '9FD8A8' },
  ],
  colors: {
    'editor.background': c.bgDeep,
    'editor.foreground': c.text,
    'editor.lineHighlightBackground': c.surface,
    'editor.selectionBackground': c.selectDim,
    'editorLineNumber.foreground': c.textFaint,
    'editorLineNumber.activeForeground': c.text,
    'editorGutter.background': c.bgDeep,
    'editorCursor.foreground': c.select,
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
