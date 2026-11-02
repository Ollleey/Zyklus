/// Desktop-Hülle von ZYKLUS: lädt den Build aus `apps/game` in die System-WebView.
/// Spiellogik und Oberfläche laufen unverändert im Web-Teil; hier nur Fenster und Plattform.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Fenstergröße, -position und Maximiert-Zustand über Neustarts merken
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Spielstände und Anlagen als Dateien, native Dialoge, Ordner im Explorer öffnen
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // per Dialog freigegebene Ordner (z. B. eigener Anlagen-Ordner) bleiben nach Neustart freigegeben
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("ZYKLUS konnte nicht gestartet werden");
}
