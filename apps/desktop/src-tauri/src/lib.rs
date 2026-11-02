/// Desktop-Hülle von ZYKLUS: lädt den Build aus `apps/game` in die System-WebView.
/// Spiellogik und Oberfläche laufen unverändert im Web-Teil; hier nur Fenster und Plattform.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Fenstergröße, -position und Maximiert-Zustand über Neustarts merken
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("ZYKLUS konnte nicht gestartet werden");
}
