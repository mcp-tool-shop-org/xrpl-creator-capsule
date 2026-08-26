use serde_json::Value;
use std::collections::HashSet;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

// ── Bridge worker lifecycle tracking (F-10b68454) ─────────────────────
//
// engine_call spawns a Node.js bridge-worker child process per call and
// blocks on child.wait_with_output() with no timeout and nothing tying
// that child's lifetime to the app window. std::process::Child does not
// kill its child on drop, and nothing in this codebase ever called
// .kill() on one or registered a window-close/exit handler — so if the
// whole app is closed while a call is in flight, the underlying node.exe
// bridge-worker process could keep running invisibly in the background.
//
// DESIGN HAZARD this registry is deliberately built around: a bridge
// worker mid-mint may have ALREADY submitted an irreversible XRPL
// transaction by the time a close is requested. mintReleaseCmd writes
// its receipt to disk as soon as the mint completes, independent of
// whether anything is still reading its stdout — so killing an in-flight
// worker blind would destroy that receipt write, which is WORSE than the
// status quo (an invisible-but-real completion the mint reconcile path
// — see release.tsx's reconcileReceipt(), F-15fcdca0 — can still recover
// after an app restart, exactly BECAUSE the receipt made it to disk).
// Naive kill-on-close is therefore wrong here. What this registry
// enables instead (wired up in lib.rs's on_window_event handler) is:
// ask before killing anything, via a warning surfaced to the frontend,
// and only kill on a CONFIRMED close or once nothing is believed to be
// in flight.
//
// Only the child's OS PID is tracked here, not the `Child` handle
// itself: engine_call's existing child.wait_with_output() call takes
// ownership of the Child (it must, to safely drain stdout/stderr without
// a pipe deadlock), so the Child cannot also live behind a shared Mutex
// without rewriting that proven I/O path — a rewrite this fix
// deliberately avoids attempting, since none of this file can be
// compiled or tested on the machine it was authored on (no cargo/rustc
// toolchain available here; CI on windows-latest runs `cargo check
// --all-targets --locked && cargo test` on push, which is the first
// real compile of this code). A PID plus an OS-level kill command is the
// narrowest change that can track and terminate a spawned bridge worker
// from a completely different callback (the window close-requested
// handler in lib.rs) without touching engine_call's existing I/O logic
// at all beyond adding the track/untrack calls themselves.
//
// RESIDUAL GAP, documented honestly rather than half-solved: this only
// covers a NORMAL close (the window's close-requested event, or a
// confirmed-close command — both go through code that runs). A hard
// crash of the PARENT process (e.g. the OS killing capsule-desktop.exe
// directly, or a power loss) runs no handler at all, and an orphaned
// bridge-worker child would be left exactly as before this fix. The
// standard fix for that specific case is a Windows Job Object
// (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE), which would tie child lifetime
// to the parent at the OS level even on an abnormal exit — but every
// available crate for that (e.g. `win32job`) is a NEW dependency, and
// Cargo.toml/Cargo.lock are frozen (`cargo check --locked` in CI hard-
// fails on any lockfile drift, and there is no cargo here to regenerate
// it correctly). That gap is out of budget for this fix and is left
// here as an explicit, named residual rather than an unstated one.
pub struct BridgeWorkerRegistry(Mutex<HashSet<u32>>);

impl Default for BridgeWorkerRegistry {
    fn default() -> Self {
        BridgeWorkerRegistry(Mutex::new(HashSet::new()))
    }
}

impl BridgeWorkerRegistry {
    fn track(&self, pid: u32) {
        if let Ok(mut set) = self.0.lock() {
            set.insert(pid);
        }
    }

    fn untrack(&self, pid: u32) {
        if let Ok(mut set) = self.0.lock() {
            set.remove(&pid);
        }
    }

