/**
 * Monaco-Integration ohne Abhängigkeit vom Editor-Paket: Die Objekte haben die Form von
 * `languages.IMonarchLanguage`, `languages.LanguageConfiguration` und `editor.IMarkerData`
 * und werden in der App so registriert:
 *
 *   monaco.languages.register({ id: SCL_LANGUAGE_ID });
 *   monaco.languages.setMonarchTokensProvider(SCL_LANGUAGE_ID, sclMonarch);
 *   monaco.languages.setLanguageConfiguration(SCL_LANGUAGE_ID, sclLanguageConfiguration);
 *   monaco.editor.setModelMarkers(model, 'scl', toMonacoMarkers(result.diagnostics));
 */
import type { Diagnostic } from './diagnostics';
import { KEYWORDS } from './lexer';

export const SCL_LANGUAGE_ID = 'scl';

export const SCL_TYPES = [
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'REAL',
  'LREAL',
  'TIME',
];

/** Instanztypen und Anweisungsnamen der Systembausteine */
export const SCL_FB_TYPES = [
  'IEC_TIMER',
  'IEC_COUNTER',
  'TP_TIME',
  'TON_TIME',
  'TOF_TIME',
  'TONR_TIME',
  'CTU_INT',
  'CTD_INT',
  'CTUD_INT',
  'TP',
  'TON',
  'TOF',
  'TONR',
  'CTU',
  'CTD',
  'CTUD',
  'R_TRIG',
  'F_TRIG',
];

export const SCL_FUNCTIONS = [
  'ABS',
  'LIMIT',
  'MIN',
  'MAX',
  'SEL',
  'MUX',
  'NORM_X',
  'SCALE_X',
  'SHL',
  'SHR',
  'ROUND',
  'TRUNC',
  ...SCL_TYPES.flatMap((a) => SCL_TYPES.filter((b) => b !== a).map((b) => `${a}_TO_${b}`)),
];

export const sclMonarch = {
  ignoreCase: true,
  unicode: true,
  defaultToken: '',
  keywords: KEYWORDS.filter(
    (k) => !['AND', 'OR', 'XOR', 'NOT', 'MOD', 'TRUE', 'FALSE'].includes(k),
  ),
  wordOperators: ['AND', 'OR', 'XOR', 'NOT', 'MOD'],
  constants: ['TRUE', 'FALSE'],
  typeKeywords: [...SCL_TYPES, ...SCL_FB_TYPES],
  builtins: SCL_FUNCTIONS,
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\(\*/, 'comment', '@commentParen'],
      [/\/\*/, 'comment', '@commentSlash'],
      [/(?:T|TIME)#-?(?:\d+(?:\.\d+)?(?:ms|d|h|m|s)_?)+/i, 'number.time'],
      [
        /(?:U?S?INT|U?D?INT|U?LINT|L?REAL|L?D?WORD|BYTE|BOOL|B|W|DW)#[-+]?(?:16#[0-9A-F_]+|8#[0-7_]+|2#[01_]+|[\w.]+)/i,
        'number',
      ],
      [/(?:16#[0-9A-F_]+|8#[0-7_]+|2#[01_]+)/i, 'number.hex'],
      [/\d[\d_]*\.\d+(?:e[-+]?\d+)?/i, 'number.float'],
      [/\d[\d_]*(?:e[-+]?\d+)?/i, 'number'],
      [/%[IQM](?:\d+\.\d+|[BWD]\d+)/i, 'variable.address'],
      [/#[\p{L}_][\p{L}\p{N}_]*/u, 'variable.local'],
      [/"[^"]*"/, 'variable.global'],
      [/'[^']*'/, 'string'],
      [
        /[\p{L}_][\p{L}\p{N}_]*/u,
        {
          cases: {
            '@keywords': 'keyword',
            '@wordOperators': 'keyword.operator',
            '@constants': 'constant',
            '@typeKeywords': 'type',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        },
      ],
      [/:=|=>|<=|>=|<>|\.\.|[=<>+\-*/&]/, 'operator'],
      [/[;,.:]/, 'delimiter'],
      [/[()]/, '@brackets'],
    ],
    commentParen: [
      [/\*\)/, 'comment', '@pop'],
      [/[^*]+/, 'comment'],
      [/\*/, 'comment'],
    ],
    commentSlash: [
      [/\*\//, 'comment', '@pop'],
      [/[^*]+/, 'comment'],
      [/\*/, 'comment'],
    ],
  },
};

export const sclLanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['(*', '*)'] as [string, string] },
  brackets: [['(', ')']] as [string, string][],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  indentationRules: {
    increaseIndentPattern: /^\s*(IF|ELSIF|ELSE|CASE|FOR|WHILE|REPEAT|REGION)\b.*$/i,
    decreaseIndentPattern:
      /^\s*(END_IF|ELSIF|ELSE|END_CASE|END_FOR|END_WHILE|UNTIL|END_REPEAT|END_REGION)\b.*$/i,
  },
};

/** Monaco-Schweregrade (`MarkerSeverity`) */
export const MARKER_SEVERITY = { Warning: 4, Error: 8 } as const;

export interface MonacoMarker {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export function toMonacoMarkers(diagnostics: Diagnostic[]): MonacoMarker[] {
  return diagnostics.map((d) => {
    const sameSpot = d.end.line === d.start.line && d.end.col <= d.start.col;
    return {
      severity: d.severity === 'error' ? MARKER_SEVERITY.Error : MARKER_SEVERITY.Warning,
      message: d.message,
      startLineNumber: d.start.line,
      startColumn: d.start.col,
      endLineNumber: d.end.line,
      // leere Spannen (z. B. am Programmende) wenigstens ein Zeichen breit markieren
      endColumn: sameSpot ? d.start.col + 1 : d.end.col,
    };
  });
}
