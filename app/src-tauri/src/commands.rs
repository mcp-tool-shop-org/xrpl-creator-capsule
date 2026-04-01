use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::Manager;

/// Resolve the monorepo root from the Tauri binary location.
/// In dev mode, CWD is typically `app/src-tauri/`, so root is `../..`.
fn project_root() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_default();

    // Walk up from CWD looking for the monorepo root (has packages/ dir)
    let mut candidate = cwd.as_path();
    loop {
        if candidate.join("packages").is_dir() && candidate.join("app").is_dir() {
            return candidate.to_path_buf();
        }
        match candidate.parent() {
            Some(p) => candidate = p,
            None => break,
        }
    }

    // Fallback: assume CWD is app/src-tauri
    cwd.join("..").join("..")
}

/// Check if we're running in production (bundled binary, not dev mode).
fn is_production() -> bool {
    // In dev mode, the monorepo root has packages/ and app/ dirs.
    // In production, the binary is inside the install directory without the monorepo.
    let root = project_root();
    !root.join("packages").is_dir()
}

/// Resolve the bridge worker script and node executable for the current mode.
/// Dev: `npx tsx app/bridge-worker.ts` from the monorepo root.
/// Production: `node bridge-worker.cjs` from the resource directory.
fn resolve_bridge(app: &tauri::AppHandle) -> Result<(String, Vec<String>, PathBuf), String> {
    if is_production() {
        // Production: bundled bridge-worker.cjs in the resource directory
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to resolve resource dir: {}", e))?;
        let script = resource_dir.join("bridge-worker.cjs");
        if !script.exists() {
            return Err(format!(
                "Bundled bridge worker not found at {}",
                script.display()
            ));
        }
        Ok(("node".to_string(), vec![script.to_string_lossy().to_string()], resource_dir))
    } else {
        // Dev: use npx tsx with the source TypeScript file
        let root = project_root();
        let script = root.join("app").join("bridge-worker.ts");
        if !script.exists() {
            return Err(format!(
                "Bridge worker not found at {}",
                script.display()
            ));
        }
        Ok(("npx".to_string(), vec!["tsx".to_string(), script.to_string_lossy().to_string()], root))
    }
}

/// Read a file from disk and return its contents as a string.
#[tauri::command]
pub async fn load_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to a file on disk.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Call the engine bridge worker with a command and parameters.
/// Dev: spawns `npx tsx app/bridge-worker.ts` from the monorepo.
/// Production: spawns `node bridge-worker.cjs` from the resource directory.
#[tauri::command]
pub async fn engine_call(app: tauri::AppHandle, command: String, params: Value) -> Result<Value, String> {
    let (program, args, working_dir) = resolve_bridge(&app)?;

    let input = serde_json::json!({
        "command": command,
        "params": params,
    });
    let input_str = serde_json::to_string(&input).map_err(|e| e.to_string())?;

    // Spawn the bridge worker process
    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(&working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn bridge worker ({}): {}", program, e))?;

    // Write command JSON to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input_str.as_bytes())
            .map_err(|e| format!("Failed to write to bridge stdin: {}", e))?;
        // Drop stdin to signal EOF
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Bridge worker failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse the JSON response
    let response: Value = serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "Bridge returned invalid JSON: {}. stdout: '{}', stderr: '{}'",
            e, stdout, stderr
        )
    })?;

    // Check the ok/error envelope
    match response.get("ok").and_then(|v| v.as_bool()) {
        Some(true) => Ok(response
            .get("data")
            .cloned()
            .unwrap_or(Value::Null)),
        Some(false) => {
            let error = response
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown bridge error");
            Err(error.to_string())
        }
        None => Err(format!("Unexpected bridge response: {}", stdout)),
    }
}
