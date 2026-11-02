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
  /** Arbeitsspeicher für Daten in Byte (Datenbausteine, Instanzen) */
  workMemory: number;
  /** Breite auf der Hutschiene in Rasterschritten zu 15 mm */
  width: number;
  price: number;
  cyclicInterrupt: boolean;
  processInterrupt: boolean;
}

export const CPU_TYPES: Record<'klein' | 'kompakt' | 'mittel' | 'schnell', CpuType> = {
  klein: {
    id: 'klein',
    name: 'CPU klein',
    cycleMs: 10,
    maxOpsPerCycle: 1000,
    maxNetworks: 10,
    maxStatements: 40,
    workMemory: 1024,
    width: 6,
    price: 4,
    cyclicInterrupt: false,
    processInterrupt: false,
  },
  /** wie CPU klein, mit E/A auf der CPU (DI 6, DO 4, AI 2) */
  kompakt: {
    id: 'kompakt',
    name: 'CPU kompakt',
    cycleMs: 10,
    maxOpsPerCycle: 1000,
    maxNetworks: 10,
    maxStatements: 40,
    workMemory: 1024,
    width: 8,
    price: 7,
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
    workMemory: 8192,
    width: 7,
    price: 8,
    cyclicInterrupt: true,
    processInterrupt: true,
  },
  schnell: {
    id: 'schnell',
    name: 'CPU schnell',
    cycleMs: 1,
    maxOpsPerCycle: 500,
    maxNetworks: 20,
    maxStatements: 80,
    workMemory: 4096,
    width: 7,
    price: 10,
    cyclicInterrupt: true,
    processInterrupt: true,
  },
};
