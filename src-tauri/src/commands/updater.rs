use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::command;

/// Registry of our mods with their GitHub info.
const MOD_REGISTRY: &[ModRegistryEntry] = &[
    ModRegistryEntry {
        name: "SluttyHoe",
        owner: "ccmrik",
        repo: "SluttyHoe",
        dll_name: "SluttyHoe.dll",
        plugin_folder: "SluttyHoe",
    },
    ModRegistryEntry {
        name: "MegaMegingjord",
        owner: "ccmrik",
        repo: "MegaMegingjord",
        dll_name: "MegaMegingjord.dll",
        plugin_folder: "MegaMegingjord",
    },
    ModRegistryEntry {
        name: "MegaFood",
        owner: "ccmrik",
        repo: "MegaFood",
        dll_name: "MegaFood.dll",
        plugin_folder: "MegaFood",
    },
    ModRegistryEntry {
        name: "MegaShot",
        owner: "ccmrik",
        repo: "MegaShot",
        dll_name: "MegaShot.dll",
        plugin_folder: "MegaShot",
    },
    ModRegistryEntry {
        name: "MegaQoL",
        owner: "ccmrik",
        repo: "MegaQoL",
        dll_name: "MegaQoL.dll",
        plugin_folder: "MegaQoL",
    },
    ModRegistryEntry {
        name: "MegaFishing",
        owner: "ccmrik",
        repo: "MegaFishing",
        dll_name: "MegaFishing.dll",
        plugin_folder: "MegaFishing",
    },
];

struct ModRegistryEntry {
    name: &'static str,
    owner: &'static str,
    repo: &'static str,
    dll_name: &'static str,
    plugin_folder: &'static str,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModUpdateInfo {
    pub name: String,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub download_url: Option<String>,
    pub status: String, // "up-to-date", "update-available", "not-installed", "error"
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateCheckResult {
    pub mods: Vec<ModUpdateInfo>,
    pub total_updates: usize,
}

/// Stores installed mod versions locally so we know what we have.
fn versions_file_path() -> PathBuf {
    let mut p = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    p.push("mod_versions.json");
    p
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(|r| PathBuf::from(r).join("MegaLoad"))
}

fn load_installed_versions() -> std::collections::HashMap<String, String> {
    let path = versions_file_path();
    if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    }
}

fn save_installed_versions(versions: &std::collections::HashMap<String, String>) {
    let path = versions_file_path();
    if let Ok(json) = serde_json::to_string_pretty(versions) {
        let _ = fs::write(&path, json);
    }
}

/// Check all registered mods for updates from GitHub Releases.
#[command]
pub fn check_mod_updates(bepinex_path: String) -> Result<UpdateCheckResult, String> {
    let installed_versions = load_installed_versions();
    let plugins_dir = PathBuf::from(&bepinex_path).join("plugins");
    let mut results = Vec::new();
    let mut total_updates = 0;

    for entry in MOD_REGISTRY {
        let info = check_single_mod(entry, &plugins_dir, &installed_versions);
        if info.has_update {
            total_updates += 1;
        }
        results.push(info);
    }

    Ok(UpdateCheckResult {
        mods: results,
        total_updates,
    })
}

fn check_single_mod(
    entry: &ModRegistryEntry,
    plugins_dir: &PathBuf,
    installed_versions: &std::collections::HashMap<String, String>,
) -> ModUpdateInfo {
    // Check if mod is installed
    let dll_path = plugins_dir.join(entry.plugin_folder).join(entry.dll_name);
    let is_installed = dll_path.exists();

    // Get installed version from our version store
    let installed_version = installed_versions.get(entry.name).cloned();

    // Query GitHub for latest release
    match get_latest_release(entry.owner, entry.repo) {
        Ok((tag, download_url)) => {
            let latest_clean = tag.trim_start_matches('v').to_string();
            let has_update = if !is_installed {
                false // Don't flag update for mods not in the profile
            } else {
                match &installed_version {
                    Some(iv) => {
                        let iv_clean = iv.trim_start_matches('v');
                        iv_clean != latest_clean
                    }
                    None => true, // No version recorded = needs update
                }
            };

            ModUpdateInfo {
                name: entry.name.to_string(),
                installed_version: installed_version.clone(),
                latest_version: Some(latest_clean),
                has_update,
                download_url: if has_update { Some(download_url) } else { None },
                status: if !is_installed {
                    "not-installed".to_string()
                } else if has_update {
                    "update-available".to_string()
                } else {
                    "up-to-date".to_string()
                },
                error: None,
            }
        }
        Err(e) => ModUpdateInfo {
            name: entry.name.to_string(),
            installed_version,
            latest_version: None,
            has_update: false,
            download_url: None,
            status: "error".to_string(),
            error: Some(e),
        },
    }
}

