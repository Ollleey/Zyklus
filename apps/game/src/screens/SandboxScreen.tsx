import { useEffect, useMemo } from 'react';
import { SandboxPlant, emptyLayout, levelFromLayout, type Layout } from '@zyklus/plant-sim';
import { t } from '../i18n';
import { LogicAnalyzer } from '../components/LogicAnalyzer';
import { PlantEditor } from '../components/plant/PlantEditor';
import { useHistory } from '../state/history';
import { loadLayout, saveLayout } from '../state/layouts';
import { LevelScreen, type PlantSlot } from './LevelScreen';

/**
 * Sandkasten: eigene Anlage bauen, verdrahten, programmieren und live simulieren. Technisch ein
 * Level, das zur Laufzeit aus der Anlage entsteht; Schrank, Compiler und SPS bleiben dieselben.
 */
export function SandboxScreen({ onBack }: { onBack: () => void }) {
  const hist = useHistory<Layout>(() => loadLayout() ?? emptyLayout());
  const layout = hist.value;
  useEffect(() => saveLayout(layout), [layout]);
  const level = useMemo(() => levelFromLayout(layout, t('sandkasten.title')), [layout]);

  const slot: PlantSlot = {
    panel: (run, sim) => ({
      id: 'plant',
      title: t('plant.title'),
      className: 'pane-plant',
      inlineHead: true,
      render: (head) => (
        <PlantEditor
          layout={layout}
          onChange={hist.set}
          undo={hist.undo}
          redo={hist.redo}
          canUndo={hist.canUndo}
          canRedo={hist.canRedo}
          plant={run?.plant instanceof SandboxPlant ? run.plant : null}
          time={run?.time ?? 0}
          live={(fn) => {
            const r = sim.ensureRun();
            if (!(r?.plant instanceof SandboxPlant)) return;
            fn(r.plant);
            if (!sim.running) sim.play();
          }}
          head={head}
        />
      ),
    }),
    simBody: (run) => <LogicAnalyzer level={level} run={run} />,
  };

  return <LevelScreen level={level} onBack={onBack} onProgress={() => {}} sandbox plant={slot} />;
}
