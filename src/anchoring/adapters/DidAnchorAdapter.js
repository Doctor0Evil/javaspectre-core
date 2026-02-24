// DID / ION anchoring adapter: records the anchor in a DID document-style proof log.

import crypto from "node:crypto";

export class DidAnchorAdapter {
  constructor(config) {
    this.didController = config.didController;
    this.ionEndpoint = config.ionEndpoint;
  }

  async anchor(manifest) {
    if (!this.didController) {
      throw new Error("DidAnchorAdapter requires didController.");
    }

    const didUrl = manifest.did ?? this.didController;
    const proofEntry = {
      type: "JavaspectreTransparencyAnchor",
      created: new Date().toISOString(),
      manifestId: manifest.manifestId,
      contentHash: manifest.contentHash,
      runId: manifest.runId,
      homeChain: manifest.homeChain
    };

    const proofHash = crypto.createHash("sha256").update(JSON.stringify(proofEntry)).digest("hex");

    // In production:
    // - Fetch DID Document
    // - Append proofEntry to proof/service
    // - Publish update via ION or chosen DID method

    return {
      ledger: "did",
      network: this.ionEndpoint ? "ion" : "did-offline",
      txHash: proofHash,
      anchorRef: `${didUrl}#anchor-${manifest.manifestId}`,
      timestamp: proofEntry.created
    };
  }
}

export default DidAnchorAdapter;
