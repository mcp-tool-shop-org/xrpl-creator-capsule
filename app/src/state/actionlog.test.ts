/**
 * F-7f36d738 follow-up: the action log used to live ONLY in a
 * module-level array in release.tsx — so a user who crashed, restarted,
 * and then clicked Report got a support bundle whose action log was
 * empty of the very incident being reported. ErrorBoundary DOES log a
 * render_crash entry, but "Start Fresh" reloads the page, which is
 * exactly the moment the in-memory array evaporated.
 *
 * These tests pin the durable-log contract:
 *   - logAction() stays synchronous, non-throwing, and pure in-memory
 *     until initActionLog() has armed persistence (so nothing changes
 *     for callers, and test files that never init see zero disk I/O).
 *   - After init, every logAction schedules a best-effort, coalesced,
 *     ATOMIC write of capsule-actionlog.json (same appDataDir +
 *     save_file_atomic pattern as capsule-session.json).
 *   - initActionLog() restores the previous run's entries UNDER entries
 *     already logged this run (restored entries are older), so a crash
 *     logged while the restore was still reading disk keeps its place.
 *   - The log is capped at a fixed entry count in memory AND on disk,
 *     oldest dropped first, so a long-lived install can't grow it
 *     unbounded.
 *   - A persistence failure must never throw into the caller, never
 *     recursively log itself (that would schedule another doomed write
 *     of the same failing file), and must not stop LATER writes from
 *     retrying.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  logAction,
  getActionLog,
  clearActionLog,
  initActionLog,
  resetActionLogForTests,
  type ActionEvent,
} from "./actionlog";

const mockInvoke = vi.mocked(invoke);

const LOG_PATH = "/mock/app-data/capsule-actionlog.json";
const NOT_FOUND = () =>
  new Error(
    `Failed to read ${LOG_PATH}: The system cannot find the file specified. (os error 2)`
  );

function entry(action: string, startedAt = "2026-08-26T00:00:00.000Z"): ActionEvent {
  return { action, status: "done", startedAt };
}

function persistedFile(entries: ActionEvent[]): string {
  return JSON.stringify({ version: 1, entries });
}

/**
 * In-memory fake fs over the mocked invoke(): load_file reads from it,
 * save_file_atomic writes into it and records every write for
 * assertions — mirrors session.test.ts's mockLoadFile/mockSaveCapture
 * helpers, combined because these tests exercise read-then-write flows.
 */
function mockFs(initial: Record<string, string | Error> = {}) {
  const files: Record<string, string | Error> = { ...initial };
  const writes: Array<{ path: string; content: string }> = [];
  mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "load_file") {
      const path = (args as { path: string }).path;
      const result = files[path];
      if (result instanceof Error) throw result;
      if (result !== undefined) return result;
      throw new Error(
        `Failed to read ${path}: The system cannot find the file specified. (os error 2)`
      );
    }
    if (cmd === "save_file_atomic") {
      const a = args as { path: string; content: string };
      files[a.path] = a.content;
      writes.push({ path: a.path, content: a.content });
      return undefined;
    }
    throw new Error(`Unknown command: ${cmd}`);
  });
  return { files, writes };
}

function parseWrite(write: { content: string }): { version: number; entries: ActionEvent[] } {
  return JSON.parse(write.content);
}

/** Let already-scheduled fire-and-forget work settle. */
async function settle() {
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetActionLogForTests();
});

// ── In-memory behavior (unchanged contract) ─────────────────────────

