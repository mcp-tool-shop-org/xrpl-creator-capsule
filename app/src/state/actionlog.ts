/**
 * Durable action log — the app's support-bundle event trail.
 *
 * F-7f36d738 follow-up: the log used to be ONLY a module-level array in
 * release.tsx, so it reset to empty on every app restart. The concrete
 * failure mode: ErrorBoundary logs a render_crash entry when the app
 * crashes, but "Start Fresh" reloads the page — so a user who crashed,
 * restarted, and then clicked Report exported a bundle whose action log
 * was empty of the very incident being reported. (Wave 7 fixed the
 * Report button's own silent-failure UX; this module closes the
 * durability half.)
 *
 * Design constraints, in priority order:
 *
 *   1. logAction() is called synchronously from many places
 *      (ErrorBoundary.componentDidCatch, every action in release.tsx,
 *      session.ts's failure paths) and must NEVER throw or slow the
 *      caller down. All disk I/O here is fire-and-forget.
 *   2. Persistence is best-effort. The log is diagnostics — a failed
 *      write must never surface as an app error, and must never log
 *      ITSELF into the action log (that would schedule another write of
 *      the same failing file, forever). console.warn is the fallback
 *      trail, once per session.
 *   3. Nothing touches disk until initActionLog() has run (main.tsx
 *      calls it once at startup). Before that, behavior is exactly the
 *      old pure in-memory semantics — which also means every existing
 *      test file that never calls init sees zero I/O.
 *   4. Writes go through save_file_atomic (temp file + rename, same as
 *      capsule-session.json — see F-27abf0dc) so a crash mid-write can
 *      never leave a torn file for the next launch's restore to trip
 *      over, and are coalesced: while one write is in flight, any
 *      number of new entries collapse into a single follow-up write.
 *   5. The log is capped at MAX_LOG_ENTRIES in memory and on disk,
 *      oldest entries dropped first, so a long session (or a long-lived
 *      install) can't grow it unbounded.
 */

import { appDataDir } from "@tauri-apps/api/path";
import { loadFile, saveFileAtomic } from "../bridge/engine";
import { isNotFoundFsError } from "../errors/humanize";

// ── Types (moved from release.tsx, which re-exports them) ───────────

export type ActionStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "canceled"
  | "timed_out"
  // The mint itself succeeded (a real, irreversible on-chain mint
  // happened) but the receipt could not be persisted to disk. This is
  // deliberately distinct from "error" — see F-cf8b67bb: reporting this
  // the same way a real mint failure is reported invites a user to
  // "retry" an already-successful mint and double-issue on the ledger.
  | "receipt_unsaved";

export interface ActionEvent {
  action: string;
  status: ActionStatus;
  startedAt: string;
  endedAt?: string;
  cancelReason?: string;
  timeoutReason?: string;
  artifactPath?: string;
  releaseIdentity?: string;
  mode?: "studio" | "advanced";
  reconciliationResult?: string;
}

// ── Constants ───────────────────────────────────────────────────────

/** Hard cap, in memory and on disk — oldest entries dropped first.
 *  ~200 bytes/entry keeps the file (and the exported support bundle's
 *  actionLog section) around 100KB worst case. */
const MAX_LOG_ENTRIES = 500;

/** Lives in appDataDir alongside capsule-session.json. */
const ACTIONLOG_FILENAME = "capsule-actionlog.json";

interface PersistedActionLog {
  version: 1;
  entries: ActionEvent[];
}

// ── Module state ────────────────────────────────────────────────────

const actionLog: ActionEvent[] = [];

let initPromise: Promise<void> | null = null;
/** True once initActionLog() finished restoring — no writes before it. */
let persistenceArmed = false;
let writeInFlight = false;
let writeQueued = false;
let persistFailureWarned = false;
/** Bumped by resetActionLogForTests() so an in-flight write from a
 *  previous test can never complete against the next test's state. */
let generation = 0;
let cachedPath: string | null = null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Append an event. Synchronous and infallible for the caller — the
 * disk write it schedules is fire-and-forget and swallows every error.
 */
export function logAction(event: ActionEvent): void {
  actionLog.push(event);
  trimToCap(actionLog);
  try {
    schedulePersist();
  } catch {
    // Persistence must never be the reason logging throws.
  }
}

export function getActionLog(): readonly ActionEvent[] {
  return actionLog;
}

/**
 * Empty the log — and persist the cleared state, so an explicit reset
 * (release.tsx's resetAll) does not resurrect old entries next launch.
 */
export function clearActionLog(): void {
  actionLog.length = 0;
  try {
    schedulePersist();
  } catch {
    // Same non-throw contract as logAction.
  }
}

/**
 * Restore the previous run's persisted entries and arm persistence.
 * Called once at startup (main.tsx), fire-and-forget: it never rejects.
 *
 * Restored entries are PREPENDED — they are strictly older than
 * anything logged in this run, including a render_crash that landed
 * while this function was still reading the file. Idempotent: repeat
 * calls return the same promise and never re-read or duplicate.
 */
export function initActionLog(): Promise<void> {
  if (!initPromise) initPromise = restoreAndArm();
  return initPromise;
}

