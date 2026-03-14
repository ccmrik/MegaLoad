use crate::models::{ConfigEntry, ConfigFile, ConfigSection};
use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub fn get_config_files(bepinex_path: String) -> Result<Vec<ConfigFile>, String> {
    let config_dir = Path::new(&bepinex_path).join("config");
    let mut configs = Vec::new();

    if !config_dir.exists() {
        return Ok(configs);
    }

    let entries = fs::read_dir(&config_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("cfg") {
            match parse_config_file(&path) {
                Ok(config) => configs.push(config),
                Err(_) => continue,
            }
        }
    }

    configs.sort_by(|a, b| a.mod_name.to_lowercase().cmp(&b.mod_name.to_lowercase()));
    Ok(configs)
}

#[command]
pub fn save_config_value(
    config_path: String,
    section: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let path = Path::new(&config_path);
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let mut in_section = false;
    let section_header = format!("[{}]", section);

    for line in &mut lines {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed == section_header;
            continue;
        }
        if in_section {
            if let Some(eq_pos) = trimmed.find('=') {
                let line_key = trimmed[..eq_pos].trim();
                if line_key == key {
                    *line = format!("{} = {}", key, value);
                    break;
                }
            }
        }
    }

    fs::write(path, lines.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_config_file(path: &Path) -> Result<ConfigFile, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Derive mod name from filename (e.g., "com.author.modname.cfg" -> "modname")
    let mod_name = file_name
        .trim_end_matches(".cfg")
        .rsplit('.')
        .next()
        .unwrap_or(&file_name)
        .to_string();

    let mut sections: Vec<ConfigSection> = Vec::new();
    let mut current_section: Option<String> = None;
    let mut current_entries: Vec<ConfigEntry> = Vec::new();
    let mut pending_description: Vec<String> = Vec::new();
    let mut pending_type: Option<String> = None;
    let mut pending_default: Option<String> = None;
    let mut pending_acceptable: Option<Vec<String>> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Section header
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            // Save previous section
            if let Some(sec_name) = current_section.take() {
                sections.push(ConfigSection {
                    name: sec_name,
                    entries: std::mem::take(&mut current_entries),
                });
            }
            current_section = Some(trimmed[1..trimmed.len() - 1].to_string());
            pending_description.clear();
            pending_type = None;
            pending_default = None;
            pending_acceptable = None;
            continue;
        }

        // Comment lines with metadata
        if trimmed.starts_with("##") {
            let comment = trimmed[2..].trim();
            if let Some(rest) = comment.strip_prefix("Setting type:") {
                pending_type = Some(rest.trim().to_string());
            } else if let Some(rest) = comment.strip_prefix("Default value:") {
                pending_default = Some(rest.trim().to_string());
            } else if let Some(rest) = comment.strip_prefix("Acceptable values:") {
                let vals: Vec<String> = rest
                    .split(',')
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .collect();
                if !vals.is_empty() {
                    pending_acceptable = Some(vals);
                }
            } else if !comment.is_empty() {
                pending_description.push(comment.to_string());
            }
            continue;
        }

        // Skip single # comments
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }

        // Key = Value pair
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let value = trimmed[eq_pos + 1..].trim().to_string();

            let entry = ConfigEntry {
                key,
                value,
                default_value: pending_default.take(),
                description: if pending_description.is_empty() {
                    None
                } else {
                    Some(pending_description.drain(..).collect::<Vec<_>>().join("\n"))
                },
                value_type: pending_type.take(),
                acceptable_values: pending_acceptable.take(),
            };
            current_entries.push(entry);
        }
    }

    // Save last section
    if let Some(sec_name) = current_section {
        sections.push(ConfigSection {
            name: sec_name,
            entries: current_entries,
        });
    }

    Ok(ConfigFile {
        file_name,
        mod_name,
        path: path.to_string_lossy().to_string(),
        sections,
    })
}

/// Reset all entries in a config file to their default values.
#[command]
pub fn reset_config_file(config_path: String) -> Result<ConfigFile, String> {
    let path = Path::new(&config_path);
    let config = parse_config_file(path)?;

    // For each entry with a default, write it back
    for section in &config.sections {
        for entry in &section.entries {
            if let Some(ref default) = entry.default_value {
                if entry.value != *default {
                    let _ = save_config_value(
                        config_path.clone(),
                        section.name.clone(),
                        entry.key.clone(),
                        default.clone(),
                    );
                }
            }
        }
    }

    // Re-parse and return updated config
    parse_config_file(path)
}
