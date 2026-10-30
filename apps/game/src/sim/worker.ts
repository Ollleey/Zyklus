import type { Command, Reply } from './protocol';
import type { Channel } from './remote';

/** Kanal zu einem eigenen Web Worker; `null`, wenn der Browser keine Worker kann */
export function workerChannel(): (Channel & { close: () => void }) | null {
  if (typeof Worker === 'undefined') return null;
  const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const handlers: ((r: Reply) => void)[] = [];
  w.onmessage = (e: MessageEvent<Reply>) => {
    for (const h of handlers) h(e.data);
  };
  return {
    send: (cmd: Command) => w.postMessage(cmd),
    onReply: (fn) => handlers.push(fn),
    close: () => w.terminate(),
  };
}
