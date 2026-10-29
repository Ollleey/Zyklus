import { useState } from 'react';
import { LEVELS, levelById } from '@zyklus/levels';
import { SANDBOX } from './sandbox';
import { Handbook } from './screens/Handbook';
import { Inbox, type Place } from './screens/Inbox';
import { LevelScreen } from './screens/LevelScreen';
import { Patience } from './screens/Patience';
import { loadProgress } from './state/persistence';

export function App() {
  const [levelId, setLevelId] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [progress, setProgress] = useState(loadProgress);
  const level = levelId ? levelById(levelId) : undefined;
  const home = () => {
    setLevelId(null);
    setPlace(null);
  };

  if (level) {
    return (
      <LevelScreen
        key={level.id}
        level={level}
        progress={progress[level.id]}
        onBack={home}
        onProgress={setProgress}
      />
    );
  }
  if (place === 'handbook') return <Handbook onBack={home} />;
  if (place === 'patience') return <Patience onBack={home} />;
  if (place === 'sandbox') {
    return <LevelScreen level={SANDBOX} onBack={home} onProgress={() => {}} sandbox />;
  }
  return <Inbox levels={LEVELS} progress={progress} onOpen={setLevelId} onPlace={setPlace} />;
}
