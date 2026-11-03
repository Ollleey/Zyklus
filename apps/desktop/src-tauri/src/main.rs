// Ohne Konsolenfenster unter Windows (nur im Release-Build)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux: WebKitGTK zeigt mit manchen Grafiktreibern (NVIDIA, VMs, WSL) nur eine weiße Fläche;
    // ohne DMA-BUF-Renderer läuft es überall. Vom Nutzer gesetzte Werte bleiben.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    zyklus_lib::run()
}
