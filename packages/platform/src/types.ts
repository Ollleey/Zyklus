/**
 * Plattformschicht: alles, was im Browser anders läuft als in der Desktop-Anwendung. Die
 * Oberfläche ruft nur diese Schnittstelle auf; Spiellogik und Darstellung bleiben gleich.
 */

/** Schlüssel-Wert-Speicher mit der Form von `localStorage` (synchron, aus einem Speicher-Cache) */
export interface SyncStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

/** Dateityp für Speichern/Öffnen, z. B. `{ name: 'Anlage', extensions: ['anlage', 'anlage.json'] }` */
export interface FileFilter {
  name: string;
  extensions: readonly string[];
}

export interface OpenedFile {
  name: string;
  text: string;
}

export interface Platform {
  readonly kind: 'web' | 'desktop';
  readonly storage: SyncStore;
  files: {
    /** Datei schreiben (Download bzw. „Speichern unter“); liefert den Namen oder null bei Abbruch */
    save(suggestedName: string, text: string, filters: FileFilter[]): Promise<string | null>;
    /** Datei wählen und lesen; null bei Abbruch */
    open(filters: FileFilter[]): Promise<OpenedFile | null>;
  };
  /** Datei ins Fenster gezogen bzw. per Doppelklick geöffnet; liefert eine Abmeldung */
  onFileDrop(fn: (file: OpenedFile) => void): () => void;
  /** Desktop: Ordner für „Meine Anlagen“ (anzeigen, ändern, im Explorer öffnen) */
  readonly plantsFolder?: {
    path(): string;
    /** neuen Ordner wählen; die Anlagen werden dorthin geschrieben */
    choose(): Promise<boolean>;
    reveal(): Promise<void>;
  };
  /** vor dem ersten Lesen aufrufen (Desktop lädt dann die Dateien in den Speicher) */
  init(): Promise<void>;
  /** ausstehende Schreibvorgänge abschließen (Beenden) */
  flush(): Promise<void>;
}