    /// Best-effort signal for "is any bridge-worker call currently
    /// believed to be in flight." Accurate as long as every engine_call
    /// invocation always eventually untracks its own PID — which it
    /// does, on every return path, because the untrack happens once
    /// after the whole call's inner closure resolves rather than being
    /// duplicated (and potentially missed) at each individual early
    /// return inside it. See engine_call below.
    pub fn has_in_flight(&self) -> bool {
        self.0.lock().map(|set| !set.is_empty()).unwrap_or(false)
    }

    /// Best-effort kill of every currently-tracked bridge worker PID —
    /// used by lib.rs's on_window_event handler once a close is either
    /// confirmed or nothing is believed to be running. Errors killing
    /// any individual PID (e.g. it already exited on its own between the
    /// check and the kill) are ignored: the goal is "don't leave
    /// anything running," not "guarantee every kill succeeds."
    pub fn kill_all(&self) {
        let pids: Vec<u32> = self
            .0
            .lock()
            .map(|set| set.iter().copied().collect())
            .unwrap_or_default();
        for pid in pids {
            kill_pid(pid);
        }
        if let Ok(mut set) = self.0.lock() {
            set.clear();
        }
    }
}

#[cfg(target_os = "windows")]
fn kill_pid(pid: u32) {
    // /T also kills the process tree (e.g. if node.exe spawned anything
    // further) — /F forces termination without waiting for a graceful
    // shutdown, appropriate here since this only runs once the user has
    // confirmed they want to close regardless.
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(not(target_os = "windows"))]
fn kill_pid(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
}

#[cfg(test)]
mod bridge_worker_registry_tests {
    use super::*;

    // NOTE: like path_containment_tests and atomic_write_tests above,
    // this module could not be compiled or run on this machine (no
    // cargo/rustc toolchain available) — see the accompanying fix
    // description. Run `cargo test bridge_worker_registry_tests` before
    // merging.
    //
    // kill_all()'s tests below use deliberately implausible PIDs (in the
    // 999_0xx range) — this must never find a real process to kill.
    // kill_pid()'s own OS-level call is best-effort and swallows
    // failures (e.g. "no such process"), so these tests only assert the
    // BOOKKEEPING contract (what's tracked before/after), never that a
    // real process was actually terminated — that half is inherently an
    // OS-integration concern outside what a fast, hermetic unit test
    // should attempt.

    #[test]
    fn starts_with_nothing_in_flight() {
        let registry = BridgeWorkerRegistry::default();
        assert!(!registry.has_in_flight());
    }

    #[test]
    fn tracking_a_pid_marks_it_in_flight() {
        let registry = BridgeWorkerRegistry::default();
        registry.track(999_001);
        assert!(registry.has_in_flight());
    }

    #[test]
    fn untracking_the_only_pid_clears_in_flight() {
        let registry = BridgeWorkerRegistry::default();
        registry.track(999_002);
        registry.untrack(999_002);
        assert!(!registry.has_in_flight());
    }

    #[test]
    fn untracking_one_of_several_pids_leaves_the_others_in_flight() {
        let registry = BridgeWorkerRegistry::default();
        registry.track(999_003);
        registry.track(999_004);
        registry.untrack(999_003);
        assert!(registry.has_in_flight());
    }

    #[test]
    fn untracking_an_unknown_pid_is_a_harmless_no_op() {
        let registry = BridgeWorkerRegistry::default();
        registry.untrack(999_005);
        assert!(!registry.has_in_flight());
    }

    #[test]
    fn tracking_the_same_pid_twice_is_idempotent() {
        // A HashSet, not a counter — this documents that choice: a
        // single untrack() always fully clears a PID regardless of how
        // many times track() was called for it.
        let registry = BridgeWorkerRegistry::default();
        registry.track(999_006);
        registry.track(999_006);
        registry.untrack(999_006);
        assert!(!registry.has_in_flight());
    }

    #[test]
    fn kill_all_clears_the_registry_even_for_pids_with_no_real_process() {
        let registry = BridgeWorkerRegistry::default();
        registry.track(999_007);
        registry.track(999_008);
        registry.kill_all();
        assert!(!registry.has_in_flight());
    }

