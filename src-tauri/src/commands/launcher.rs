use crate::commands::app_log::app_log;
use std::path::PathBuf;
use std::fs;
use tauri::command;

#[command]
pub fn detect_valheim_path() -> Result<String, String> {
    let candidates = vec![
        r"C:\Program Files (x86)\Steam\steamapps\common\Valheim",
        r"C:\Program Files\Steam\steamapps\common\Valheim",
        r"D:\Steam\steamapps\common\Valheim",
        r"D:\SteamLibrary\steamapps\common\Valheim",
        r"E:\SteamLibrary\steamapps\common\Valheim",
    ];

    for path in candidates {
        let p = PathBuf::from(path);
        if p.join("valheim.exe").exists() {
            return Ok(path.to_string());
        }
    }

    Err("Valheim installation not found. Please set the path manually.".to_string())
}

#[command]
pub fn detect_r2modman_profiles() -> Result<Vec<(String, String)>, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let r2_path = PathBuf::from(&app_data)
        .join("r2modmanPlus-local")
        .join("Valheim")
        .join("profiles");

    if !r2_path.exists() {
        return Ok(Vec::new());
    }

    let mut profiles = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&r2_path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                let path = entry.path().to_string_lossy().to_string();
                profiles.push((name, path));
            }
        }
    }

    Ok(profiles)
}

#[command]
pub fn launch_valheim(valheim_path: String, bepinex_path: String) -> Result<(), String> {
    app_log(&format!("Launching Valheim: game={}, bepinex={}", valheim_path, bepinex_path));
    let game_dir = PathBuf::from(&valheim_path);
    let valheim_exe = game_dir.join("valheim.exe");
    if !valheim_exe.exists() {
        return Err("valheim.exe not found".to_string());
    }

    let doorstop_dll = PathBuf::from(&bepinex_path)
        .join("core")
        .join("BepInEx.Preloader.dll");

    if !doorstop_dll.exists() {
        return Err(
            "BepInEx core not found in this profile. Go to the Mods page and use \"Install BepInEx\" to set up BepInEx for this profile.".to_string()
        );
    }

    let winhttp = game_dir.join("winhttp.dll");
    if !winhttp.exists() {
        return Err(
            "Unity Doorstop (winhttp.dll) not found in Valheim directory. BepInEx cannot bootstrap without it. Go to Settings to set up doorstop.".to_string()
        );
    }

    // === KEY FIX: Rewrite doorstop_config.ini to use the ABSOLUTE path to this profile's BepInEx ===
    // This is what R2Modman does — env vars are unreliable across doorstop versions.
    let doorstop_config_path = game_dir.join("doorstop_config.ini");
    let absolute_preloader = doorstop_dll.to_string_lossy().to_string();
    write_doorstop_config(&doorstop_config_path, &absolute_preloader)?;

    // Launch with env vars as backup (some doorstop versions respect them)
    std::process::Command::new(valheim_exe)
        .current_dir(&game_dir)
        .env("DOORSTOP_ENABLE", "true")
        .env("DOORSTOP_INVOKE_DLL_PATH", &absolute_preloader)
        .spawn()
        .map_err(|e| format!("Failed to launch Valheim: {}", e))?;

    app_log("Valheim launched successfully");
    Ok(())
}

/// Write a doorstop_config.ini that points to the given absolute BepInEx.Preloader.dll path.
fn write_doorstop_config(path: &PathBuf, target_assembly: &str) -> Result<(), String> {
    let config = format!(
r#"[General]
enabled=true
target_assembly={target_assembly}
redirect_output_log=false
boot_config_override=
ignore_disable_switch=false

[UnityMono]
dll_search_path_override=
debug_enabled=false
debug_address=127.0.0.1:10000
debug_suspend=false
"#);
    fs::write(path, config)
        .map_err(|e| format!("Failed to write doorstop_config.ini: {}", e))
}