/// Query GitHub Releases API for the latest release.
/// Returns (tag_name, download_url_for_dll_asset).
fn get_latest_release(owner: &str, repo: &str) -> Result<(String, String), String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        owner, repo
    );

    let resp = ureq::get(&url)
        .set("User-Agent", "MegaLoad/0.1.0")
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("GitHub API error for {}/{}: {}", owner, repo, e))?;

    let body = resp
        .into_string()
        .map_err(|e| format!("Read error: {}", e))?;
    let release: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("JSON parse error: {}", e))?;

    let tag = release["tag_name"]
        .as_str()
        .ok_or_else(|| "No tag_name in release".to_string())?
        .to_string();

    // Find the .dll asset in the release
    let assets = release["assets"]
        .as_array()
        .ok_or_else(|| format!("No assets in release {} for {}/{}", tag, owner, repo))?;

    let dll_asset = assets
        .iter()
        .find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.ends_with(".dll"))
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            format!(
                "No .dll asset found in release {} for {}/{}",
                tag, owner, repo
            )
        })?;

    let download_url = dll_asset["browser_download_url"]
        .as_str()
        .ok_or_else(|| "No download URL for asset".to_string())?
        .to_string();

    Ok((tag, download_url))
}

/// Install a single mod update by downloading the DLL from GitHub.
#[command]
pub fn install_mod_update(
    bepinex_path: String,
    mod_name: String,
    download_url: String,
    version: String,
) -> Result<String, String> {
    let entry = MOD_REGISTRY
        .iter()
        .find(|e| e.name == mod_name)
        .ok_or_else(|| format!("Unknown mod: {}", mod_name))?;

    let plugins_dir = PathBuf::from(&bepinex_path).join("plugins");
    let mod_dir = plugins_dir.join(entry.plugin_folder);

    // Ensure mod directory exists
    if !mod_dir.exists() {
        fs::create_dir_all(&mod_dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    let dll_path = mod_dir.join(entry.dll_name);

    // Download the DLL
    let resp = ureq::get(&download_url)
        .set("User-Agent", "MegaLoad/0.1.0")
        .call()
        .map_err(|e| format!("Download failed for {}: {}", mod_name, e))?;

    let mut bytes: Vec<u8> = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Read error: {}", e))?;

    // Write DLL
    let mut file =
        fs::File::create(&dll_path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Update installed version
    let mut versions = load_installed_versions();
    versions.insert(mod_name.clone(), version.clone());
    save_installed_versions(&versions);

    Ok(format!(
        "Updated {} to v{}",
        mod_name,
        version.trim_start_matches('v')
    ))
}

/// Check for updates and install all available updates in one go.
#[command]
pub fn auto_update_mods(bepinex_path: String) -> Result<UpdateCheckResult, String> {
    let check = check_mod_updates(bepinex_path.clone())?;

    let mut updated_mods = check.mods.clone();

    for (i, mod_info) in check.mods.iter().enumerate() {
        if mod_info.has_update {
            if let (Some(url), Some(ver)) = (&mod_info.download_url, &mod_info.latest_version) {
                match install_mod_update(
                    bepinex_path.clone(),
                    mod_info.name.clone(),
                    url.clone(),
                    ver.clone(),
                ) {
                    Ok(_) => {
                        updated_mods[i].status = "updated".to_string();
                        updated_mods[i].has_update = false;
                        updated_mods[i].installed_version = Some(ver.clone());
                    }
                    Err(e) => {
                        updated_mods[i].status = "error".to_string();
                        updated_mods[i].error = Some(e);
                    }
                }
            }
        }
    }

    let remaining = updated_mods.iter().filter(|m| m.has_update).count();
    Ok(UpdateCheckResult {
        mods: updated_mods,
        total_updates: remaining,
    })
}

/// Record the current version of a mod (used after manual install/build).
#[command]
pub fn set_mod_version(mod_name: String, version: String) -> Result<(), String> {
    let mut versions = load_installed_versions();
    versions.insert(mod_name, version);
    save_installed_versions(&versions);
    Ok(())
}
