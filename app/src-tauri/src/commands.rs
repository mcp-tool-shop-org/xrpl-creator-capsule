use serde_json::Value;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
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

/// Directories the app is allowed to read/write, mirroring the
/// `fs.scope.allow` list already declared in tauri.conf.json's fs plugin
/// config ($HOME, $DOCUMENT, $DESKTOP, $APPDATA, $APPCONFIG,
/// $APPLOCALDATA). That declared scope only ever governed the
/// tauri-plugin-fs JS API though — it did nothing for these hand-written
/// commands, which is the gap this function closes. See F-f5a82670.
fn allowed_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let resolver = app.path();
    [
        resolver.home_dir(),
        resolver.document_dir(),
        resolver.desktop_dir(),
        resolver.app_data_dir(),
        resolver.app_config_dir(),
        resolver.app_local_data_dir(),
    ]
    .into_iter()
    .filter_map(Result::ok)
    .collect()
}

/// Resolve `.` / `..` components lexically, without touching the
/// filesystem, so this also works for paths that don't exist yet
/// (save_file may be about to create a brand new file).
fn normalize_lexically(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

fn is_contained(candidate: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| candidate.starts_with(root))
}

/// Read a file from disk and return its contents as a string. The path is
/// restricted to the app's allow-listed directories — see F-f5a82670.
/// This used to call std::fs::read_to_string on a caller-supplied path
/// with zero validation, bypassing the tauri-plugin-fs scope entirely and
/// (combined with the app's null CSP) letting anything that ever runs in
/// the webview read arbitrary files the OS user account can access.
#[tauri::command]
pub async fn load_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let requested = Path::new(&path);
    if !requested.is_absolute() {
        return Err(format!("Path must be absolute: {}", path));
    }

    let roots = allowed_roots(&app);
    if !is_contained(&normalize_lexically(requested), &roots) {
        return Err(format!("Path is outside the app's allowed directories: {}", path));
    }

    // The read target must already exist — canonicalize it too, so a
    // symlink planted inside an allowed root but pointing outside of it
    // is also caught, not just a lexical ".." in the string itself.
    let canonical = requested
        .canonicalize()
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;
    if !is_contained(&canonical, &roots) {
        return Err(format!("Path is outside the app's allowed directories: {}", path));
    }

    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to a file on disk. The path is restricted to the app's
/// allow-listed directories — see F-f5a82670. Note: unlike load_file, the
/// target may not exist yet, so containment here relies on lexical
/// normalization rather than canonicalize() — a symlink planted inside an
/// allowed root's existing ancestor directories is a known, narrower
/// residual risk shared with essentially any "create a new file under an
/// allowed root" check, since a not-yet-existing path cannot be
/// canonicalized.
#[tauri::command]
pub async fn save_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let requested = Path::new(&path);
    if !requested.is_absolute() {
        return Err(format!("Path must be absolute: {}", path));
    }

    let roots = allowed_roots(&app);
    let normalized = normalize_lexically(requested);
    if !is_contained(&normalized, &roots) {
        return Err(format!("Path is outside the app's allowed directories: {}", path));
    }

    // Ensure parent directory exists
    if let Some(parent) = normalized.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&normalized, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[cfg(test)]
mod path_containment_tests {
    use super::*;
    use std::fs;

    // These exercise the pure, app-independent parts of the containment
    // logic (normalize_lexically + is_contained) against a real
    // temp-directory root list, without needing a running tauri::AppHandle.
    //
    // NOTE: this crate could not be compiled or run in the sandbox this
    // fix was authored in (no cargo/rustc toolchain was available on the
    // machine) — see the accompanying fix description. Run `cargo test
    // path_containment_tests` before merging.

    #[test]
    fn rejects_a_path_outside_every_allowed_root() {
        let tmp = std::env::temp_dir();
        let allowed_root = tmp.join(format!("capsule-allowed-{}", std::process::id()));
        let outside_root = tmp.join(format!("capsule-outside-{}", std::process::id()));
        fs::create_dir_all(&allowed_root).unwrap();
        fs::create_dir_all(&outside_root).unwrap();
        let outside_file = outside_root.join("secret.json");
        fs::write(&outside_file, "{}").unwrap();

        let roots = vec![normalize_lexically(&allowed_root)];
        let candidate = normalize_lexically(&outside_file);

        assert!(
            !is_contained(&candidate, &roots),
            "a path outside every allowed root must never be reported as contained"
        );

        fs::remove_dir_all(&allowed_root).ok();
        fs::remove_dir_all(&outside_root).ok();
    }

    #[test]
    fn rejects_a_traversal_string_that_lexically_escapes_the_allowed_root() {
        let tmp = std::env::temp_dir();
        let allowed_root = tmp.join(format!("capsule-allowed-trav-{}", std::process::id()));
        fs::create_dir_all(&allowed_root).unwrap();

        let roots = vec![normalize_lexically(&allowed_root)];
        // e.g. "<allowed_root>/../../../etc/passwd" style escape.
        let escaping = allowed_root.join("..").join("..").join("etc").join("passwd");
        let candidate = normalize_lexically(&escaping);

        assert!(
            !is_contained(&candidate, &roots),
            "a lexical .. escape out of the allowed root must be rejected"
        );

        fs::remove_dir_all(&allowed_root).ok();
    }

    #[test]
    fn accepts_a_legitimate_path_inside_an_allowed_root() {
        let tmp = std::env::temp_dir();
        let allowed_root = tmp.join(format!("capsule-allowed-ok-{}", std::process::id()));
        fs::create_dir_all(&allowed_root).unwrap();
        let inside_file = allowed_root.join("manifest.json");

        let roots = vec![normalize_lexically(&allowed_root)];
        let candidate = normalize_lexically(&inside_file);

        assert!(
            is_contained(&candidate, &roots),
            "a legitimate path inside an allowed root must be accepted"
        );

        fs::remove_dir_all(&allowed_root).ok();
    }

    #[test]
    fn accepts_a_not_yet_existing_nested_path_inside_an_allowed_root() {
        // save_file's target may not exist yet — containment must not
        // require existence.
        let tmp = std::env::temp_dir();
        let allowed_root = tmp.join(format!("capsule-allowed-new-{}", std::process::id()));
        // Deliberately do NOT create allowed_root or the nested dirs.
        let brand_new_nested_file = allowed_root.join("nested").join("new-release.json");

        let roots = vec![normalize_lexically(&allowed_root)];
        let candidate = normalize_lexically(&brand_new_nested_file);

        assert!(
            is_contained(&candidate, &roots),
            "a not-yet-existing path under an allowed root must still be accepted"
        );
    }
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
