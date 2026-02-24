// Ethereum-family anchoring adapter (hash logged via a smart-contract event).

import crypto from "node:crypto";

export class EvmAnchorAdapter {
  constructor(config) {
    this.rpcUrl = config.rpcUrl;
    this.contractAddress = config.contractAddress;
    this.fromAddress = config.fromAddress;
  }

  async anchor(manifest) {
    if (!this.rpcUrl || !this.contractAddress) {
      throw new Error("EvmAnchorAdapter requires rpcUrl and contractAddress.");
    }

    const payload = {
      manifestId: manifest.manifestId,
      contentHash: manifest.contentHash,
      did: manifest.did
    };

    const txHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    // In production:
    // - Connect to RPC
    // - Call anchor contract with contentHash + manifestId
    // - Return real tx hash

    return {
      ledger: "evm",
      network: "evm-generic",
      txHash,
      anchorRef: `evm:${this.contractAddress}:${manifest.manifestId}`,
      timestamp: new Date().toISOString()
    };
  }
}

export default EvmAnchorAdapter;
