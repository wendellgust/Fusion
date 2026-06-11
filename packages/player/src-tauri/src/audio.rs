// System audio control for the Audio Diagnostics panel. Linux-only; shells out
// to `pactl` (PulseAudio / pipewire-pulse). On other platforms the commands
// return empty data so the frontend can degrade gracefully.

use serde::Serialize;
use tauri::command;

#[derive(Serialize, Default)]
pub struct SinkInfo {
    pub name: String,
    pub description: String,
    pub is_default: bool,
}

#[derive(Serialize, Default)]
pub struct ProfileInfo {
    pub name: String,
    pub description: String,
    pub available: bool,
}

#[derive(Serialize, Default)]
pub struct BluetoothInfo {
    pub card_name: String,
    pub active_profile: String,
    pub active_codec: String,
    pub profiles: Vec<ProfileInfo>,
}

#[cfg(target_os = "linux")]
fn pactl(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("pactl")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run pactl: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "pactl {:?} failed: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(target_os = "linux")]
fn pactl_json(args: &[&str]) -> Result<serde_json::Value, String> {
    let mut full = vec!["-f", "json"];
    full.extend_from_slice(args);
    let raw = pactl(&full)?;
    serde_json::from_str(&raw).map_err(|e| format!("failed to parse pactl json: {e}"))
}

#[command]
#[cfg(target_os = "linux")]
pub fn audio_list_sinks() -> Result<Vec<SinkInfo>, String> {
    let default = pactl(&["get-default-sink"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let sinks = pactl_json(&["list", "sinks"])?;
    let arr = sinks.as_array().cloned().unwrap_or_default();
    Ok(arr
        .into_iter()
        .map(|s| {
            let name = s["name"].as_str().unwrap_or_default().to_string();
            SinkInfo {
                description: s["description"]
                    .as_str()
                    .unwrap_or(&name)
                    .to_string(),
                is_default: name == default,
                name,
            }
        })
        .collect())
}

#[command]
#[cfg(target_os = "linux")]
pub fn audio_set_default_sink(name: String) -> Result<(), String> {
    pactl(&["set-default-sink", &name]).map(|_| ())
}

#[command]
#[cfg(target_os = "linux")]
pub fn audio_get_bluetooth() -> Result<Option<BluetoothInfo>, String> {
    let cards = pactl_json(&["list", "cards"])?;
    let arr = cards.as_array().cloned().unwrap_or_default();
    let card = arr.into_iter().find(|c| {
        c["name"]
            .as_str()
            .map(|n| n.starts_with("bluez_card."))
            .unwrap_or(false)
    });
    let Some(card) = card else {
        return Ok(None);
    };

    let card_name = card["name"].as_str().unwrap_or_default().to_string();
    let active_profile = card["active_profile"].as_str().unwrap_or_default().to_string();

    // The negotiated codec lives on the sink, not the card.
    let active_codec = pactl_json(&["list", "sinks"])
        .ok()
        .and_then(|s| s.as_array().cloned())
        .and_then(|sinks| {
            sinks.into_iter().find_map(|s| {
                let is_bt = s["name"]
                    .as_str()
                    .map(|n| n.starts_with("bluez_output."))
                    .unwrap_or(false);
                if is_bt {
                    s["properties"]["api.bluez5.codec"]
                        .as_str()
                        .map(|c| c.to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    let mut profiles = Vec::new();
    if let Some(obj) = card["profiles"].as_object() {
        for (name, val) in obj {
            // Only expose audio-output profiles (A2DP / HSP), skip "off".
            if name == "off" {
                continue;
            }
            profiles.push(ProfileInfo {
                name: name.clone(),
                description: val["description"].as_str().unwrap_or(name).to_string(),
                available: val["available"].as_str().map(|a| a != "no").unwrap_or(true),
            });
        }
    }
    profiles.sort_by(|a, b| a.description.cmp(&b.description));

    Ok(Some(BluetoothInfo {
        card_name,
        active_profile,
        active_codec,
        profiles,
    }))
}

#[command]
#[cfg(target_os = "linux")]
pub fn audio_set_card_profile(card: String, profile: String) -> Result<(), String> {
    pactl(&["set-card-profile", &card, &profile]).map(|_| ())
}

// ---- Non-Linux stubs ------------------------------------------------------

#[command]
#[cfg(not(target_os = "linux"))]
pub fn audio_list_sinks() -> Result<Vec<SinkInfo>, String> {
    Ok(Vec::new())
}

#[command]
#[cfg(not(target_os = "linux"))]
pub fn audio_set_default_sink(_name: String) -> Result<(), String> {
    Err("not supported on this platform".into())
}

#[command]
#[cfg(not(target_os = "linux"))]
pub fn audio_get_bluetooth() -> Result<Option<BluetoothInfo>, String> {
    Ok(None)
}

#[command]
#[cfg(not(target_os = "linux"))]
pub fn audio_set_card_profile(_card: String, _profile: String) -> Result<(), String> {
    Err("not supported on this platform".into())
}
