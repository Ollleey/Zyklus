/** CPU-Typen. Preise, Budgets und Grenzen sind Spiel-Balancing, keine realen Daten. */
export interface CpuType {
  id: string;
  name: string;
  /** Zykluszeit in ms */
  cycleMs: number;
  /** maximal ausgeführte IR-Befehle je Zyklus, sonst Zykluszeitüberschreitung → STOP */
  maxOpsPerCycle: number;
  maxNetworks: number;
  maxStatements: number;
  /** Steckplätze auf der Hutschiene */
  width: number;
  price: number;
  cyclicInterrupt: boolean;
  processInterrupt: boolean;
}

export const CPU_TYPES: Record<'klein' | 'mittel' | 'schnell', CpuType> = {
  klein: {
    id: 'klein',
    name: 'CPU klein',
    cycleMs: 10,
    maxOpsPerCycle: 1000,
    maxNetworks: 10,
    maxStatements: 40,
    width: 2,
    price: 4,
    cyclicInterrupt: false,
    processInterrupt: false,
  },
  mittel: {
    id: 'mittel',
    name: 'CPU mittel',
    cycleMs: 5,
    maxOpsPerCycle: 2000,
    maxNetworks: 30,
    maxStatements: 120,
    width: 3,
    price: 8,
    cyclicInterrupt: true,
    processInterrupt: false,
  },
  schnell: {
    id: 'schnell',
    name: 'CPU schnell',
    cycleMs: 1,
    maxOpsPerCycle: 500,
    maxNetworks: 20,
    maxStatements: 80,
    width: 3,
    price: 10,
    cyclicInterrupt: false,
    processInterrupt: true,
  },
};