    #[test]
    fn kill_all_on_an_empty_registry_is_a_harmless_no_op() {
        let registry = BridgeWorkerRegistry::default();
        registry.kill_all();
        assert!(!registry.has_in_flight());
    }
}

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

/// The pure part of save_file_atomic — no AppHandle needed, which is
/// exactly what makes it possible to unit test (see
/// atomic_write_tests below): content lands in a sibling `<target>.tmp`
/// file first, then a single filesystem rename moves it into place, so a
/// reader can only ever see the OLD complete content or the NEW complete
/// content, never a half-written mix. `target` must already be an
/// absolute, sandbox-validated path — this function does no validation
/// of its own, by design, so that validation logic (allowed_roots /
/// is_contained) is never duplicated or allowed to drift between
/// save_file and save_file_atomic.
///
/// The temp file is written in the SAME directory as `target` (a sibling
/// filename, not the OS temp dir) so the rename is guaranteed
/// same-filesystem — a cross-filesystem rename is not atomic on every
/// platform.
fn write_file_atomic(target: &Path, content: &str) -> std::io::Result<()> {
    let mut tmp_name = target.as_os_str().to_os_string();
    tmp_name.push(".tmp");
    let tmp_path = PathBuf::from(tmp_name);

    std::fs::write(&tmp_path, content)?;
    match std::fs::rename(&tmp_path, target) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Best-effort cleanup of the orphaned temp file so a
            // repeated failure doesn't leave a growing pile of `.tmp`
            // files — the rename error is the one that gets reported
            // either way.
            let _ = std::fs::remove_file(&tmp_path);
            Err(e)
        }
    }
}