describe("action log — in-memory behavior", () => {
  it("appends entries and reads them back in order", () => {
    logAction(entry("mint"));
    logAction(entry("verify"));
    expect(getActionLog().map((e) => e.action)).toEqual(["mint", "verify"]);
  });

  it("clearActionLog empties the log", () => {
    logAction(entry("mint"));
    clearActionLog();
    expect(getActionLog()).toHaveLength(0);
  });

  it("never touches disk before initActionLog() has armed persistence — existing callers and tests see zero I/O", async () => {
    logAction(entry("mint"));
    clearActionLog();
    logAction(entry("verify"));
    await settle();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ── initActionLog: restore on startup ───────────────────────────────

describe("initActionLog — restoring the previous run", () => {
  it("loads persisted entries back into the log", async () => {
    mockFs({ [LOG_PATH]: persistedFile([entry("mint"), entry("render_crash")]) });

    await initActionLog();

    expect(getActionLog().map((e) => e.action)).toEqual(["mint", "render_crash"]);
  });

  it("stays silent and empty when no log file has ever been written (first launch)", async () => {
    mockFs({ [LOG_PATH]: NOT_FOUND() });

    await initActionLog();

    expect(getActionLog()).toHaveLength(0);
  });

  it("starts empty but leaves an actionlog_load error trail when the file exists but is corrupt JSON — and never throws", async () => {
    mockFs({ [LOG_PATH]: "NOT JSON {{{" });

    await initActionLog();

    const entries = getActionLog();
    expect(entries.some((e) => e.action === "actionlog_load" && e.status === "error")).toBe(true);
    // Only the trail entry — nothing was restorable.
    expect(entries).toHaveLength(1);
  });

  it("starts empty but leaves an actionlog_load error trail when a permission error prevents reading the file", async () => {
    mockFs({
      [LOG_PATH]: new Error(
        `Failed to read ${LOG_PATH}: Access is denied. (os error 5)`
      ),
    });

    await initActionLog();

    expect(
      getActionLog().some((e) => e.action === "actionlog_load" && e.status === "error")
    ).toBe(true);
  });

  it("quietly starts empty on an unrecognized version — forward-compat, like the session shape check", async () => {
    mockFs({ [LOG_PATH]: JSON.stringify({ version: 99, entries: [entry("mint")] }) });

    await initActionLog();

    expect(getActionLog()).toHaveLength(0);
  });

  it("quietly starts empty when entries is not an array", async () => {
    mockFs({ [LOG_PATH]: JSON.stringify({ version: 1, entries: "nope" }) });

    await initActionLog();

    expect(getActionLog()).toHaveLength(0);
  });

  it("filters out malformed entries but keeps the valid ones", async () => {
    mockFs({
      [LOG_PATH]: JSON.stringify({
        version: 1,
        entries: [
          entry("mint"),
          null,
          "not-an-entry",
          { action: 42, status: "done", startedAt: "x" },
          { action: "no-startedAt", status: "done" },
          entry("verify"),
        ],
      }),
    });

    await initActionLog();

    expect(getActionLog().map((e) => e.action)).toEqual(["mint", "verify"]);
  });

  it("puts restored (older-run) entries BEFORE entries already logged this run", async () => {
    mockFs({ [LOG_PATH]: persistedFile([entry("older_run_event")]) });

    // An entry logged before init ran at all — e.g. a very early crash.
    logAction(entry("early_this_run"));
    await initActionLog();

    expect(getActionLog().map((e) => e.action)).toEqual(["older_run_event", "early_this_run"]);
  });

  it("keeps ordering even for an entry logged WHILE the restore is still reading disk — the ErrorBoundary-during-startup race", async () => {
    let resolveLoad: ((content: string) => void) | undefined;
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") {
        return new Promise<string>((r) => {
          resolveLoad = r;
        });
      }
      if (cmd === "save_file_atomic") return undefined;
      throw new Error(`Unknown command: ${cmd}`);
    });

    const initP = initActionLog();
    await vi.waitFor(() => expect(resolveLoad).toBeDefined());

    // The crash lands while the disk read is still in flight.
    logAction({ action: "render_crash", status: "error", startedAt: "2026-08-26T00:00:01.000Z" });

    resolveLoad!(persistedFile([entry("older_run_event")]));
    await initP;

    expect(getActionLog().map((e) => e.action)).toEqual(["older_run_event", "render_crash"]);
  });

  it("is idempotent — a second call neither re-reads the file nor duplicates entries", async () => {
    mockFs({ [LOG_PATH]: persistedFile([entry("mint")]) });

    await initActionLog();
    await initActionLog();

    expect(getActionLog().map((e) => e.action)).toEqual(["mint"]);
    const loadCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "load_file");
    expect(loadCalls).toHaveLength(1);
  });
});

// ── Persistence after init ──────────────────────────────────────────

