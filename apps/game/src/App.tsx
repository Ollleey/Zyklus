import { useState } from 'react';
import { LEVELS, levelById } from '@zyklus/levels';
import { Inbox } from './screens/Inbox';
import { LevelScreen } from './screens/LevelScreen';
import { loadProgress } from './state/persistence';

export function App() {
  const [levelId, setLevelId] = useState<string | null>(null);
  const [progress, setProgress] = useState(loadProgress);
  const level = levelId ? levelById(levelId) : undefined;

  if (level) {
    return (
      <LevelScreen
        key={level.id}
        level={level}
        progress={progress[level.id]}
        onBack={() => setLevelId(null)}
        onProgress={setProgress}
      />
    );
  }
  return <Inbox levels={LEVELS} progress={progress} onOpen={setLevelId} />;
}
