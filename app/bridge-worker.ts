/**
 * Bridge Worker — Node.js process that exposes @capsule/core and @capsule/xrpl
 * to the Tauri desktop app via stdin/stdout JSON-RPC.
 *
 * Protocol:
 *   stdin  ← JSON { command: string, params: Record<string, unknown> }
 *   stdout → JSON { ok: true, data: unknown } | { ok: false, error: string }
 *
 * Tauri Rust commands spawn this script via `npx tsx app/bridge-worker.ts`,
 * pipe the command JSON on stdin, and read the result from stdout.
 *
 * This file is the ONLY place the desktop app touches engine code.
 * React never imports @capsule/* directly.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertManifest,
  validateManifest,
  computeManifestId,
  computeRevisionHash,
  stampManifestId,
  resolveManifestPointers,
  assertReceipt,
  computeReceiptHash,
  assertAccessPolicy,
  checkPolicyCoherence,
  stampGrantHash,
  deriveRecoveryBundle,
  verifyBundleConsistency,
  // Governance
  assertGovernancePolicy,
  assertPayoutProposal,
  assertPayoutDecision,
  assertPayoutExecution,
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  stampExecutionHash,
  computePolicyHash,
  computeProposalHash,
  computeDecisionHash,
  computeExecutionHash,
  checkProposalAgainstPolicy,
  evaluateApprovals,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
  type AccessGrantReceipt,
  type GovernancePolicy,
  type PayoutProposal,
  type PayoutDecisionReceipt,
  type PayoutExecutionReceipt,
  type GovernanceSigner,
  type GovernanceApproval,
} from "@capsule/core";
import {
  importWalletPair,
  issueRelease,
  verifyAuthorizedMinter,
  readNftFromLedger,
  checkHolder,
  type NetworkId,
} from "@capsule/xrpl";
import { MockContentStore, MockDeliveryProvider } from "@capsule/storage";
import { convertStringToHex } from "xrpl";

// ── Types ───────────────────────────────────────────────────────────

interface BridgeCommand {
  command: string;
  params: Record<string, unknown>;
}

interface BridgeOk {
  ok: true;
  data: unknown;
}

interface BridgeErr {
  ok: false;
  error: string;
}

type BridgeResult = BridgeOk | BridgeErr;

// ── Command dispatch ────────────────────────────────────────────────

async function dispatch(cmd: BridgeCommand): Promise<unknown> {
  switch (cmd.command) {
    case "validate_manifest":
      return validateManifestCmd(cmd.params);
    case "resolve_manifest":
      return resolveManifestCmd(cmd.params);
    case "stamp_manifest":
      return stampManifestCmd(cmd.params);
    case "mint_release":
      return mintReleaseCmd(cmd.params);
    case "verify_release":
      return verifyReleaseCmd(cmd.params);
    case "create_access_policy":
      return createAccessPolicyCmd(cmd.params);
    case "check_holder":
      return checkHolderCmd(cmd.params);
    case "grant_access":
      return grantAccessCmd(cmd.params);
    case "recover_release":
      return recoverReleaseCmd(cmd.params);
    case "verify_recovery":
      return verifyRecoveryCmd(cmd.params);
    case "create_governance_policy":
      return createGovernancePolicyCmd(cmd.params);
    case "propose_payout":
      return proposePayoutCmd(cmd.params);
    case "decide_payout":
      return decidePayoutCmd(cmd.params);
    case "execute_payout":
      return executePayoutCmd(cmd.params);
    case "verify_payout":
      return verifyPayoutCmd(cmd.params);
    default:
      throw new Error(`Unknown command: ${cmd.command}`);
  }
}

// ── Commands ────────────────────────────────────────────────────────

async function validateManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, errors: [`Failed to parse ${path} as JSON`] };
  }
  return validateManifest(parsed);
}

async function resolveManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  const manifest = assertManifest(JSON.parse(raw));
  return resolveManifestPointers(manifest);
}

async function stampManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  const manifest = assertManifest(JSON.parse(raw));
  const stamped = stampManifestId(manifest);
  const manifestId = computeManifestId(manifest);
  const revisionHash = computeRevisionHash(manifest);
  return { manifest: stamped, manifestId, revisionHash };
}

async function mintReleaseCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const walletsPath = params.walletsPath as string;
  const network = (params.network ?? "testnet") as NetworkId;
  const receiptPath = params.receiptPath as string;

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const walletRaw = await readFile(walletsPath, "utf-8");
  const wallets = importWalletPair(JSON.parse(walletRaw));

  const storage = new MockContentStore();

  const receipt = await issueRelease({
    manifest,
    wallets,
    network,
    allowMainnetWrite: false,
    storage,
    storageProvider: "mock",
  });

  // Persist receipt
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

  return receipt;
}

async function verifyReleaseCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const receiptRaw = await readFile(receiptPath, "utf-8");
  const receipt = assertReceipt(JSON.parse(receiptRaw));

  interface Check {
    name: string;
    passed: boolean;
    detail: string;
  }

  const checks: Check[] = [];

  // ── Manifest identity ──────────────────────────────────────────

  const expectedId = computeManifestId(manifest);
  checks.push({
    name: "manifest-id-match",
    passed: receipt.manifestId === expectedId,
    detail:
      receipt.manifestId === expectedId
        ? `Manifest ID matches: ${expectedId.slice(0, 16)}...`
        : `Manifest ID mismatch: receipt has ${receipt.manifestId.slice(0, 16)}..., expected ${expectedId.slice(0, 16)}...`,
  });

  // ── Revision hash ──────────────────────────────────────────────

  const expectedRevision = computeRevisionHash(manifest);
  checks.push({
    name: "revision-hash-match",
    passed: receipt.manifestRevisionHash === expectedRevision,
    detail:
      receipt.manifestRevisionHash === expectedRevision
        ? `Revision hash matches: ${expectedRevision.slice(0, 16)}...`
        : `Revision hash mismatch: manifest modified since issuance`,
  });

  // ── Receipt integrity ──────────────────────────────────────────

  if (receipt.receiptHash) {
    const expectedReceiptHash = computeReceiptHash(receipt);
    checks.push({
      name: "receipt-integrity",
      passed: receipt.receiptHash === expectedReceiptHash,
      detail:
        receipt.receiptHash === expectedReceiptHash
          ? "Receipt hash is valid (untampered)"
          : "Receipt hash mismatch — receipt may have been tampered with",
    });
  }

  // ── Issuer/operator ────────────────────────────────────────────

  checks.push({
    name: "issuer-match",
    passed: receipt.issuerAddress === manifest.issuerAddress,
    detail:
      receipt.issuerAddress === manifest.issuerAddress
        ? `Issuer matches: ${manifest.issuerAddress}`
        : `Issuer mismatch: receipt ${receipt.issuerAddress}, manifest ${manifest.issuerAddress}`,
  });

  checks.push({
    name: "operator-match",
    passed: receipt.operatorAddress === manifest.operatorAddress,
    detail:
      receipt.operatorAddress === manifest.operatorAddress
        ? `Operator matches: ${manifest.operatorAddress}`
        : `Operator mismatch: receipt ${receipt.operatorAddress}, manifest ${manifest.operatorAddress}`,
  });

  // ── Transfer fee ───────────────────────────────────────────────

  const expectedFee = Math.round(manifest.transferFeePercent * 1000);
  checks.push({
    name: "transfer-fee-match",
    passed: receipt.xrpl.transferFee === expectedFee,
    detail:
      receipt.xrpl.transferFee === expectedFee
        ? `Transfer fee matches: ${expectedFee} (${manifest.transferFeePercent}%)`
        : `Transfer fee mismatch: receipt ${receipt.xrpl.transferFee}, expected ${expectedFee}`,
  });

  // ── Token count ────────────────────────────────────────────────

  checks.push({
    name: "edition-count",
    passed: receipt.xrpl.nftTokenIds.length === manifest.editionSize,
    detail:
      receipt.xrpl.nftTokenIds.length === manifest.editionSize
        ? `Edition count matches: ${manifest.editionSize}`
        : `Edition count mismatch: ${receipt.xrpl.nftTokenIds.length} minted, ${manifest.editionSize} expected`,
  });

  // ── Pointer coherence ─────────────────────────────────────────

  checks.push({
    name: "metadata-pointer",
    passed: receipt.pointers.metadataUri === manifest.metadataEndpoint,
    detail:
      receipt.pointers.metadataUri === manifest.metadataEndpoint
        ? "Metadata URI matches"
        : "Metadata URI mismatch between receipt and manifest",
  });

  checks.push({
    name: "license-pointer",
    passed: receipt.pointers.licenseUri === manifest.license.uri,
    detail:
      receipt.pointers.licenseUri === manifest.license.uri
        ? "License URI matches"
        : "License URI mismatch between receipt and manifest",
  });

  checks.push({
    name: "cover-cid",
    passed: receipt.pointers.coverCid === manifest.coverCid,
    detail:
      receipt.pointers.coverCid === manifest.coverCid
        ? "Cover CID matches"
        : "Cover CID mismatch between receipt and manifest",
  });

  checks.push({
    name: "media-cid",
    passed: receipt.pointers.mediaCid === manifest.mediaCid,
    detail:
      receipt.pointers.mediaCid === manifest.mediaCid
        ? "Media CID matches"
        : "Media CID mismatch between receipt and manifest",
  });

  // ── Chain verification ─────────────────────────────────────────

  try {
    const minterCheck = await verifyAuthorizedMinter(
      receipt.issuerAddress,
      receipt.operatorAddress,
      receipt.network
    );
    checks.push({
      name: "chain-minter-status",
      passed: minterCheck.verified,
      detail: minterCheck.verified
        ? "Authorized minter confirmed on ledger"
        : `Minter check failed: ${minterCheck.error}`,
    });

    if (receipt.xrpl.nftTokenIds.length > 0) {
      const firstTokenId = receipt.xrpl.nftTokenIds[0];
      let nft = await readNftFromLedger(
        receipt.operatorAddress,
        firstTokenId,
        receipt.network
      );
      if (!nft) {
        nft = await readNftFromLedger(
          receipt.issuerAddress,
          firstTokenId,
          receipt.network
        );
      }

      if (nft) {
        const expectedUri = convertStringToHex(manifest.metadataEndpoint);
        checks.push({
          name: "chain-nft-exists",
          passed: true,
          detail: `NFT ${firstTokenId.slice(0, 16)}... found on ledger`,
        });
        checks.push({
          name: "chain-nft-uri",
          passed: nft.uri === expectedUri,
          detail:
            nft.uri === expectedUri
              ? "On-chain URI matches manifest metadata endpoint"
              : "On-chain URI does not match manifest metadata endpoint",
        });
        checks.push({
          name: "chain-nft-issuer",
          passed: nft.issuer === receipt.issuerAddress,
          detail:
            nft.issuer === receipt.issuerAddress
              ? "On-chain issuer matches receipt"
              : `On-chain issuer ${nft.issuer} differs from receipt ${receipt.issuerAddress}`,
        });
        checks.push({
          name: "chain-nft-transfer-fee",
          passed: nft.transferFee === receipt.xrpl.transferFee,
          detail:
            nft.transferFee === receipt.xrpl.transferFee
              ? `On-chain transfer fee matches: ${nft.transferFee}`
              : `On-chain transfer fee ${nft.transferFee} differs from receipt ${receipt.xrpl.transferFee}`,
        });
      } else {
        checks.push({
          name: "chain-nft-exists",
          passed: false,
          detail: `NFT ${firstTokenId.slice(0, 16)}... not found on ledger`,
        });
      }
    }
  } catch (err) {
    checks.push({
      name: "chain-connectivity",
      passed: false,
      detail: `Could not connect to ${receipt.network}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

// ── Access commands ──────────────────────────────────────────────────

async function createAccessPolicyCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;
  const label = params.label as string;
  const ttlSeconds = (params.ttlSeconds as number) ?? 3600;
  const outputPath = params.outputPath as string | undefined;

  const manifest = assertManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  const receipt = assertReceipt(JSON.parse(await readFile(receiptPath, "utf-8")));

  const manifestId = computeManifestId(manifest);

  const policy: AccessPolicy = {
    schemaVersion: "1.0.0",
    kind: "access-policy",
    manifestId,
    label,
    benefit: {
      kind: manifest.benefit.kind,
      contentPointer: manifest.benefit.contentPointer,
    },
    rule: {
      type: "holds-nft",
      issuerAddress: manifest.issuerAddress,
      qualifyingTokenIds: receipt.xrpl.nftTokenIds,
    },
    delivery: {
      mode: "download-token",
      ttlSeconds,
    },
    createdAt: new Date().toISOString(),
  };

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(policy, null, 2) + "\n");
  }

  return policy;
}

async function checkHolderCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const walletAddress = params.walletAddress as string;
  const qualifyingTokenIds = params.qualifyingTokenIds as string[];
  const network = (params.network ?? "testnet") as NetworkId;

  return checkHolder(walletAddress, qualifyingTokenIds, network);
}

async function grantAccessCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;
  const policyPath = params.policyPath as string;
  const walletAddress = params.walletAddress as string;
  const outputPath = params.outputPath as string | undefined;

  const manifest = assertManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  const receipt = assertReceipt(JSON.parse(await readFile(receiptPath, "utf-8")));
  const policy = assertAccessPolicy(JSON.parse(await readFile(policyPath, "utf-8")));

  const now = new Date().toISOString();

  // Policy coherence
  const coherence = checkPolicyCoherence(policy, manifest, receipt);
  if (!coherence.coherent) {
    const grant = stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: `Policy coherence failed: ${coherence.errors.join("; ")}`,
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
    if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
    return grant;
  }

  // Receipt integrity
  if (receipt.receiptHash) {
    const expectedHash = computeReceiptHash(receipt);
    if (receipt.receiptHash !== expectedHash) {
      const grant = stampGrantHash({
        schemaVersion: "1.0.0",
        kind: "access-grant-receipt",
        manifestId: policy.manifestId,
        policyLabel: policy.label,
        subjectAddress: walletAddress,
        network: receipt.network,
        decision: "deny",
        reason: "Issuance receipt has been tampered with",
        benefit: policy.benefit,
        ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
        decidedAt: now,
      });
      if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
      return grant;
    }
  }

  // Manifest identity
  const expectedManifestId = computeManifestId(manifest);
  if (receipt.manifestId !== expectedManifestId) {
    const grant = stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: "Manifest identity does not match issuance receipt",
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
    if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
    return grant;
  }

  // Revision hash
  const expectedRevision = computeRevisionHash(manifest);
  if (receipt.manifestRevisionHash !== expectedRevision) {
    const grant = stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: "Manifest has been modified since issuance",
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
    if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
    return grant;
  }

  // Ownership check
  const holderResult = await checkHolder(
    walletAddress,
    policy.rule.qualifyingTokenIds,
    receipt.network
  );

  if (holderResult.error || !holderResult.holds) {
    const reason = holderResult.error
      ? `Ownership check failed: ${holderResult.error}`
      : "Wallet does not hold any qualifying NFT for this release";
    const grant = stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason,
      benefit: policy.benefit,
      ownership: {
        matchedTokenIds: holderResult.matchedTokenIds,
        totalNftsChecked: holderResult.totalNftsChecked,
      },
      decidedAt: now,
    });
    if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
    return grant;
  }

  // Grant access
  const deliveryProvider = new MockDeliveryProvider();
  const deliveryToken = await deliveryProvider.createToken(
    policy.benefit.contentPointer,
    policy.delivery.ttlSeconds
  );

  const grant = stampGrantHash({
    schemaVersion: "1.0.0",
    kind: "access-grant-receipt",
    manifestId: policy.manifestId,
    policyLabel: policy.label,
    subjectAddress: walletAddress,
    network: receipt.network,
    decision: "allow",
    reason: `Wallet holds ${holderResult.matchedTokenIds.length} qualifying NFT(s)`,
    benefit: policy.benefit,
    ownership: {
      matchedTokenIds: holderResult.matchedTokenIds,
      totalNftsChecked: holderResult.totalNftsChecked,
    },
    delivery: {
      mode: policy.delivery.mode,
      token: deliveryToken.token,
      expiresAt: deliveryToken.expiresAt,
    },
    decidedAt: now,
  });

  if (outputPath) await writeFile(outputPath, JSON.stringify(grant, null, 2) + "\n");
  return grant;
}

// ── Recovery commands ───────────────────────────────────────────────

async function recoverReleaseCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;
  const policyPath = params.policyPath as string | undefined;
  const outputPath = params.outputPath as string | undefined;

  const manifest = assertManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  const receipt = assertReceipt(JSON.parse(await readFile(receiptPath, "utf-8")));

  let policy: AccessPolicy | undefined;
  if (policyPath) {
    policy = assertAccessPolicy(JSON.parse(await readFile(policyPath, "utf-8")));
  }

  const bundle = deriveRecoveryBundle(manifest, receipt, policy);

  // Verify consistency immediately
  const verification = verifyBundleConsistency(bundle, manifest, receipt, policy);

  // Chain verification
  interface ChainCheck { name: string; passed: boolean; detail: string }
  const chainChecks: ChainCheck[] = [];

  try {
    const minterCheck = await verifyAuthorizedMinter(
      receipt.issuerAddress,
      receipt.operatorAddress,
      receipt.network
    );
    chainChecks.push({
      name: "chain-minter-status",
      passed: minterCheck.verified,
      detail: minterCheck.verified
        ? "Authorized minter confirmed on ledger"
        : `Minter check failed: ${minterCheck.error}`,
    });

    if (receipt.xrpl.nftTokenIds.length > 0) {
      const firstTokenId = receipt.xrpl.nftTokenIds[0];
      let nft = await readNftFromLedger(
        receipt.operatorAddress,
        firstTokenId,
        receipt.network
      );
      if (!nft) {
        nft = await readNftFromLedger(
          receipt.issuerAddress,
          firstTokenId,
          receipt.network
        );
      }
      chainChecks.push({
        name: "chain-nft-exists",
        passed: !!nft,
        detail: nft
          ? `NFT ${firstTokenId.slice(0, 16)}... found on ledger`
          : `NFT ${firstTokenId.slice(0, 16)}... not found on ledger`,
      });
    }
  } catch (err) {
    chainChecks.push({
      name: "chain-connectivity",
      passed: false,
      detail: `Could not connect to ${receipt.network}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(bundle, null, 2) + "\n");
  }

  return {
    bundle,
    verification,
    chainChecks,
    allPassed: verification.valid && chainChecks.every((c) => c.passed),
  };
}

async function verifyRecoveryCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const bundlePath = params.bundlePath as string;
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;
  const policyPath = params.policyPath as string | undefined;

  const bundleRaw = JSON.parse(await readFile(bundlePath, "utf-8"));
  const manifest = assertManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  const receipt = assertReceipt(JSON.parse(await readFile(receiptPath, "utf-8")));

  let policy: AccessPolicy | undefined;
  if (policyPath) {
    policy = assertAccessPolicy(JSON.parse(await readFile(policyPath, "utf-8")));
  }

  return verifyBundleConsistency(bundleRaw, manifest, receipt, policy);
}

// ── Governance commands ─────────────────────────────────────────────

async function createGovernancePolicyCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const treasuryAddress = params.treasuryAddress as string;
  const network = (params.network ?? "testnet") as "testnet" | "devnet" | "mainnet";
  const signers = params.signers as GovernanceSigner[];
  const threshold = params.threshold as number;
  const allowedAssets = (params.allowedAssets as string[]) ?? ["XRP"];
  const createdBy = params.createdBy as string;
  const outputPath = params.outputPath as string | undefined;

  const manifest = assertManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  const manifestId = computeManifestId(manifest);

  const policy: GovernancePolicy = {
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId,
    network,
    treasuryAddress,
    signerPolicy: { signers, threshold },
    payoutPolicy: {
      allowedAssets,
      allowPartialPayouts: false,
    },
    createdAt: new Date().toISOString(),
    createdBy,
  };

  const stamped = stampPolicyHash(assertGovernancePolicy(policy));

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(stamped, null, 2) + "\n");
  }

  return stamped;
}

async function proposePayoutCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const policyPath = params.policyPath as string;
  const proposalId = params.proposalId as string;
  const outputs = params.outputs as Array<{
    address: string; amount: string; asset: string; role: string; reason: string;
  }>;
  const createdBy = params.createdBy as string;
  const memo = params.memo as string | undefined;
  const outputPath = params.outputPath as string | undefined;

  const policy = assertGovernancePolicy(JSON.parse(await readFile(policyPath, "utf-8")));

  const proposal: PayoutProposal = {
    schemaVersion: "1.0.0",
    kind: "payout-proposal",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    createdAt: new Date().toISOString(),
    createdBy,
    memo,
    outputs: outputs as PayoutProposal["outputs"],
  };

  const validated = assertPayoutProposal(proposal);
  const policyCheck = checkProposalAgainstPolicy(validated, policy);
  if (!policyCheck.valid) {
    throw new Error(`Proposal violates policy: ${policyCheck.errors.join("; ")}`);
  }

  const stamped = stampProposalHash(validated);

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(stamped, null, 2) + "\n");
  }

  return stamped;
}

async function decidePayoutCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const policyPath = params.policyPath as string;
  const proposalPath = params.proposalPath as string;
  const approvals = params.approvals as GovernanceApproval[];
  const decidedBy = params.decidedBy as string;
  const outputPath = params.outputPath as string | undefined;

  const policy = assertGovernancePolicy(JSON.parse(await readFile(policyPath, "utf-8")));
  const proposal = assertPayoutProposal(JSON.parse(await readFile(proposalPath, "utf-8")));

  const evaluation = evaluateApprovals(proposal, policy, approvals);

  const decision: PayoutDecisionReceipt = {
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    approvals,
    decision: {
      outcome: evaluation.outcome,
      thresholdMet: evaluation.thresholdMet,
      approvedCount: evaluation.approvedCount,
      rejectedCount: evaluation.rejectedCount,
    },
    decidedAt: new Date().toISOString(),
    decidedBy,
  };

  const validated = assertPayoutDecision(decision);

  // Self-verify
  const consistencyCheck = checkDecisionAgainstProposal(validated, proposal, policy);
  if (!consistencyCheck.valid) {
    throw new Error(`Decision inconsistency: ${consistencyCheck.errors.join("; ")}`);
  }

  const stamped = stampDecisionHash(validated);

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(stamped, null, 2) + "\n");
  }

  return stamped;
}

async function executePayoutCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const policyPath = params.policyPath as string;
  const proposalPath = params.proposalPath as string;
  const decisionPath = params.decisionPath as string;
  const txHashes = params.txHashes as string[];
  const ledgerIndexes = params.ledgerIndexes as number[] | undefined;
  const executedOutputs = params.executedOutputs as PayoutExecutionReceipt["executedOutputs"];
  const executedBy = params.executedBy as string;
  const outputPath = params.outputPath as string | undefined;

  const policy = assertGovernancePolicy(JSON.parse(await readFile(policyPath, "utf-8")));
  const proposal = assertPayoutProposal(JSON.parse(await readFile(proposalPath, "utf-8")));
  const decision = assertPayoutDecision(JSON.parse(await readFile(decisionPath, "utf-8")));

  if (decision.decision.outcome !== "approved") {
    throw new Error("Cannot execute a rejected proposal");
  }

  const execution: PayoutExecutionReceipt = {
    schemaVersion: "1.0.0",
    kind: "payout-execution-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    decisionHash: decision.decisionHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    executedAt: new Date().toISOString(),
    executedBy,
    xrpl: { txHashes, ledgerIndexes },
    executedOutputs,
    verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
  };

  const validated = assertPayoutExecution(execution);

  // Full hash chain verification
  const chainCheck = checkExecutionAgainstDecision(validated, decision, proposal, policy);
  validated.verification = {
    matchesApprovedProposal: chainCheck.valid,
    errors: chainCheck.errors,
    warnings: [],
  };

  const stamped = stampExecutionHash(validated);

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(stamped, null, 2) + "\n");
  }

  return stamped;
}

async function verifyPayoutCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const policyPath = params.policyPath as string;
  const proposalPath = params.proposalPath as string;
  const decisionPath = params.decisionPath as string;
  const executionPath = params.executionPath as string;

  const policy = assertGovernancePolicy(JSON.parse(await readFile(policyPath, "utf-8")));
  const proposal = assertPayoutProposal(JSON.parse(await readFile(proposalPath, "utf-8")));
  const decision = assertPayoutDecision(JSON.parse(await readFile(decisionPath, "utf-8")));
  const execution = assertPayoutExecution(JSON.parse(await readFile(executionPath, "utf-8")));

  interface Check { name: string; passed: boolean; detail: string }
  const checks: Check[] = [];

  // Schema checks (if we got this far, schemas parsed)
  checks.push({ name: "policy-schema", passed: true, detail: "Governance policy schema valid" });
  checks.push({ name: "proposal-schema", passed: true, detail: "Payout proposal schema valid" });
  checks.push({ name: "decision-schema", passed: true, detail: "Payout decision schema valid" });
  checks.push({ name: "execution-schema", passed: true, detail: "Payout execution schema valid" });

  // Hash integrity
  if (policy.policyHash) {
    const expected = computePolicyHash(policy);
    const match = policy.policyHash === expected;
    checks.push({
      name: "policy-hash-integrity",
      passed: match,
      detail: match ? "Policy hash is valid" : "Policy hash mismatch — may be tampered",
    });
  }

  if (proposal.proposalHash) {
    const expected = computeProposalHash(proposal);
    const match = proposal.proposalHash === expected;
    checks.push({
      name: "proposal-hash-integrity",
      passed: match,
      detail: match ? "Proposal hash is valid" : "Proposal hash mismatch — may be tampered",
    });
  }

  if (decision.decisionHash) {
    const expected = computeDecisionHash(decision);
    const match = decision.decisionHash === expected;
    checks.push({
      name: "decision-hash-integrity",
      passed: match,
      detail: match ? "Decision hash is valid" : "Decision hash mismatch — may be tampered",
    });
  }

  if (execution.executionHash) {
    const expected = computeExecutionHash(execution);
    const match = execution.executionHash === expected;
    checks.push({
      name: "execution-hash-integrity",
      passed: match,
      detail: match ? "Execution hash is valid" : "Execution hash mismatch — may be tampered",
    });
  }

  // Cross-contract checks
  const proposalVsPolicy = checkProposalAgainstPolicy(proposal, policy);
  checks.push({
    name: "proposal-vs-policy",
    passed: proposalVsPolicy.valid,
    detail: proposalVsPolicy.valid
      ? "Proposal is consistent with policy"
      : `Proposal violates policy: ${proposalVsPolicy.errors.join("; ")}`,
  });

  const decisionVsProposal = checkDecisionAgainstProposal(decision, proposal, policy);
  checks.push({
    name: "decision-vs-proposal",
    passed: decisionVsProposal.valid,
    detail: decisionVsProposal.valid
      ? "Decision is consistent with proposal and policy"
      : `Decision inconsistency: ${decisionVsProposal.errors.join("; ")}`,
  });

  const executionVsDecision = checkExecutionAgainstDecision(execution, decision, proposal, policy);
  checks.push({
    name: "execution-vs-decision",
    passed: executionVsDecision.valid,
    detail: executionVsDecision.valid
      ? "Execution is consistent with full hash chain"
      : `Execution inconsistency: ${executionVsDecision.errors.join("; ")}`,
  });

  // Outcome check
  checks.push({
    name: "decision-outcome",
    passed: decision.decision.outcome === "approved",
    detail: decision.decision.outcome === "approved"
      ? `Approved (${decision.decision.approvedCount}/${policy.signerPolicy.threshold} threshold)`
      : `Rejected (${decision.decision.approvedCount}/${policy.signerPolicy.threshold} threshold)`,
  });

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

// ── Main: read stdin, dispatch, write stdout ────────────────────────

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  let cmd: BridgeCommand;
  try {
    cmd = JSON.parse(input);
  } catch {
    const result: BridgeErr = { ok: false, error: "Invalid JSON on stdin" };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }

  try {
    const data = await dispatch(cmd);
    const result: BridgeResult = { ok: true, data };
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const result: BridgeErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }
}

main();
