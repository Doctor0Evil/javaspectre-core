// Canonical, chain-agnostic manifest for anchoring TransparencyEnvelope hashes
// to multiple ledgers (Bostrom home chain + satellites).

import crypto from "node:crypto";

export class AnchorManifest {
  constructor({
    runId,
    envelope,
    did,
    safetyProfile,
    deviceContext,
    alnContext,
    nanoMetrics
  }) {
    if (!runId || !envelope || !envelope.contentHash) {
      throw new Error("AnchorManifest requires runId and envelope.contentHash.");
    }

    this.manifestId = AnchorManifest.computeManifestId(envelope.contentHash, runId);
    this.runId = runId;
    this.contentHash = envelope.contentHash;
    this.envelopeTimestamp = envelope.timestamp;
    this.envelopeMode = envelope.runMeta?.mode ?? "unknown";
    this.homeChain = "bostrom";
    this.did = did ?? null; // DID of augmented citizen or node
    this.safetyProfile = safetyProfile
      ? {
          profileName: safetyProfile.profileName,
          nodeBudget: safetyProfile.nodeBudget,
          traceSpanBudget: safetyProfile.traceSpanBudget,
          deepPassBudget: safetyProfile.deepPassBudget,
          maxRunSeconds: safetyProfile.maxRunSeconds
        }
      : null;

    this.deviceContext = deviceContext ?? null; // e.g., Jetson / phone fingerprint
    this.alnContext = alnContext ?? null; // ALN planId, modelId, assumptions
    this.nanoMetrics = nanoMetrics ?? null; // NanoData volume, drift, stability
    this.createdAt = new Date().toISOString();

    // Ledger commitments get appended over time
    this.commitments = [];
  }

  static computeManifestId(contentHash, runId) {
    const h = crypto.createHash("sha256");
    h.update(`${contentHash}:${runId}`);
    return h.digest("hex").slice(0, 32);
  }

  addCommitment(commitment) {
    // commitment: { ledger, txHash, anchorRef, timestamp, network, didUrl? }
    if (!commitment || !commitment.ledger || !commitment.txHash) {
      throw new Error("Commitment requires at least ledger and txHash.");
    }
    this.commitments.push({
      ...commitment,
      recordedAt: new Date().toISOString()
    });
  }

  toJSON() {
    return {
      manifestId: this.manifestId,
      runId: this.runId,
      contentHash: this.contentHash,
      envelopeTimestamp: this.envelopeTimestamp,
      envelopeMode: this.envelopeMode,
      homeChain: this.homeChain,
      did: this.did,
      safetyProfile: this.safetyProfile,
      deviceContext: this.deviceContext,
      alnContext: this.alnContext,
      nanoMetrics: this.nanoMetrics,
      createdAt: this.createdAt,
      commitments: this.commitments
    };
  }
}

export default AnchorManifest;
