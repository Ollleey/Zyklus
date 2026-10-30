/// <reference lib="webworker" />
import type { Command } from './protocol';
import { SimHost } from './host';

// Simulationslauf des Sandkastens im eigenen Thread
const host = new SimHost((r) => postMessage(r));
self.onmessage = (e: MessageEvent<Command>) => host.handle(e.data);
