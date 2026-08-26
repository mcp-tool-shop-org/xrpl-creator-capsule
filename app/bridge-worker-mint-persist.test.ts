// @vitest-environment node
/**
 * bridge-worker.ts is a pure Node.js script (it runs as the spawned child
 * process, never inside the webview) — force the native "node" test
 * environment for this file instead of the project-wide jsdom default,
 * same as bridge-worker.test.ts. xrpl's Wallet.generate() relies on
 * Node's real crypto/typed-array globals and breaks under jsdom's shims.
 *
 * Regression test for F-cf8b67bb.
 *
 * mintReleaseCmd calls the real, irreversible issueRelease(...) mint and
 * only afterward persists the result via `await writeFile(receiptPath,
 * ...)`, with no try/catch. Before the fix: if that write fails — disk
 * full, a removable/cloud-synced folder disconnecting mid-session, a
 * permissions change, a Windows path-length problem — the exception
 * propagates all the way up through dispatch(), and bridge-worker.ts's
 * catch turns it into the exact same `{ok:false, error:<fs message>}`
 * envelope a REAL mint failure would produce. But the mint already
 * happened: issueRelease() already minted real NFT(s) on the XRPL ledger
 * and returned a fully-formed receipt (token IDs, tx hashes) that gets
 * discarded the instant the write throws — never shown to the user, never
 * retried, never offered for manual save. The user's natural response to
 * a reported failure is to retry, which double-issues a real, irreversible
 * on-chain mint.
 *
 * This test proves the real property: a simulated write failure must
 * still yield the receipt data to the caller, through a shape that is
 * DISTINCT from a plain mint failure (dispatch() resolving instead of
 * throwing, carrying an explicit, truthy write-error marker alongside the
 * intact receipt) — not merely that issueRelease() or writeFile() were
 * invoked.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "xrpl";
import type { IssuanceReceipt } from "@capsule/core";

// ── Mocks (hoisted — see packages/xrpl/src/mint.test.ts for the same
//    house convention: vi.hoisted() so these are initialized before the
//    vi.mock() factories below run) ─────────────────────────────────

const { issueReleaseMock, writeFileMock } = vi.hoisted(() => {
  return {
    issueReleaseMock: vi.fn(),
    writeFileMock: vi.fn(),
  };
});

// The real issueRelease() would submit a real, irreversible mint
// transaction to the XRPL network. We stand in for "the mint already
// happened" without ever touching the network, so this test is fast,
// deterministic, and offline — and so it isolates the exact seam this
// finding is about (what mintReleaseCmd does AFTER issueRelease resolves)
// rather than re-testing issueRelease's own ledger logic.
vi.mock("@capsule/xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capsule/xrpl")>();
  return {
    ...actual,
    issueRelease: issueReleaseMock,
  };
});

// The defect is specifically in the writeFile step AFTER issueRelease()
// resolves. readFile must keep working for real (manifest/wallet file
// loading happens earlier in mintReleaseCmd) — only writeFile is replaced,
// so we can simulate a disk failure precisely at the receipt-persist step.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: writeFileMock,
  };
});

// Imported after the mocks above (vi.mock calls are hoisted by Vitest to
// the top of the file regardless of source position, but keeping this
// import textually below documents the dependency).
import { dispatch } from "./bridge-worker-commands";

const FAKE_RECEIPT: IssuanceReceipt = {
  schemaVersion: "1.0.0",
  kind: "issuance-receipt",
  manifestId: "manifest-abc-123",
  manifestRevisionHash: "a".repeat(64),
  network: "testnet",
  issuedAt: "2026-08-26T00:00:00.000Z",
  issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  release: {
    title: "Midnight Frequency",
    artist: "Vex Morrow",
    editionSize: 50,
    transferFee: 5000,
  },
  pointers: {
    metadataUri: "https://example.com/.well-known/xrpl-nft/midnight-frequency",
    licenseUri: "https://example.com/releases/midnight-frequency/license",
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
  },
  xrpl: {
    authorizedMinterVerified: true,
    authorizedMinterTxHash:
      "AUTHTXHASH00000000000000000000000000000000000000000000000001",
    mintTxHashes: [
      "REALTXHASH00000000000000000000000000000000000000000000000001",
    ],
    nftTokenIds: [
      "000800002E71B67C4EDD9F0B5E23F7A2D8B2C9F1A6E7D4C3B2A190807060504",
    ],
    tokenTaxon: 0,
    flags: 8,
    transferFee: 5000,
  },
  storage: { provider: "mock", mediaResolved: true, coverResolved: true },
  verification: {
    manifestMatchesPointers: true,
    issuerOperatorSeparated: true,
    networkAllowed: true,
    errors: [],
    warnings: [],
  },
};

const MANIFEST = {
  schemaVersion: "1.0.0",
  title: "Midnight Frequency",
  artist: "Vex Morrow",
  editionSize: 50,
  coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
  metadataEndpoint: "https://example.com/.well-known/xrpl-nft/midnight-frequency",
  license: {
    type: "custom",
    summary: "Personal, non-transferable license.",
    uri: "https://example.com/releases/midnight-frequency/license",
  },
  benefit: {
    kind: "stems",
    description: "Full stem pack for personal remixing.",
    contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
  },
  priceDrops: "50000000",
  transferFeePercent: 5,
  payoutPolicy: {
    treasuryAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    multiSig: false,
    terms: "Standard",
  },
  issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  createdAt: "2026-04-01T00:00:00Z",
};

describe("bridge-worker: mint_release receipt persistence (F-cf8b67bb)", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    issueReleaseMock.mockReset().mockResolvedValue(FAKE_RECEIPT);
    writeFileMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  /**
   * Writes real manifest/wallet fixture files to a tmp dir using
   * node:fs's SYNC API (writeFileSync from "node:fs", not "node:fs/promises")
   * deliberately — "node:fs/promises" is mocked above (writeFile is
   * replaced module-wide), so using it here would route fixture setup
   * through writeFileMock instead of actually landing files on disk.
   */
  async function writeFixtures(): Promise<{
    manifestPath: string;
    walletsPath: string;
    receiptPath: string;
  }> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-mint-persist-test-"));
    tmpDirs.push(dir);
    const manifestPath = join(dir, "manifest.json");
    const walletsPath = join(dir, "wallets.json");
    // Deliberately never actually written to — this is the path the
    // mocked writeFile is told to fail against.
    const receiptPath = join(dir, "receipt.json");

    writeFileSync(manifestPath, JSON.stringify(MANIFEST), "utf-8");

    const issuer = Wallet.generate();
    const operator = Wallet.generate();
    writeFileSync(
      walletsPath,
      JSON.stringify({
        issuer: { seed: issuer.seed! },
        operator: { seed: operator.seed! },
      }),
      "utf-8"
    );

    return { manifestPath, walletsPath, receiptPath };
  }

  it("preserves the receipt and reports a state distinct from a plain mint failure when the post-mint receipt write fails", async () => {
    const { manifestPath, walletsPath, receiptPath } = await writeFixtures();

    // Simulate exactly the failure modes named in the finding: disk full /
    // a removable or cloud-synced folder disconnecting / a permissions
    // change / a Windows path-length problem. All surface through Node as
    // a rejected writeFile().
    writeFileMock.mockRejectedValue(
      Object.assign(new Error("ENOSPC: no space left on device, write"), {
        code: "ENOSPC",
      })
    );

    // The critical assertion: this must NOT throw/reject. A thrown error
    // here is indistinguishable, at the wire level, from a real mint
    // failure (bridge-worker.ts's catch wraps ANY thrown error from
    // dispatch() into the identical {ok:false, error} envelope a genuine
    // issueRelease() failure would produce) — which is exactly the
    // misreport that drives a user to "retry" a mint that already
    // succeeded, and double-issue a real on-chain NFT.
    const result = (await dispatch({
      command: "mint_release",
      params: { manifestPath, walletsPath, network: "testnet", receiptPath },
    })) as {
      receipt?: IssuanceReceipt;
      receiptPath?: string;
      receiptWriteError?: string;
    };

    // The mint truly happened.
    expect(issueReleaseMock).toHaveBeenCalledTimes(1);

    // The write really was attempted at the right path (not silently
    // skipped by the fix).
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0][0]).toBe(receiptPath);

    // The receipt must survive intact — not discarded. Every field a
    // downstream verify/grant-access/recover command depends on (token
    // IDs, tx hashes, manifest identity) must be present and unmutated.
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.xrpl.nftTokenIds).toEqual(
      FAKE_RECEIPT.xrpl.nftTokenIds
    );
    expect(result.receipt?.xrpl.mintTxHashes).toEqual(
      FAKE_RECEIPT.xrpl.mintTxHashes
    );
    expect(result.receipt?.manifestId).toBe(FAKE_RECEIPT.manifestId);

    // "Mint failed" and "mint succeeded but the receipt could not be
    // saved" must never be reported the same way: there must be an
    // explicit, truthy marker that distinguishes this outcome from an
    // ordinary successful mint (which carries no such marker at all —
    // see the companion test below).
    expect(result.receiptWriteError).toBeTruthy();
    expect(String(result.receiptWriteError)).toMatch(/ENOSPC|no space/i);
  });

  it("returns the bare receipt with no write-error marker when the save succeeds (happy path stays unchanged)", async () => {
    const { manifestPath, walletsPath, receiptPath } = await writeFixtures();
    writeFileMock.mockResolvedValue(undefined);

    const result = (await dispatch({
      command: "mint_release",
      params: { manifestPath, walletsPath, network: "testnet", receiptPath },
    })) as IssuanceReceipt & { receiptWriteError?: string };

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(result.xrpl.nftTokenIds).toEqual(FAKE_RECEIPT.xrpl.nftTokenIds);
    // No write-error marker on the ordinary success path — the two
    // situations must be visibly distinct from each other in both
    // directions.
    expect(result.receiptWriteError).toBeUndefined();
  });
});
