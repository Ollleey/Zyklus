//! Desktop-Hülle von ZYKLUS: lädt den Build aus `apps/game` in die System-WebView.
//! Spiellogik und Oberfläche laufen unverändert im Web-Teil; hier nur Fenster, Menü,
//! Dateizuordnung und Plattformdienste.

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Datei, die beim Start oder per Doppelklick geöffnet wurde
#[derive(Clone, Serialize)]
struct OpenedFile {
    name: String,
    path: String,
    text: String,
}

#[derive(Default)]
struct Launch {
    /// beim Start übergebene Dateien, bis die Oberfläche sie abholt
    files: Mutex<Vec<OpenedFile>>,
    zoom: Mutex<f64>,
}

/// Spieldateien aus Kommandozeilenargumenten lesen (Dateizuordnung)
fn files_from_args(args: &[String]) -> Vec<OpenedFile> {
    args.iter()
        .filter(|a| {
            let l = a.to_lowercase();
            l.ends_with(".anlage")
                || l.ends_with(".auftrag")
                || l.ends_with(".anlage.json")
                || l.ends_with(".auftrag.json")
        })
        .filter_map(|a| {
            let text = std::fs::read_to_string(a).ok()?;
            let name = Path::new(a).file_name()?.to_string_lossy().to_string();
            Some(OpenedFile { name, path: a.clone(), text })
        })
        .collect()
}

/// Menüleiste; `recent` sind die zuletzt geöffneten Dateien (Pfade)
fn build_menu<R: Runtime>(app: &AppHandle<R>, recent: &[String]) -> tauri::Result<Menu<R>> {
    let mut recent_menu = SubmenuBuilder::new(app, "Zuletzt geöffnet");
    if recent.is_empty() {
        recent_menu = recent_menu.item(&MenuItemBuilder::with_id("recent-none", "(keine)").enabled(false).build(app)?);
    }
    for (i, p) in recent.iter().enumerate().take(10) {
        let name = Path::new(p).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| p.clone());
        recent_menu = recent_menu.item(&MenuItemBuilder::with_id(format!("recent:{i}"), name).build(app)?);
    }
    let file = SubmenuBuilder::new(app, "Datei")
        .item(&MenuItemBuilder::with_id("new", "Neue Anlage").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("open", "Öffnen …").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&recent_menu.build()?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", "Speichern").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("export", "Exportieren …").accelerator("CmdOrCtrl+Shift+S").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Beenden").accelerator("Alt+F4").build(app)?)
        .build()?;
    let view = SubmenuBuilder::new(app, "Ansicht")
        .item(&MenuItemBuilder::with_id("fullscreen", "Vollbild").accelerator("F11").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("zoom-in", "Vergrößern").accelerator("CmdOrCtrl+=").build(app)?)
        .item(&MenuItemBuilder::with_id("zoom-out", "Verkleinern").accelerator("CmdOrCtrl+-").build(app)?)
        .item(&MenuItemBuilder::with_id("zoom-reset", "Originalgröße").accelerator("CmdOrCtrl+0").build(app)?)
        .build()?;
    let help = SubmenuBuilder::new(app, "Hilfe")
        .item(&MenuItemBuilder::with_id("handbook", "Handbuch").accelerator("F1").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("about", "Über ZYKLUS").build(app)?)
        .build()?;
    MenuBuilder::new(app).items(&[&file, &view, &help]).build()
}

/// beim Start übergebene Dateien abholen (einmalig)
#[tauri::command]
fn take_launch_files(state: State<'_, Launch>) -> Vec<OpenedFile> {
    std::mem::take(&mut *state.files.lock().unwrap())
}

/// „Zuletzt geöffnet“ im Menü erneuern
#[tauri::command]
fn set_recent(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let menu = build_menu(&app, &paths).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// Datei lesen, die außerhalb der freigegebenen Ordner liegen kann (zuletzt geöffnet)
#[tauri::command]
fn read_opened(path: String) -> Result<OpenedFile, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = Path::new(&path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Ok(OpenedFile { name, path, text })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doppelklick auf eine Datei bei laufendem Spiel: an das offene Fenster weitergeben
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for f in files_from_args(&argv) {
                let _ = app.emit("open-file", f);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        // Fenstergröße, -position und Maximiert-Zustand über Neustarts merken
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Spielstände und Anlagen als Dateien, native Dialoge, Ordner im Explorer öffnen
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // per Dialog freigegebene Ordner (z. B. eigener Anlagen-Ordner) bleiben nach Neustart freigegeben
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(Launch { files: Mutex::new(Vec::new()), zoom: Mutex::new(1.0) })
        .setup(|app| {
            let args: Vec<String> = std::env::args().skip(1).collect();
            *app.state::<Launch>().files.lock().unwrap() = files_from_args(&args);
            let menu = build_menu(app.handle(), &[])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            let Some(win) = app.get_webview_window("main") else { return };
            match id.as_str() {
                "fullscreen" => {
                    let full = win.is_fullscreen().unwrap_or(false);
                    let _ = win.set_fullscreen(!full);
                }
                "zoom-in" | "zoom-out" | "zoom-reset" => {
                    let state = app.state::<Launch>();
                    let mut z = state.zoom.lock().unwrap();
                    *z = match id.as_str() {
                        "zoom-in" => (*z + 0.1).min(2.0),
                        "zoom-out" => (*z - 0.1).max(0.5),
                        _ => 1.0,
                    };
                    let _ = win.set_zoom(*z);
                }
                // Beenden über die normale Schließen-Anfrage (Rückfrage bei ungespeicherten Änderungen)
                "quit" => {
                    let _ = win.close();
                }
                _ => {
                    let _ = app.emit("menu", id);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![take_launch_files, set_recent, read_opened])
        .run(tauri::generate_context!())
        .expect("ZYKLUS konnte nicht gestartet werden");
}
