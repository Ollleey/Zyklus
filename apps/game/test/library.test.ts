import { describe, expect, it } from 'vitest';
import { isUnchangedLibraryBlock, type CodeBlock, type PlcProject } from '@zyklus/sim-core';
import { addToLibrary, insertFromLibrary, latestEntries, listLibrary } from '../src/state/library';

const FB: CodeBlock = {
  kind: 'FB',
  name: 'Taster',
  number: 3,
  lang: 'SCL',
  iface: { Input: [{ name: 'IN', type: 'Bool' }], Output: [{ name: 'Q', type: 'Bool' }] },
  source: '#Q := #IN;',
};

describe('Bibliothek', () => {
  it('legt Versionen an und fügt die neueste ins Projekt ein', () => {
    expect(addToLibrary(FB, '01-foerderband')).toBe(1);
    expect(addToLibrary({ ...FB, source: '#Q := NOT #IN;' })).toBe(2);
    addToLibrary({ name: 'Rezept', fields: [{ name: 'Menge', type: 'Real' }] });
    expect(listLibrary()).toHaveLength(3);
    const latest = latestEntries();
    expect(latest.map((e) => `${e.name}@${e.version}`)).toEqual(['Rezept@1', 'Taster@2']);

    const project: PlcProject = {
      tags: [],
      blocks: [{ kind: 'FB', name: 'Anderer', number: 1, lang: 'SCL', iface: {}, source: '' }],
    };
    let p = insertFromLibrary(project, latest[1]!);
    p = insertFromLibrary(p, latest[0]!);
    const b = p.blocks.find((x) => x.name === 'Taster') as CodeBlock;
    expect(b.number).toBe(2);
    expect(b.library).toMatchObject({ name: 'Taster', version: 2 });
    expect(isUnchangedLibraryBlock(b)).toBe(true);
    expect(isUnchangedLibraryBlock({ ...b, source: b.source + ' ' })).toBe(false);
    expect(p.types?.[0]?.name).toBe('Rezept');
  });
});
