mod pty;
mod clipboard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::try_init().ok();
    pty::init_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list,
            clipboard::clipboard_save_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
