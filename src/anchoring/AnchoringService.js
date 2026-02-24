// Multi-ledger anchoring router for TransparencyEnvelope AnchorManifests.

import AnchorManifest from "./AnchorManifest.js";
import { BostromAnchorAdapter } from "./adapters/BostromAnchorAdapter.js";
import { EvmAnchorAdapter } from "./adapters/EvmAnchorAdapter.js";
import { DidAnchorAdapter } from "./adapters/DidAnchorAdapter.js";

export class AnchoringService {
  constructor(options = {}) {
    this.config = {
      bostrom: {
        enabled: true,
        rpcUrl: options.bostrom?.rpcUrl ?? "https://lcd.bostrom.cybernode.ai",
        fromAddress:
          options.bostrom?.fromAddress ??
          "bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7"
      },
      evm: {
        enabled: !!options.evm?.enabled,
        rpcUrl: options.evm?.rpcUrl ?? null,
        contractAddress: options.evm?.contractAddress ?? null,
        fromAddress:
          options.evm?.fromAddress ??
          "0x519fC0eB4111323Cac44b70e1aE31c30e405802D"
      },
      did: {
        enabled: !!options.did?.enabled,
        didController: options.did?.didController ?? null,
        ionEndpoint: options.did?.ionEndpoint ?? null
      }
    };

    this.adapters = {
      bostrom: new BostromAnchorAdapter(this.config.bostrom),
      evm: new EvmAnchorAdapter(this.config.evm),
      did: new DidAnchorAdapter(this.config.did)
    };
  }

  createManifest({ runMeta, envelope, safetyProfile, deviceContext, alnContext, nanoMetrics }) {
    return new AnchorManifest({
      runId: runMeta.runId,
      envelope,
      did: runMeta.did ?? null,
      safetyProfile,
      deviceContext,
      alnContext,
      nanoMetrics
    });
  }

  /**
   * Anchor manifest to all configured ledgers.
   * Returns the updated manifest with commitments.
   */
  async anchorManifest(manifest) {
    const results = [];

    if (this.config.bostrom.enabled) {
      const c = await this.adapters.bostrom.anchor(manifest);
      manifest.addCommitment(c);
      results.push(c);
    }

    if (this.config.evm.enabled && this.config.evm.rpcUrl && this.config.evm.contractAddress) {
      const c = await this.adapters.evm.anchor(manifest);
      manifest.addCommitment(c);
      results.push(c);
    }

    if (this.config.did.enabled && this.config.did.didController) {
      const c = await this.adapters.did.anchor(manifest);
      manifest.addCommitment(c);
      results.push(c);
    }

    return { manifest, commitments: results };
  }
}

export default AnchoringService;
