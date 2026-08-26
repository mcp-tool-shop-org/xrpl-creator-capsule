// @vitest-environment node
/**
 * Wave 8 — F-d597d51f: bridge-worker.ts (via bridge-worker-commands.ts,
 * the pure dispatch library it delegates to — see that file's header
 * comment) had zero automated tests for its 16 command handlers. This
 * file covers the manifest-handling group: validate_manifest,
 * resolve_manifest, stamp_manifest — plus dispatch()-level plumbing
 * (unknown command, missing required params) that is shared by every
 * handler.
 *
 * Forces the "node" environment (not the project-wide jsdom default) —
 * same reasoning as the other bridge-worker*.test.ts files: this module
 * runs only in the spawned Node child process, never inside the webview.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeManifestId, computeRevisionHash, type ReleaseManifest } from "@capsule/core";
import { dispatch } from "./bridge-worker-commands";

// Same fixture shape already proven valid against assertManifest() by
// bridge-worker-mint-persist.test.ts (mint_release calls assertManifest on
// this exact structure). Reused here for consistency and to avoid
// re-deriving a schema-valid manifest by trial and error.
const MANIFEST: ReleaseManifest = {
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

describe("bridge-worker dispatch: manifest handlers", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function writeJson(name: string, data: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-manifest-test-"));
    tmpDirs.push(dir);
    const path = join(dir, name);
    await writeFile(path, JSON.stringify(data), "utf-8");
    return path;
  }

  // ── validate_manifest ─────────────────────────────────────────────

  describe("validate_manifest", () => {
    it("returns valid:true with no errors for a schema-correct manifest", async () => {
      const path = await writeJson("manifest.json", MANIFEST);
      const result = (await dispatch({
        command: "validate_manifest",
        params: { path },
      })) as { valid: boolean; errors: string[] };

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns valid:false with schema errors for a manifest missing required fields — does not throw", async () => {
      const { schemaVersion, title, ...incomplete } = MANIFEST;
      void schemaVersion;
      void title;
      const path = await writeJson("bad-manifest.json", incomplete);

      const result = (await dispatch({
        command: "validate_manifest",
        params: { path },
      })) as { valid: boolean; errors: string[] };

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    /**
     * Malformed-input case (feeds the app's error banner): validateManifestCmd
     * has its own try/catch around JSON.parse specifically so a syntactically
     * broken manifest file produces a structured {valid:false, errors:[...]}
     * VALUE instead of a rejected promise — distinct from every other manifest
     * handler below (resolve_manifest, stamp_manifest), which let a JSON parse
     * failure propagate as a thrown SyntaxError. This asymmetry is real
     * production behavior, not an oversight this test is introducing — it is
     * pinned here explicitly so a future refactor can see it's relied upon.
     */
    it("catches invalid JSON and reports it as a validation error, not a thrown exception", async () => {
      const dir = await mkdtemp(join(tmpdir(), "capsule-manifest-test-"));
      tmpDirs.push(dir);
      const path = join(dir, "not-json.json");
      await writeFile(path, "{ this is not valid JSON", "utf-8");

      const result = (await dispatch({
        command: "validate_manifest",
        params: { path },
      })) as { valid: boolean; errors: string[] };

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([`Failed to parse ${path} as JSON`]);
    });

    it("rejects when the manifest file does not exist", async () => {
      const dir = await mkdtemp(join(tmpdir(), "capsule-manifest-test-"));
      tmpDirs.push(dir);
      const missingPath = join(dir, "does-not-exist.json");

      await expect(
        dispatch({ command: "validate_manifest", params: { path: missingPath } })
      ).rejects.toThrow();
    });
  });

  // ── resolve_manifest ─────────────────────────────────────────────

  describe("resolve_manifest", () => {
    it("resolves pointer coherence for a schema-correct manifest — all checks pass", async () => {
      const path = await writeJson("manifest.json", MANIFEST);
      const result = (await dispatch({
        command: "resolve_manifest",
        params: { path },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.passed).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      for (const check of result.checks) {
        expect(check.passed).toBe(true);
      }
    });

    it("flags issuer/operator collapse as a failed check without throwing", async () => {
      const collapsed = { ...MANIFEST, operatorAddress: MANIFEST.issuerAddress };
      const path = await writeJson("collapsed-manifest.json", collapsed);

      const result = (await dispatch({
        command: "resolve_manifest",
        params: { path },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.passed).toBe(false);
      const sep = result.checks.find((c) => c.name === "issuer-operator-separation");
      expect(sep?.passed).toBe(false);
    });

    /**
     * Malformed-input contrast with validate_manifest above: resolveManifestCmd
     * calls `assertManifest(JSON.parse(raw))` directly with no local try/catch,
     * so a schema-invalid manifest here throws all the way out of dispatch()
     * (unlike validate_manifest, which reports the same defect as a return
     * value). This is exactly the kind of "bad JSON envelope / missing fields"
     * behavior the app's error banner has to render — pinned so it's visible.
     */
    it("throws (does not resolve to a value) for a schema-invalid manifest", async () => {
      const { title, ...incomplete } = MANIFEST;
      void title;
      const path = await writeJson("bad-manifest.json", incomplete);

      await expect(
        dispatch({ command: "resolve_manifest", params: { path } })
      ).rejects.toThrow(/Invalid Release Manifest/);
    });

    it("throws for syntactically invalid JSON (no local catch, unlike validate_manifest)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "capsule-manifest-test-"));
      tmpDirs.push(dir);
      const path = join(dir, "not-json.json");
      await writeFile(path, "{ not json", "utf-8");

      await expect(
        dispatch({ command: "resolve_manifest", params: { path } })
      ).rejects.toThrow();
    });
  });

  // ── stamp_manifest ────────────────────────────────────────────────

  describe("stamp_manifest", () => {
    it("stamps the manifest with a deterministic manifestId and revisionHash matching the pure hash functions", async () => {
      const path = await writeJson("manifest.json", MANIFEST);

      const result = (await dispatch({
        command: "stamp_manifest",
        params: { path },
      })) as { manifest: ReleaseManifest; manifestId: string; revisionHash: string };

      expect(result.manifestId).toBe(computeManifestId(MANIFEST));
      expect(result.revisionHash).toBe(computeRevisionHash(MANIFEST));
      expect(result.manifest.id).toBe(result.manifestId);
      // Every other field must survive the stamp unmutated.
      expect(result.manifest.title).toBe(MANIFEST.title);
      expect(result.manifest.issuerAddress).toBe(MANIFEST.issuerAddress);
    });

    it("is deterministic — stamping the same manifest twice yields identical ids", async () => {
      const path = await writeJson("manifest.json", MANIFEST);

      const first = (await dispatch({
        command: "stamp_manifest",
        params: { path },
      })) as { manifestId: string; revisionHash: string };
      const second = (await dispatch({
        command: "stamp_manifest",
        params: { path },
      })) as { manifestId: string; revisionHash: string };

      expect(first.manifestId).toBe(second.manifestId);
      expect(first.revisionHash).toBe(second.revisionHash);
    });

    it("produces a different revisionHash (but the same manifestId) when a non-identity field changes", async () => {
      const path = await writeJson("manifest.json", MANIFEST);
      const changed = { ...MANIFEST, priceDrops: "999999999" };
      const changedPath = await writeJson("manifest-changed.json", changed);

      const original = (await dispatch({
        command: "stamp_manifest",
        params: { path },
      })) as { manifestId: string; revisionHash: string };
      const modified = (await dispatch({
        command: "stamp_manifest",
        params: { path: changedPath },
      })) as { manifestId: string; revisionHash: string };

      // priceDrops is not an identity field (see hash.ts IDENTITY_FIELDS) —
      // the release identity is unchanged even though the content differs.
      expect(modified.manifestId).toBe(original.manifestId);
      expect(modified.revisionHash).not.toBe(original.revisionHash);
    });

    it("rejects a schema-invalid manifest instead of stamping a broken object", async () => {
      const { issuerAddress, ...incomplete } = MANIFEST;
      void issuerAddress;
      const path = await writeJson("bad-manifest.json", incomplete);

      await expect(
        dispatch({ command: "stamp_manifest", params: { path } })
      ).rejects.toThrow(/Invalid Release Manifest/);
    });
  });

  // ── dispatch() plumbing shared by every handler ────────────────────

  describe("dispatch: command routing", () => {
    it("throws a named error for an unrecognized command", async () => {
      await expect(
        dispatch({ command: "not_a_real_command", params: {} })
      ).rejects.toThrow("Unknown command: not_a_real_command");
    });

    it("rejects when a handler's required path param is missing (malformed envelope)", async () => {
      // params.path is undefined -> readFile(undefined) must reject, not
      // silently resolve to something the caller mishandles.
      await expect(
        dispatch({ command: "validate_manifest", params: {} })
      ).rejects.toThrow();
    });
  });
});
