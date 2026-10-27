import { Cpu, ProgramBuilder, Simulation, type CpuConfig } from '../src';

export const TEST_CPU: CpuConfig = { name: 'Test', cycleMs: 1, maxOpsPerCycle: 10_000 };

/** Baut ein Programm und eine CPU daraus. */
export function makeCpu(build: (b: ProgramBuilder) => void, config: Partial<CpuConfig> = {}): Cpu {
  const b = new ProgramBuilder();
  build(b);
  return new Cpu({ ...TEST_CPU, ...config }, b.build());
}

/** Führt genau einen Zyklus zum Zeitpunkt `now` aus. */
export function scanAt(cpu: Cpu, now: number, inputs: Record<string, boolean | number> = {}): void {
  for (const [addr, v] of Object.entries(inputs)) cpu.setInput(addr, v);
  cpu.scan(now);
}

export function simOf(cpu: Cpu): Simulation {
  return new Simulation([cpu]);
}
