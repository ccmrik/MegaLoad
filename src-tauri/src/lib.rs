mod commands;
mod models;

use commands::bepinex::*;
use commands::config::*;
use commands::import::*;
use commands::launcher::*;
use commands::logs::*;
use commands::mods::*;
use commands::profiles::*;
use commands::updater::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Profiles
            get_profiles,
            create_profile,
            create_profile_linked,
            delete_profile,
            set_active_profile,
            rename_profile,
            get_profile_path,
            // Mods
            get_mods,
            toggle_mod,
            delete_mod,
            install_mod,
            validate_bepinex,
            // Config
            get_config_files,
            save_config_value,
            reset_config_file,
            // Logs
            read_log_file,
            read_log_tail,
            get_log_size,
            clear_log,
            // Launcher
            detect_valheim_path,
            detect_r2modman_profiles,
            launch_valheim,
            // BepInEx bootstrap
            find_bepinex_sources,
            install_bepinex_core,
            ensure_doorstop,
            download_bepinex,
            // Import (R2Modman — optional)
            import_r2modman_profile,
            // Mod updater
            check_mod_updates,
            install_mod_update,
            auto_update_mods,
            set_mod_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
