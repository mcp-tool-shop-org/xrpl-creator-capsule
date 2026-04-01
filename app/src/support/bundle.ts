/**
 * Support Bundle — packages diagnostic data for issue reports.
 *
 * Collects:
 *   - Action log (timestamped action history)
 *   - Session state (draft, artifact paths, completion flags)
 *   - App version and environment info
 *
 * Sanitizes:
 *   - Wallet file paths are recorded but NOT contents
 *   - No private keys, seeds, or secrets
 *   - File paths are included (useful for debugging path issues)
 */

import { save } from "@tauri-apps/plugin-dialog";
import { saveFile } from "../bridge/engine";
import { getActionLog } from "../state/release";
import { loadSession } from "../state/session";
import pkg from "../../package.json";

export interface SupportBundle {
  bundleVersion: 1;
  generatedAt: string;
  app: {
    name: string;
    version: string;
    platform: string;
    mode: string;
  };
  session: {
    activeStep: string;
    mode: string;
    hasManifest: boolean;
    hasReceipt: boolean;
    hasAccessPolicy: boolean;
    hasRecoveryBundle: boolean;
    published: boolean;
    verified: boolean;
    draftTitle: string | null;
    draftArtist: string | null;
  };
  actionLog: readonly ReturnType<typeof getActionLog>[number][];
  artifactPaths: {
    manifestPath: string | null;
    receiptPath: string | null;
    accessPolicyPath: string | null;
    recoveryBundlePath: string | null;
  };
}

export async function exportSupportBundle(currentMode: string): Promise<string | null> {
  const session = await loadSession();
  const actionLog = getActionLog();

  const bundle: SupportBundle = {
    bundleVersion: 1,
    generatedAt: new Date().toISOString(),
    app: {
      name: "XRPL Creator Capsule Desktop",
      version: pkg.version,
      platform: navigator.platform || "unknown",
      mode: currentMode,
    },
    session: {
      activeStep: session.activeStep,
      mode: session.mode,
      hasManifest: !!session.artifactPaths.manifestPath,
      hasReceipt: !!session.artifactPaths.receiptPath,
      hasAccessPolicy: !!session.artifactPaths.accessPolicyPath,
      hasRecoveryBundle: !!session.artifactPaths.recoveryBundlePath,
      published: session.completed.published,
      verified: session.completed.verified,
      draftTitle: session.draft?.title || null,
      draftArtist: session.draft?.artist || null,
    },
    actionLog: [...actionLog],
    artifactPaths: {
      manifestPath: session.artifactPaths.manifestPath,
      receiptPath: session.artifactPaths.receiptPath,
      accessPolicyPath: session.artifactPaths.accessPolicyPath,
      recoveryBundlePath: session.artifactPaths.recoveryBundlePath,
    },
  };

  const outputPath = await save({
    title: "Export Support Bundle",
    defaultPath: `capsule-support-${Date.now()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!outputPath) return null;

  await saveFile(outputPath, JSON.stringify(bundle, null, 2));
  return outputPath;
}
