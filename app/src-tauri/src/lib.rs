mod commands;

use tauri::Emitter;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // F-10b68454: tracks spawned bridge-worker PIDs across the app's
        // lifetime so a window close can know whether one may still be
        // in flight — see commands.rs's BridgeWorkerRegistry doc comment
        // for the full design rationale (in particular: why this asks
        // before killing anything instead of killing unconditionally).
        .manage(commands::BridgeWorkerRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_file,
            commands::save_file,
            commands::save_file_atomic,
            commands::engine_call,
            commands::confirm_close_and_exit,
        ])
        // F-10b68454: the only window-close path this single-window app
        // has. If a bridge-worker call is believed to be in flight, the
        // close is provisionally blocked (api.prevent_close()) and the
        // frontend is asked to warn the user and get confirmation before
        // anything is killed — see the accompanying fix description for
        // why a mid-mint bridge worker cannot be safely killed blind
        // (it may have already submitted an irreversible XRPL
        // transaction whose receipt write would be destroyed). If
        // nothing is believed to be in flight, this still sweeps
        // kill_all() before allowing the close — normally a no-op, but a
        // defensive catch for anything that slipped through between
        // checks, so nothing is ever left running silently on an
        // ordinary close.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let registry = window.state::<commands::BridgeWorkerRegistry>();
                if registry.has_in_flight() {
                    api.prevent_close();
                    // Best-effort: if the frontend isn't listening (or
                    // the window is already gone) there is nothing more
                    // to do here — the user's next close attempt simply
                    // re-evaluates has_in_flight() again, which will
                    // correctly see success/failure/completion if the
                    // call has settled by then.
                    let _ = window.emit("bridge-worker-close-warning", ());
                } else {
                    registry.kill_all();
                }
            }
        })
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
