// @vitest-environment node
/**
 * bridge-worker.ts is a pure Node.js script (it runs as the spawned child
 * process, never inside the webview) — force the native "node" test
 * environment for this file instead of the project-wide jsdom default.
 * xrpl's Wallet.generate() relies on Node's real crypto/typed-array
 * globals and breaks under jsdom's shims.
 *
 * Regression test for F-12c32f19.
 *
 * PublishPage.handlePublish used to call loadFile(walletsPath) and
 * JSON.parse the result directly in React/renderer code to pull out
 * issuer.classicAddress / operator.classicAddress — materializing the
 * FULL wallet file (which, per importWalletPair, carries XRPL signing
 * material, not just public addresses) in the WebView's JS heap, the
 * least-trusted process in the app.
 *
 * The fix adds a narrow `read_wallet_addresses` bridge command that
 * reconstructs the wallet pair (via importWalletPair, so the addresses
 * are cryptographically derived from the seed rather than trusted from
 * unverified plaintext) and returns ONLY the two classic addresses.
 *
 * This test probes both halves of the fix:
 *   1. Leak check — the signing material (seed/private key) must never
 *      appear anywhere in what the command returns.
 *   2. Functionality check — the addresses returned must still be
 *      correct, so PublishPage can still build a valid manifest.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "xrpl";
import { dispatch } from "./bridge-worker-commands";

describe("bridge-worker: read_wallet_addresses", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function writeWalletsFile(issuer: Wallet, operator: Wallet): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-wallet-test-"));
    tmpDirs.push(dir);
    const path = join(dir, "wallets.json");
    await writeFile(
      path,
      JSON.stringify({
        issuer: { seed: issuer.seed! },
        operator: { seed: operator.seed! },
      }),
      "utf-8"
    );
    return path;
  }

  it("returns only the two public classic addresses — never seed or private key material", async () => {
    const issuer = Wallet.generate();
    const operator = Wallet.generate();
    const walletsPath = await writeWalletsFile(issuer, operator);

    const result = (await dispatch({
      command: "read_wallet_addresses",
      params: { walletsPath },
    })) as { issuerAddress: string; operatorAddress: string };

    // Half 1 — leak check: none of the signing material may appear in
    // what crosses into the renderer.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(issuer.seed);
    expect(serialized).not.toContain(operator.seed);
    expect(serialized).not.toContain(issuer.privateKey);
    expect(serialized).not.toContain(operator.privateKey);
    expect(serialized).not.toContain(issuer.publicKey);
    expect(serialized).not.toContain(operator.publicKey);
    expect(Object.keys(result).sort()).toEqual(["issuerAddress", "operatorAddress"]);

    // Half 2 — still functional: the addresses must be correct so
    // PublishPage can still build a valid manifest from them.
    expect(result.issuerAddress).toBe(issuer.classicAddress);
    expect(result.operatorAddress).toBe(operator.classicAddress);
    expect(result.issuerAddress).not.toBe(result.operatorAddress);
  });

  it("rejects a wallets file that has no seed material to derive addresses from", async () => {
    const dir = await mkdtemp(join(tmpdir(), "capsule-wallet-test-"));
    tmpDirs.push(dir);
    const path = join(dir, "bad-wallets.json");
    await writeFile(path, JSON.stringify({ issuer: {}, operator: {} }), "utf-8");

    await expect(
      dispatch({ command: "read_wallet_addresses", params: { walletsPath: path } })
    ).rejects.toThrow();
  });
});