/**
 * Test-only: reset module state (entries, init memo, write queue) so
 * each test starts from a genuinely fresh "process". Bumps the write
 * generation so any still-in-flight fire-and-forget write from a
 * previous test aborts instead of bleeding into the next one.
 */
export function resetActionLogForTests(): void {
  generation++;
  actionLog.length = 0;
  initPromise = null;
  persistenceArmed = false;
  writeInFlight = false;
  writeQueued = false;
  persistFailureWarned = false;
  cachedPath = null;
}

// ── Restore ─────────────────────────────────────────────────────────

async function restoreAndArm(): Promise<void> {
  const gen = generation;
  const restored = await loadPersistedEntries();
  if (gen !== generation) return; // reset while loading (tests only)

  // Entries already in the array were logged during THIS run, before
  // the restore finished — newer than anything restored, so they keep
  // their place at the tail.
  const hadNewEntries = actionLog.length > 0;
  actionLog.unshift(...restored);
  trimToCap(actionLog);
  persistenceArmed = true;
  if (hadNewEntries) schedulePersist();
}

/** Never throws — a broken diagnostics file must not break startup. */
async function loadPersistedEntries(): Promise<ActionEvent[]> {
  let content: string;
  try {
    content = await loadFile(await actionLogFilePath());
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (!isNotFoundFsError(raw)) {
      // Same trail-not-throw culture as session.ts (F-27abf0dc), minus
      // the rethrow: a file that exists but can't be read is worth one
      // entry in the support bundle ("earlier history is missing"), but
      // never worth alarming the user over diagnostics.
      logActionLogLoadFailure();
    }
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logActionLogLoadFailure();
    return [];
  }

  // Unknown version / wrong container shape stays on the QUIET path,
  // mirroring loadSession()'s forward-compat stance (F-343bb92d): a
  // file written by a newer app version must not read as "corrupt".
  if (!isPersistedShape(parsed)) return [];
  return parsed.entries.filter(isValidEntry).slice(-MAX_LOG_ENTRIES);
}

function logActionLogLoadFailure(): void {
  const now = new Date().toISOString();
  // Direct logAction is safe here: persistence isn't armed yet, so this
  // only appends in memory; restoreAndArm's hadNewEntries pass persists
  // it once the (empty) restore completes.
  logAction({ action: "actionlog_load", status: "error", startedAt: now, endedAt: now });
}

function isPersistedShape(v: unknown): v is PersistedActionLog {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { version?: unknown }).version === 1 &&
    Array.isArray((v as { entries?: unknown }).entries)
  );
}

function isValidEntry(v: unknown): v is ActionEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  // Only the three required fields are checked, and status is accepted
  // as any string: entries written by a newer app version (new statuses,
  // new optional fields) must survive a round-trip through an older one
  // — they're display-only diagnostics, not load-bearing state.
  return (
    typeof e.action === "string" &&
    typeof e.status === "string" &&
    typeof e.startedAt === "string"
  );
}

// ── Persist ─────────────────────────────────────────────────────────

/**
 * Coalescing scheduler: at most one write in flight; entries logged
 * while it runs collapse into exactly one follow-up write (which
 * snapshots the array at write time, so it carries all of them). A
 * burst of N logActions therefore costs at most 2 writes.
 *
 * No debounce timer, deliberately: the highest-value entry is a crash
 * logged moments before the user reloads the app, and a timer is a
 * window in which that entry would be lost.
 */
function schedulePersist(): void {
  if (!persistenceArmed) return;
  if (writeInFlight) {
    writeQueued = true;
    return;
  }
  writeInFlight = true;
  const gen = generation;
  void persistNow(gen).finally(() => {
    if (gen !== generation) return; // reset happened mid-write (tests)
    writeInFlight = false;
    if (writeQueued) {
      writeQueued = false;
      schedulePersist();
    }
  });
}

/** Never rejects — best-effort by contract (see module docstring). */
async function persistNow(gen: number): Promise<void> {
  try {
    const path = await actionLogFilePath();
    if (gen !== generation) return;
    const payload: PersistedActionLog = { version: 1, entries: [...actionLog] };
    await saveFileAtomic(path, JSON.stringify(payload, null, 2));
  } catch (err) {
    // NEVER logAction() from here — it would schedule another write of
    // the same failing file, recursively. One console.warn per session
    // is the fallback trail (same rationale as ErrorBoundary's
    // console.error: console is what still works when this doesn't).
    if (!persistFailureWarned) {
      persistFailureWarned = true;
      console.warn("Action log could not be persisted (will keep retrying on later entries):", err);
    }
  }
}

async function actionLogFilePath(): Promise<string> {
  if (cachedPath) return cachedPath;
  const dataDir = await appDataDir();
  // Normalize path separators for cross-platform (same as session.ts).
  const dir = dataDir.replace(/\\/g, "/").replace(/\/$/, "");
  cachedPath = `${dir}/${ACTIONLOG_FILENAME}`;
  return cachedPath;
}

function trimToCap(arr: ActionEvent[]): void {
  if (arr.length > MAX_LOG_ENTRIES) {
    arr.splice(0, arr.length - MAX_LOG_ENTRIES);
  }
}
