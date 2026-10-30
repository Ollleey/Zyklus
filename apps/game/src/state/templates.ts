import sortierstation from '../../../../packages/plant-sim/vorlagen/sortierstation.anlage.json?raw';
import sortierstationLeer from '../../../../packages/plant-sim/vorlagen/sortierstation-leer.anlage.json?raw';
import materialpruefung from '../../../../packages/plant-sim/vorlagen/materialpruefung.anlage.json?raw';
import materialpruefungLeer from '../../../../packages/plant-sim/vorlagen/materialpruefung-leer.anlage.json?raw';
import tankanlage from '../../../../packages/plant-sim/vorlagen/tankanlage.anlage.json?raw';
import tankanlageLeer from '../../../../packages/plant-sim/vorlagen/tankanlage-leer.anlage.json?raw';

/** Vorlagen des Sandkastens (Dateien aus `packages/plant-sim/vorlagen`), je mit und ohne Programm */
export const TEMPLATE_FILES: { id: string; withProgram: string; empty: string }[] = [
  { id: 'sortierstation', withProgram: sortierstation, empty: sortierstationLeer },
  { id: 'materialpruefung', withProgram: materialpruefung, empty: materialpruefungLeer },
  { id: 'tankanlage', withProgram: tankanlage, empty: tankanlageLeer },
];
