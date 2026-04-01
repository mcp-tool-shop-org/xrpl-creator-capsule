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
