/// <reference lib="webworker" />
import { generateJob } from '@zyklus/zufall';

// Zufallsaufträge im eigenen Thread erzeugen: die Prüfung der Musterlösung dauert einige Sekunden
self.onmessage = (e: MessageEvent<{ id: number; code: string }>) => {
  const { id, code } = e.data;
  try {
    postMessage({ id, ok: true, level: generateJob(code).level });
  } catch (err) {
    postMessage({ id, ok: false, error: (err as Error).message });
  }
};
