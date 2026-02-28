// Bridges Javaspectre TransparencyEnvelope + AnchorManifest into a VC v2.0-style
// payload with explicit trustTier and multi-ledger anchors.

import crypto from "node:crypto";

/**
 * Derive a simple trust-tier from envelope + manifest.
 * - T1: at least one on-chain anchor on a designated tier-1 ledger
 *       AND envelope safety profile within configured bounds.
 * - T2: signed envelope with no qualifying T1 anchor, but budgets/metrics OK.
 * - T0: fallback / unsafe (can be filtered upstream).
 */
export function deriveTrustTier(envelope, anchorManifest, options = {}) {
  const tier1Ledgers = new Set(
    options.tier1Ledgers ?? ["bostrom", "evm", "cosmos-hub"]
  );

  const commitments = anchorManifest?.commitments ?? [];
  const hasTier1Anchor = commitments.some((c) =>
    tier1Ledgers.has(String(c.ledger).toLowerCase())
  );

  const safety = envelope?.safetyProfile ?? {};
  const metrics = envelope?.metrics ?? {};

  const nodeBudgetOk =
    typeof safety.nodeBudget === "number" &&
    typeof metrics.nodesProcessed === "number"
      ? metrics.nodesProcessed <= safety.nodeBudget
      : true;

  const spanBudgetOk =
    typeof safety.traceSpanBudget === "number" &&
    typeof metrics.spansProcessed === "number"
      ? metrics.spansProcessed <= safety.traceSpanBudget
      : true;

  const runTimeOk =
    typeof safety.maxRunSeconds === "number" &&
    typeof metrics.runSeconds === "number"
      ? metrics.runSeconds <= safety.maxRunSeconds
      : true;

  const budgetsOk = nodeBudgetOk && spanBudgetOk && runTimeOk;

  if (hasTier1Anchor && budgetsOk) return "T1";
  if (budgetsOk) return "T2";
  return "T0";
}

/**
 * Normalize AnchorManifest commitments into a VC-ready ledgerAnchors array.
 */
export function buildLedgerAnchors(anchorManifest) {
  const commitments = anchorManifest?.commitments ?? [];
  return commitments.map((c) => ({
    ledgerId: c.ledger ?? "unknown-ledger",
    network: c.network ?? null,
    transactionHash: c.txHash ?? null,
    anchorRef: c.anchorRef ?? null,
    timestamp: c.timestamp ?? c.recordedAt ?? null,
    proofType: c.proofType ?? "tx-reference"
  }));
}

/**
 * Canonical JSON serialization with stable key ordering for hashing / payloadHash.
 */
export function canonicalizeJson(value) {
  const sortKeys = (obj) => {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (obj && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortKeys(obj[k]);
          return acc;
        }, {});
    }
    return obj;
  };
  const normalized = sortKeys(value);
  return JSON.stringify(normalized);
}

/**
 * Compute payloadHash (SHA-256 over canonicalized JSON-LD-ish object).
 */
export function computePayloadHash(payload) {
  const canonical = canonicalizeJson(payload);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Build a VC-like credentialSubject from a TransparencyEnvelope + AnchorManifest.
 * This does NOT sign the VC; it just constructs the data payload.
 */
export function buildAnchoredTransparencySubject(
  envelope,
  anchorManifest,
  options = {}
) {
  if (!envelope || !envelope.contentHash) {
    throw new Error(
      "buildAnchoredTransparencySubject requires envelope.contentHash"
    );
  }

  const runId = envelope.runId ?? options.runId ?? null;
  const trustTier = deriveTrustTier(envelope, anchorManifest, options);
  const ledgerAnchors = buildLedgerAnchors(anchorManifest);

  const subjectCore = {
    type: "AnchoredTransparencySubject",
    runId,
    envelopeTimestamp: envelope.timestamp,
    mode: envelope.runMeta?.mode ?? "unknown",
    contentHash: envelope.contentHash,
    safetyProfile: envelope.safetyProfile ?? null,
    metrics: envelope.metrics ?? null,
    trustTier,
    ledgerAnchors
  };

  const payloadHash = computePayloadHash(subjectCore);

  return {
    ...subjectCore,
    payloadHash
  };
}

/**
 * Build a full VC v2.0-style object ready for signing by an external VC library.
 *
 * @param {Object} envelope TransparencyEnvelope
 * @param {Object} anchorManifest AnchorManifest
 * @param {Object} opts { issuerDid, holderDid, contextUrl }
 */
export function buildAnchoredTransparencyVC(
  envelope,
  anchorManifest,
  opts = {}
) {
  const issuerDid = opts.issuerDid ?? envelope.runMeta?.did ?? null;
  const subjectDid = opts.holderDid ?? null;
  const contextUrl =
    opts.contextUrl ??
    "https://example.org/contexts/multi-ledger-anchoring-v1.jsonld";

  const subject = buildAnchoredTransparencySubject(
    envelope,
    anchorManifest,
    opts
  );

  const vc = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      contextUrl
    ],
    type: ["VerifiableCredential", "AnchoredTransparencyCredential"],
    issuer: issuerDid,
    issuanceDate: envelope.timestamp,
    credentialSubject: {
      id: subjectDid,
      ...subject
    }
  };

  // payloadHash is already inside credentialSubject; we may optionally compute a
  // top-level vcPayloadHash if you want a second anchor for the whole VC body.
  vc.vcPayloadHash = computePayloadHash(vc);

  return vc;
}

export default {
  deriveTrustTier,
  buildLedgerAnchors,
  canonicalizeJson,
  computePayloadHash,
  buildAnchoredTransparencySubject,
  buildAnchoredTransparencyVC
};
