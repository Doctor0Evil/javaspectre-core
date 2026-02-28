// Chain-agnostic anchoring service that turns TransparencyEnvelopes
// into ALN-aware AnchorManifests and dispatches them to multiple ledgers.

import crypto from "node:crypto";
import AnchorManifest from "./AnchorManifest.js";
import BostromAnchorAdapter from "./adapters/BostromAnchorAdapter.js";
import EvmAnchorAdapter from "./adapters/EvmAnchorAdapter.js";
import DidAnchorAdapter from "./adapters/DidAnchorAdapter.js";

export class AnchoringService {
  constructor(config) {
    this.config = config || {};
    this.adapters = [];

    if (this.config.bostrom && this.config.bostrom.enabled) {
      this.adapters.push(
        new BostromAnchorAdapter({
          rpcUrl: this.config.bostrom.rpcUrl,
          fromAddress: this.config.bostrom.fromAddress
        })
      );
    }

    if (this.config.evm && this.config.evm.enabled) {
      this.adapters.push(
        new EvmAnchorAdapter({
          rpcUrl: this.config.evm.rpcUrl,
          contractAddress: this.config.evm.contractAddress,
          fromAddress: this.config.evm.fromAddress
        })
      );
    }

    if (this.config.did && this.config.did.enabled) {
      this.adapters.push(
        new DidAnchorAdapter({
          didController: this.config.did.didController,
          ionEndpoint: this.config.did.ionEndpoint
        })
      );
    }
  }

  /**
   * Create a canonical AnchorManifest from a TransparencyEnvelope.
   * runMeta: { runId, intent, mode, deviceContext?, alnContext? }
   * envelope: TransparencyEnvelope JSON
   * safetyProfile: ExcavationSafetyProfile instance used for this run
   * nanoMetrics: { drift, stability, dataVolume } or similar small metrics
   */
  createManifest(runMeta, envelope, safetyProfile, nanoMetrics) {
    if (!runMeta || !runMeta.runId) {
      throw new Error("AnchoringService.createManifest requires runMeta.runId.");
    }
    if (!envelope || !envelope.contentHash) {
      throw new Error(
        "AnchoringService.createManifest requires envelope.contentHash."
      );
    }

    const did =
      (runMeta.alnContext && runMeta.alnContext.subjectDid) || null;

    const deviceContext = runMeta.deviceContext || null;
    const alnContext = runMeta.alnContext || null;

    return new AnchorManifest(
      runMeta.runId,
      envelope,
      did,
      safetyProfile,
      deviceContext,
      alnContext,
      nanoMetrics || null
    );
  }

  /**
   * Anchor a manifest across all configured ledgers.
   * Returns the manifest plus a list of commitments.
   */
  async anchorManifest(manifest) {
    if (!manifest || !manifest.contentHash) {
      throw new Error("anchorManifest requires a manifest with contentHash.");
    }

    const commitments = [];

    for (const adapter of this.adapters) {
      // Each adapter returns: { ledger, network, txHash, anchorRef, timestamp, didUrl? }
      // In the medical context, this becomes the auditable pointer for ISO 14155 / neurorights proofs.
      // No external calls are made in this stub; it is ready to wire to real SDKs.
      /* eslint-disable no-await-in-loop */
      const result = await adapter.anchor(manifest.toJSON());
      /* eslint-enable no-await-in-loop */

      manifest.addCommitment({
        ledger: result.ledger,
        txHash: result.txHash,
        anchorRef: result.anchorRef,
        network: result.network,
        timestamp: result.timestamp,
        didUrl: result.didUrl
      });

      commitments.push(result);
    }

    return {
      manifest: manifest.toJSON(),
      commitments
    };
  }

  /**
   * Convenience helper: derive a NanoData-style metric block
   * from a TransparencyEnvelope metrics section.
   */
  static deriveNanoMetrics(envelope) {
    if (!envelope || !envelope.metrics) {
      return null;
    }

    const metrics = envelope.metrics;
    const dataVolume =
      (metrics.nodesProcessed || 0) +
      (metrics.spansProcessed || 0) +
      (metrics.deepPassObjects || 0);

    const stability =
      typeof envelope.outputsSummary === "object" &&
      typeof envelope.outputsSummary.highConfidenceStable === "number" &&
      typeof envelope.outputsSummary.virtualObjects === "number" &&
      envelope.outputsSummary.virtualObjects > 0
        ? envelope.outputsSummary.highConfidenceStable /
          envelope.outputsSummary.virtualObjects
        : 0;

    const drift =
      typeof envelope.outputsSummary === "object" &&
      typeof envelope.outputsSummary.quarantined === "number" &&
      typeof envelope.outputsSummary.virtualObjects === "number" &&
      envelope.outputsSummary.virtualObjects > 0
        ? envelope.outputsSummary.quarantined /
          envelope.outputsSummary.virtualObjects
        : 0;

    const id = crypto
      .createHash("sha256")
      .update(
        [
          envelope.runId || "",
          String(dataVolume),
          String(stability),
          String(drift)
        ].join("|")
      )
      .digest("hex")
      .slice(0, 16);

    return {
      id,
      dataVolume,
      stability,
      drift
    };
  }
}

export default AnchoringService;
