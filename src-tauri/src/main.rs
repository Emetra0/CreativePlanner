// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn get_app_dir() -> String {
    let mut path = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    
    // If running from src-tauri (common in dev), go up one level
    if path.ends_with("src-tauri") {
        path.pop();
    }

    // Target the 'app_storage/local_storage' folder
    path.push("app_storage");
    path.push("local_storage");
    
    if !path.exists() {
        let _ = std::fs::create_dir_all(&path);
    }

    path.to_string_lossy().to_string()
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![get_app_dir])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
