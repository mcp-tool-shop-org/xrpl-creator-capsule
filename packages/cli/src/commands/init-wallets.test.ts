import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockWriteFile } = vi.hoisted(() => ({ mockWriteFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: mockWriteFile };
});

import { initWallets } from "./init-wallets.js";

beforeEach(() => {
  mockWriteFile.mockReset().mockResolvedValue(undefined);
});

// F-5cf4a3c9 (HIGH): the wallet credentials file is documented in its own
// outputPath comment as containing secrets, but writeFile was called with
// no mode option, so it lands with the process's default permissions
// (typically 0644 / world-readable after umask on POSIX) instead of being
// restricted to the owner.
describe("initWallets — credentials file permissions", () => {
  it("writes the credentials file with an explicit owner-only mode option", async () => {
    await initWallets({
      network: "testnet",
      outputPath: "wallets.json",
      fund: false,
      authorize: false,
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [pathArg, , optsArg] = mockWriteFile.mock.calls[0];
    expect(pathArg).toBe("wallets.json");
    // This is the actual contract under test: writeFile must be told to
    // restrict the mode, not merely happen to land restricted on some
    // platform. Node's writeFile mode option is honored on POSIX; the
    // second test below additionally proves it lands on disk where the
    // OS can observe it.
    expect(optsArg).toMatchObject({ mode: 0o600 });
  });

  // Node's fs mode option (and umask) only affects the file's permission
  // bits on POSIX filesystems. On Windows/NTFS, fs.stat().mode reports a
  // fixed 0o666-class value regardless of what mode was requested at
  // create time — verified empirically on this rig (Windows 11, Node
  // v22.22.3): writeFile with mode 0o600, 0o666, and no mode option at all
  // all read back as 0o666 via fs.statSync().mode. A test asserting exact
  // 0o600 bits here would be vacuous on Windows (it could never
  // distinguish fixed vs. unfixed code), so it is explicitly skipped on
  // win32 rather than asserting something this platform cannot prove. The
  // test above (asserting the mode option is actually passed) is the
  // portable half of this regression test and runs on every platform.
  it.skipIf(process.platform === "win32")(
    "lands on disk with owner-only permission bits on POSIX",
    async () => {
      const real = await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises"
      );
      mockWriteFile.mockImplementation(real.writeFile);

      const tempDir = await mkdtemp(join(tmpdir(), "capsule-init-wallets-"));
      const outputPath = join(tempDir, "wallets.json");
      try {
        await initWallets({
          network: "testnet",
          outputPath,
          fund: false,
          authorize: false,
        });

        const st = await stat(outputPath);
        // Owner rw only — no group/other bits at all.
        expect(st.mode & 0o777).toBe(0o600);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  );
});
