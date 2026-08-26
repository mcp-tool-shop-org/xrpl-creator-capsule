// @vitest-environment node
/**
 * Regression tests for F-c1882c0f (missing Tauri v2 capabilities/ACL) and
 * the CSP half of F-f5a82670 (null Content-Security-Policy).
 *
 * These validate the STATIC JSON/TOML security configuration directly —
 * the part of both findings expressible without compiling the Rust
 * binary. The Rust-side path-containment logic added alongside these
 * fixes (commands.rs::allowed_roots / normalize_lexically / is_contained,
 * plus #[cfg(test)] tests co-located there) could NOT be compiled or run
 * in the sandbox this fix was authored in — no cargo/rustc toolchain was
 * available anywhere on the machine. `cargo test path_containment_tests`
 * should be run before merge to confirm that half.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_TAURI = resolve(__dirname, "..", "..", "src-tauri");

describe("tauri.conf.json security (F-f5a82670)", () => {
  const conf = JSON.parse(readFileSync(resolve(SRC_TAURI, "tauri.conf.json"), "utf-8"));

  it("sets a real Content-Security-Policy instead of null", () => {
    expect(conf.app.security.csp).not.toBeNull();
    expect(typeof conf.app.security.csp).toBe("string");
    expect(conf.app.security.csp.length).toBeGreaterThan(0);
  });

  it("restricts script-src to self (no unsafe-eval / unsafe-inline scripts)", () => {
    const csp: string = conf.app.security.csp;
    const scriptSrc = csp
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(scriptSrc).toContain("'self'");
  });

  it("does not allow any remote (http/https) sources by default", () => {
    const csp: string = conf.app.security.csp;
    expect(csp).not.toMatch(/https?:\/\//);
  });
});

describe("Tauri v2 capabilities/ACL (F-c1882c0f)", () => {
  const capabilitiesDir = resolve(SRC_TAURI, "capabilities");
  const permissionsDir = resolve(SRC_TAURI, "permissions");

  it("has a capabilities directory with an instance grant file (not just the generated schema)", () => {
    expect(existsSync(capabilitiesDir)).toBe(true);
    expect(existsSync(resolve(capabilitiesDir, "default.json"))).toBe(true);
  });

  it("default capability grants exactly the app's own commands and dialog — nothing broader", () => {
    const cap = JSON.parse(readFileSync(resolve(capabilitiesDir, "default.json"), "utf-8"));
    expect(cap.windows).toContain("main");
    expect(cap.permissions).toEqual(
      expect.arrayContaining([
        "core:default",
        "allow-load-file",
        "allow-save-file",
        "allow-engine-call",
        "dialog:default",
      ])
    );
    // Deliberately excluded: the frontend never calls the fs or shell
    // plugin JS APIs directly (file I/O goes through this app's own
    // load_file/save_file), so granting those would be broader than
    // this app needs.
    const grantsFs = (cap.permissions as string[]).some((p) => p.startsWith("fs:"));
    const grantsShell = (cap.permissions as string[]).some((p) => p.startsWith("shell:"));
    expect(grantsFs).toBe(false);
    expect(grantsShell).toBe(false);
  });

  it("declares a permission definition for each of the app's own custom commands", () => {
    expect(existsSync(permissionsDir)).toBe(true);
    const toml = readFileSync(resolve(permissionsDir, "desktop-commands.toml"), "utf-8");
    for (const command of ["load_file", "save_file", "engine_call"]) {
      expect(toml).toContain(`commands.allow = ["${command}"]`);
    }
  });
});
