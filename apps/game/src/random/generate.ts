import type { Level } from '@zyklus/sim-core';

type Reply = { id: number; ok: true; level: Level } | { id: number; ok: false; error: string };

let worker: Worker | null | undefined;
let next = 1;
const waiting = new Map<number, (r: Reply) => void>();

/** Zufallsauftrag zu einem Code erzeugen; im Worker, ohne Worker-Unterstützung im Hauptthread */
export async function generateLevel(code: string): Promise<Level> {
  if (worker === undefined) {
    worker =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./random.worker.ts', import.meta.url), { type: 'module' });
    if (worker)
      worker.onmessage = (e: MessageEvent<Reply>) => {
        waiting.get(e.data.id)?.(e.data);
        waiting.delete(e.data.id);
      };
  }
  if (!worker) {
    const { generateJob } = await import('@zyklus/zufall');
    return generateJob(code).level;
  }
  const id = next++;
  const r = await new Promise<Reply>((resolve) => {
    waiting.set(id, resolve);
    worker!.postMessage({ id, code });
  });
  if (!r.ok) throw new Error(r.error);
  return r.level;
}