/// Same validation and containment rules as save_file — deliberately
/// re-checked here rather than factored into a shared helper that both
/// commands call, so this change carries zero risk to save_file's
/// existing, proven behavior for every OTHER caller (see the NOTE below
/// on why that matters specifically for this fix) — but writes via
/// write_file_atomic() above instead of a plain std::fs::write, so a
/// crash or power loss mid-write can no longer leave a torn file at
/// `path`.
///
/// F-27abf0dc: capsule-session.json is rewritten by the frontend's
/// autosave on every ~2s debounce tick via what used to be a plain,
/// unguarded save_file write — a real torn-file window on interruption,
/// and the concrete scenario that motivated this fix (a corrupted
/// autosave file previously had no way to be distinguished from "never
/// saved" — see session.ts's loadSession()).
///
/// NOTE: this file could not be compiled or tested on the machine this
/// fix was authored on (no cargo/rustc toolchain available — see the
/// accompanying fix description). CI (windows-latest) runs `cargo check
/// --all-targets --locked && cargo test` on push, which is the first
/// real compile of this code; write_file_atomic()'s own logic IS
/// unit-tested below (atomic_write_tests) against real temp
/// directories, same as path_containment_tests above it.
#[tauri::command]
pub async fn save_file_atomic(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let requested = Path::new(&path);
    if !requested.is_absolute() {
        return Err(format!("Path must be absolute: {}", path));
    }

    let roots = allowed_roots(&app);
    let normalized = normalize_lexically(requested);
    if !is_contained(&normalized, &roots) {
        return Err(format!("Path is outside the app's allowed directories: {}", path));
    }

    if let Some(parent) = normalized.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    write_file_atomic(&normalized, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[cfg(test)]
mod atomic_write_tests {
    use super::*;
    use std::fs;

    // NOTE: like path_containment_tests, this module could not be
    // compiled or run on this machine (no cargo/rustc toolchain
    // available) — see the accompanying fix description. Run `cargo test
    // atomic_write_tests` before merging.

    #[test]
    fn creates_the_target_file_with_the_given_content_when_it_does_not_exist_yet() {
        let tmp = std::env::temp_dir();
        let dir = tmp.join(format!("capsule-atomic-new-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("session.json");

        write_file_atomic(&target, "{\"a\":1}").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"a\":1}");
        // No leftover temp file after a successful write.
        assert!(!dir.join("session.json.tmp").exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn overwrites_existing_content_completely_rather_than_appending_or_merging() {
        let tmp = std::env::temp_dir();
        let dir = tmp.join(format!("capsule-atomic-overwrite-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("session.json");
        fs::write(&target, "{\"old\":true}").unwrap();

        write_file_atomic(&target, "{\"new\":true}").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"new\":true}");
        assert!(!dir.join("session.json.tmp").exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_reader_never_observes_a_missing_file_between_the_write_and_the_rename() {
        // Not a true concurrency test (this codebase has no test
        // infrastructure for interleaving two real OS threads around a
        // syscall boundary) — this instead documents and checks the
        // structural property the atomicity claim rests on: the target
        // path is untouched (old content, or nothing, still present)
        // right up until rename() — a single filesystem operation — and
        // is the new complete content immediately after. There is no
        // intermediate state where `target` exists but is partially
        // written, because nothing ever writes to `target` directly;
        // only to the `.tmp` sibling, which is invisible to a reader of
        // `target` by construction.
        let tmp = std::env::temp_dir();
        let dir = tmp.join(format!("capsule-atomic-visibility-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("session.json");
        fs::write(&target, "{\"before\":true}").unwrap();

        write_file_atomic(&target, "{\"after\":true}").unwrap();

        // The only two legal observations for a concurrent reader are
        // "before" or "after" — this asserts the post-call state is
        // exactly "after" (a full, valid write landed), and that the
        // temp file used to get there is not left behind as a second,
        // inconsistent copy of the data.
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"after\":true}");
        assert!(!dir.join("session.json.tmp").exists());

        fs::remove_dir_all(&dir).ok();
    }
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
///
/// F-10b68454: the spawned child's PID is tracked in `registry` for the
/// duration of this call (see BridgeWorkerRegistry above for the full
/// rationale) so lib.rs's window-close handler can know a bridge worker
/// may still be in flight and ask before killing anything.
#[tauri::command]
pub async fn engine_call(
    app: tauri::AppHandle,
    registry: tauri::State<'_, BridgeWorkerRegistry>,
    command: String,
    params: Value,
) -> Result<Value, String> {
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

    let pid = child.id();
    registry.track(pid);

    // F-10b68454: the rest of this call's existing logic (unchanged)
    // lives inside this closure so `registry.untrack(pid)` below runs
    // exactly ONCE regardless of which path the closure returns through
    // — success, or any of the several `?`-propagated failures inside it
    // — instead of needing to be duplicated at every one of those return
    // points, which is the kind of thing that's easy to miss (leaving a
    // PID stuck "in flight" forever) in code nobody here can compile-
    // check before it ships.
    let result: Result<Value, String> = (|| {
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
    })();

    registry.untrack(pid);
    result
}

/// Kill every tracked bridge-worker process and exit the app
/// immediately. Invoked by the frontend's close-warning dialog when the
/// user confirms "Close Anyway" after being warned that a bridge-worker
/// call may still be in flight — see BridgeWorkerRegistry above and
/// lib.rs's on_window_event handler for the full flow.
///
/// Deliberately a SEPARATE command rather than having the frontend just
/// call the window's close() a second time: that would re-enter
/// CloseRequested and hit the exact same "still in flight" check again
/// (nothing has killed the tracked workers yet at that point), looping
/// forever instead of actually exiting. app.exit() here terminates the
/// whole process directly, bypassing the window-close event machinery
/// entirely.
#[tauri::command]
pub async fn confirm_close_and_exit(
    app: tauri::AppHandle,
    registry: tauri::State<'_, BridgeWorkerRegistry>,
) -> Result<(), String> {
    registry.kill_all();
    app.exit(0);
    Ok(())
}