describe("persistence — writes after initActionLog()", () => {
  it("persists a logged entry to capsule-actionlog.json via the atomic write command", async () => {
    const { writes } = mockFs({ [LOG_PATH]: NOT_FOUND() });
    await initActionLog();

    logAction(entry("mint"));

    await vi.waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(1));
    const last = parseWrite(writes[writes.length - 1]);
    expect(writes[writes.length - 1].path).toBe(LOG_PATH);
    expect(last.version).toBe(1);
    expect(last.entries.map((e) => e.action)).toEqual(["mint"]);
  });

  it("coalesces a burst of logActions into at most two writes, with the final write carrying every entry", async () => {
    const { writes } = mockFs({ [LOG_PATH]: NOT_FOUND() });
    await initActionLog();

    for (let i = 0; i < 5; i++) logAction(entry(`burst_${i}`));

    await vi.waitFor(() => {
      expect(writes.length).toBeGreaterThanOrEqual(1);
      const last = parseWrite(writes[writes.length - 1]);
      expect(last.entries).toHaveLength(5);
    });
    await settle();
    expect(writes.length).toBeLessThanOrEqual(2);
    const last = parseWrite(writes[writes.length - 1]);
    expect(last.entries.map((e) => e.action)).toEqual([
      "burst_0",
      "burst_1",
      "burst_2",
      "burst_3",
      "burst_4",
    ]);
  });

  it("F-7f36d738: a crash logged in run 1 is still in the log after a restart — the post-crash Report finally contains the incident", async () => {
    // ── Run 1: app crashes, ErrorBoundary logs it, page reloads ──
    const run1 = mockFs({ [LOG_PATH]: NOT_FOUND() });
    await initActionLog();
    logAction({ action: "render_crash", status: "error", startedAt: "2026-08-26T00:00:00.000Z" });
    await vi.waitFor(() => expect(run1.writes.length).toBeGreaterThanOrEqual(1));
    const diskAfterCrash = run1.writes[run1.writes.length - 1].content;

    // ── Restart: fresh module state, same file on disk ──
    resetActionLogForTests();
    vi.clearAllMocks();
    mockFs({ [LOG_PATH]: diskAfterCrash });
    await initActionLog();

    // The support bundle reads getActionLog() — the crash is there.
    expect(getActionLog().some((e) => e.action === "render_crash" && e.status === "error")).toBe(
      true
    );
  });

  it("a failed write never throws into the caller, never logs itself recursively, and later writes still retry", async () => {
    let broken = true;
    const writes: Array<{ path: string; content: string }> = [];
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "load_file") throw NOT_FOUND();
      if (cmd === "save_file_atomic") {
        if (broken) {
          throw new Error(`Failed to write ${LOG_PATH}: Access is denied. (os error 5)`);
        }
        writes.push(args as { path: string; content: string });
        return undefined;
      }
      throw new Error(`Unknown command: ${cmd}`);
    });
    await initActionLog();

    expect(() => logAction(entry("during_outage"))).not.toThrow();
    await settle();
    // No recursive "persist failed" entries piling up.
    expect(getActionLog()).toHaveLength(1);
    expect(writes).toHaveLength(0);

    broken = false;
    logAction(entry("after_recovery"));
    await vi.waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(1));
    const last = parseWrite(writes[writes.length - 1]);
    expect(last.entries.map((e) => e.action)).toEqual(["during_outage", "after_recovery"]);
  });

  it("clearActionLog persists the cleared state — a reset does not resurrect old entries on the next launch", async () => {
    const run1 = mockFs({ [LOG_PATH]: persistedFile([entry("old_event")]) });
    await initActionLog();
    expect(getActionLog()).toHaveLength(1);

    clearActionLog();
    await vi.waitFor(() => {
      expect(run1.writes.length).toBeGreaterThanOrEqual(1);
      expect(parseWrite(run1.writes[run1.writes.length - 1]).entries).toHaveLength(0);
    });
    const diskAfterClear = run1.writes[run1.writes.length - 1].content;

    // Restart — nothing comes back.
    resetActionLogForTests();
    vi.clearAllMocks();
    mockFs({ [LOG_PATH]: diskAfterClear });
    await initActionLog();
    expect(getActionLog()).toHaveLength(0);
  });
});

// ── Rotation ────────────────────────────────────────────────────────

describe("rotation — the log never grows unbounded", () => {
  const MAX = 500; // mirrors MAX_LOG_ENTRIES in actionlog.ts

  it("caps the in-memory log, dropping the oldest entries first", () => {
    for (let i = 0; i < MAX + 50; i++) logAction(entry(`e${i}`));

    const log = getActionLog();
    expect(log).toHaveLength(MAX);
    expect(log[0].action).toBe("e50");
    expect(log[log.length - 1].action).toBe(`e${MAX + 49}`);
  });

  it("caps the persisted file at the same bound", async () => {
    const { writes } = mockFs({ [LOG_PATH]: NOT_FOUND() });
    await initActionLog();

    for (let i = 0; i < MAX + 10; i++) logAction(entry(`e${i}`));

    await vi.waitFor(() => {
      expect(writes.length).toBeGreaterThanOrEqual(1);
      const last = parseWrite(writes[writes.length - 1]);
      expect(last.entries).toHaveLength(MAX);
    });
    const last = parseWrite(writes[writes.length - 1]);
    expect(last.entries[0].action).toBe("e10");
    expect(last.entries[last.entries.length - 1].action).toBe(`e${MAX + 9}`);
  });

  it("trims restored + current entries to the cap, keeping the most recent — this run's entries always survive", async () => {
    const restored = Array.from({ length: MAX }, (_, i) => entry(`old${i}`));
    mockFs({ [LOG_PATH]: persistedFile(restored) });

    for (let i = 0; i < 10; i++) logAction(entry(`new${i}`));
    await initActionLog();

    const log = getActionLog();
    expect(log).toHaveLength(MAX);
    // The 10 oldest restored entries fell off the front…
    expect(log[0].action).toBe("old10");
    // …and everything logged this run is still at the tail.
    expect(log[log.length - 1].action).toBe("new9");
    expect(log[log.length - 10].action).toBe("new0");
  });
});
