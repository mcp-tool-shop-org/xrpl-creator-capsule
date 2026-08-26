/**
 * Test setup — mocks for Tauri APIs that don't exist outside the desktop runtime.
 */
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// ── Mock @tauri-apps/api/core ─────────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ── Mock @tauri-apps/api/path ─────────────────────────────────────
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn().mockResolvedValue("/mock/app-data"),
}));

// ── Mock @tauri-apps/plugin-dialog ────────────────────────────────
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

// ── Mock @tauri-apps/api/event ─────────────────────────────────────
// F-10b68454: CloseWarningGate listens for a Rust-emitted event via
// listen() — outside a real Tauri webview there is no
// window.__TAURI_INTERNALS__ for the real implementation to talk to.
// Defaults to a no-op subscription (resolves an unlisten function that
// does nothing) so components using listen() don't hang/throw in tests
// that don't care about this specifically; tests that DO care override
// this per-test via vi.mocked(listen).mockImplementation(...).
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
