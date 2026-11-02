import { useEffect, useRef, useState } from 'react';
import { LEVELS, levelById } from '@zyklus/levels';
import { FILE_TYPES, platform, type Command, type OpenedFile } from '@zyklus/platform';
import { t } from './i18n';
import { SANDBOX } from './sandbox';
import { AboutDialog } from './ui/AboutDialog';
import { Handbook } from './screens/Handbook';
import { Inbox, type Place } from './screens/Inbox';
import { LevelScreen } from './screens/LevelScreen';
import { Patience } from './screens/Patience';
import { SandboxScreen, type SandboxStart } from './screens/SandboxScreen';
import { isEditable, onNotice, runCommand, useWindowTitle } from './state/commands';
import {
  listCustomLevels,
  parseAuftragFile,
  putCustomLevel,
  type CustomLevel,
} from './state/customLevels';
import { loadProgress } from './state/persistence';

export function App() {
  const [levelId, setLevelId] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [progress, setProgress] = useState(loadProgress);
  const [custom, setCustom] = useState<CustomLevel[]>(listCustomLevels);
  const [about, setAbout] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Sandkasten mit einer Datei bzw. neuer Anlage öffnen (Menü, Doppelklick) */
  const [sandboxStart, setSandboxStart] = useState<SandboxStart | null>(null);
  const level = levelId
    ? (custom.find((c) => c.level.id === levelId)?.level ?? levelById(levelId))
    : undefined;
  const home = () => {
    setLevelId(null);
    setPlace(null);
    setCustom(listCustomLevels());
  };

  /** Datei je nach Art öffnen: Anlage im Sandkasten, Auftrag im Posteingang, Lösung im Auftrag */
  const routeFile = (f: OpenedFile) => {
    const name = f.name.toLowerCase();
    if (/\.anlage(\.json)?$/.test(name)) {
      if (!runCommand('importAnlage', f.text)) {
        setSandboxStart({ kind: 'import', text: f.text });
        setLevelId(null);
        setPlace('sandkasten');
      }
    } else if (/\.auftrag(\.json)?$/.test(name)) {
      const r = parseAuftragFile(f.text);
      if (!r.ok) return setNotice(`${t('anlage.importFailed')}\n${r.error}`);
      setCustom(putCustomLevel(r.value));
      setPlace(null);
      setLevelId(r.value.level.id);
    } else if (/\.zyklus\.json$/.test(name)) {
      if (!runCommand('importSolution', f.text)) setNotice(t('app.solutionNeedsLevel'));
    } else {
      setNotice(t('app.unknownFile', { name: f.name }));
    }
  };
  const routeRef = useRef(routeFile);
  routeRef.current = routeFile;

  const command = async (cmd: Command) => {
    if (cmd === 'open') {
      const f = await platform.files.open([
        FILE_TYPES.anlage,
        FILE_TYPES.auftrag,
        FILE_TYPES.loesung,
      ]);
      if (f) routeRef.current(f);
    } else if (cmd === 'save' || cmd === 'export') {
      if (!runCommand(cmd)) setNotice(t('app.nothingToSave'));
    } else if (cmd === 'new') {
      if (!runCommand('new')) {
        setSandboxStart({ kind: 'new' });
        setLevelId(null);
        setPlace('sandkasten');
      }
    } else if (cmd === 'handbook') {
      setLevelId(null);
      setPlace('handbook');
    } else if (cmd === 'about') {
      setAbout(true);
    } else if (cmd === 'fullscreen') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } else if (cmd.startsWith('recent:')) {
      const f = await platform.recent?.open(Number(cmd.slice(7)));
      if (f) routeRef.current(f);
      else setNotice(t('app.recentMissing'));
    }
  };
  const commandRef = useRef(command);
  commandRef.current = command;

  // Menüleiste (Desktop), Dateizuordnung und Tastenkürzel
  useEffect(() => {
    const offMenu = platform.onCommand((c) => void commandRef.current(c));
    const offOpen = platform.onOpenFile((f) => routeRef.current(f));
    const offNotice = onNotice(setNotice);
    const key = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      // auf dem Desktop übernimmt die Menüleiste Strg-Kürzel, F1 und F11
      const menu = platform.kind === 'desktop';
      let cmd: Command | null = null;
      if (ctrl && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's') cmd = e.shiftKey ? 'export' : 'save';
        else if (k === 'o') cmd = 'open';
        else if (k === 'n' && !e.shiftKey) cmd = 'new';
      } else if (e.key === 'F11') cmd = 'fullscreen';
      else if (e.key === 'F1') cmd = 'handbook';
      if (cmd) {
        e.preventDefault();
        if (!menu) void commandRef.current(cmd);
        return;
      }
      // Leertaste: Simulation starten/anhalten (nicht beim Tippen oder auf Knöpfen)
      if (e.key === ' ' && !ctrl && !e.altKey && !e.shiftKey && !isEditable(e.target)) {
        if (runCommand('toggleSim')) e.preventDefault();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      offMenu();
      offOpen();
      offNotice();
      window.removeEventListener('keydown', key);
    };
  }, []);

  useWindowTitle('ZYKLUS');

  // Hinweise blenden sich aus
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const overlays = (
    <>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {notice && (
        <div className="notice notice-float" role="alert">
          <span>{notice}</span>
          <button
            className="icon-btn"
            onClick={() => setNotice(null)}
            aria-label={t('dialog.close')}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );

  let screen;
  if (level) {
    screen = (
      <LevelScreen
        key={level.id}
        level={level}
        progress={progress[level.id]}
        onBack={home}
        onProgress={setProgress}
      />
    );
  } else if (place === 'handbook') screen = <Handbook onBack={home} />;
  else if (place === 'patience') screen = <Patience onBack={home} />;
  else if (place === 'sandkasten')
    screen = (
      <SandboxScreen onBack={home} start={sandboxStart} onStarted={() => setSandboxStart(null)} />
    );
  else if (place === 'sandbox')
    screen = <LevelScreen level={SANDBOX} onBack={home} onProgress={() => {}} sandbox />;
  else
    screen = (
      <Inbox
        levels={LEVELS}
        progress={progress}
        onOpen={setLevelId}
        onPlace={setPlace}
        custom={custom}
        onCustom={setCustom}
      />
    );
  return (
    <>
      {screen}
      {overlays}
    </>
  );
}
