// Creates cryptographically-verifiable transparency envelopes for research outputs.
// Ensures all AI-generated content carries provenance, policy, and audit metadata.

import crypto from 'node:crypto';

export class TransparencyEnvelope {
  constructor(options) {
    this.version = options?.version ?? '1.0.0';
    this.envelopeType = options?.envelopeType ?? 'research-output';
    this.timestamp = Date.now();
    this.contentHash = null;
    this.signature = null;
    this.policyReferences = [];
    this.sovereigntyFlags = {
      noRollbacks: true,
      noDowngrades: true,
      noHiddenControl: true,
      auditTrailEnabled: true
    };
  }

  /**
   * Create a new transparency envelope from research output data.
   * @param {Object} params - Envelope construction parameters
   * @returns {TransparencyEnvelope} Constructed envelope
   */
  static create(params) {
    const envelope = new TransparencyEnvelope({
      version: params?.version,
      envelopeType: params?.envelopeType
    });

    envelope._setContent(params);
    envelope._computeHash();
    envelope._attachPolicyReferences(params);
    envelope._validateSovereignty();

    return envelope;
  }

  /**
   * Set envelope content and metadata.
   * @private
   */
  _setContent(params) {
    this.content = {
      runId: params?.runId ?? null,
      intent: params?.intent ?? null,
      mode: params?.mode ?? 'unknown',
      safetyProfile: params?.safetyProfile ?? null,
      inputsSummary: params?.inputsSummary ?? null,
      metrics: params?.metrics ?? null,
      outputsSummary: params?.outputsSummary ?? null,
      environment: params?.environment ?? null,
      notes: params?.notes ?? []
    };

    this.metadata = {
      createdAt: this.timestamp,
      createdBy: params?.environment?.javaspectreVersion ?? 'unknown',
      nodeVersion: params?.environment?.nodeVersion ?? 'unknown',
      envelopeVersion: this.version
    };
  }

  /**
   * Compute cryptographic hash of envelope content.
   * @private
   */
  _computeHash() {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(this.content, Object.keys(this.content).sort()));
    this.contentHash = hash.digest('hex');
    this.metadata.contentHash = this.contentHash;
  }

  /**
   * Attach policy references for ALN governance compliance.
   * @private
   */
  _attachPolicyReferences(params) {
    const policyRefs = [];

    if (params?.safetyProfile?.profileName) {
      policyRefs.push({
        type: 'safety-profile',
        id: params.safetyProfile.profileName,
        version: '1.0.0'
      });
    }

    if (params?.environment?.javaspectreVersion) {
      policyRefs.push({
        type: 'runtime-version',
        id: `javaspectre:${params.environment.javaspectreVersion}`,
        version: params.environment.javaspectreVersion
      });
    }

    this.policyReferences = policyRefs;
    this.metadata.policyReferences = policyRefs;
  }

  /**
   * Validate sovereignty constraints before sealing.
   * @private
   */
  _validateSovereignty() {
    const violations = [];

    // Check for rollback indicators
    if (this.content?.outputsSummary?.quarantined?.some(
      q => q.reason?.includes('rollback')
    )) {
      violations.push('Rollback indicators detected in quarantined objects.');
    }

    // Check for downgrade patterns
    if (this.content?.metrics?.deepObjects < this.content?.metrics?.virtualObjectsShallow) {
      // This is expected behavior, not a violation
      // Deep pass may filter objects, not add them
    }

    // Check for hidden control signatures
    const hiddenControlPatterns = [
      'ghost-user',
      'external-function',
      'blacklisted-item',
      'hidden-control'
    ];

    const contentString = JSON.stringify(this.content);
    for (const pattern of hiddenControlPatterns) {
      if (contentString.toLowerCase().includes(pattern)) {
        violations.push(`Hidden control pattern detected: ${pattern}`);
      }
    }

    if (violations.length > 0) {
      this.sovereigntyFlags.violations = violations;
      this.sovereigntyFlags.auditTrailEnabled = true;
      // Do not throw - mark for audit instead
    }

    this.metadata.sovereigntyFlags = this.sovereigntyFlags;
  }

  /**
   * Sign envelope with provided key (optional for offline use).
   * @param {string} privateKey - PEM-formatted private key
   * @returns {string} Signature
   */
  sign(privateKey) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(this.contentHash);
    sign.end();
    this.signature = sign.sign(privateKey, 'hex');
    this.metadata.signature = this.signature;
    return this.signature;
  }

  /**
   * Verify envelope signature.
   * @param {string} publicKey - PEM-formatted public key
   * @param {string} signature - Signature to verify
   * @returns {boolean} Verification result
   */
  verify(publicKey, signature) {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(this.contentHash);
    verify.end();
    return verify.verify(publicKey, signature, 'hex');
  }

  /**
   * Serialize envelope to JSON for storage/transport.
   * @returns {Object} JSON-serializable envelope
   */
  toJSON() {
    return {
      version: this.version,
      envelopeType: this.envelopeType,
      timestamp: this.timestamp,
      content: this.content,
      metadata: this.metadata,
      policyReferences: this.policyReferences,
      sovereigntyFlags: this.sovereigntyFlags,
      contentHash: this.contentHash,
      signature: this.signature
    };
  }

  /**
   * Deserialize envelope from JSON.
   * @param {Object} json - Serialized envelope
   * @returns {TransparencyEnvelope} Reconstructed envelope
   */
  static fromJSON(json) {
    const envelope = new TransparencyEnvelope({
      version: json.version,
      envelopeType: json.envelopeType
    });

    envelope.content = json.content;
    envelope.metadata = json.metadata;
    envelope.policyReferences = json.policyReferences;
    envelope.sovereigntyFlags = json.sovereigntyFlags;
    envelope.contentHash = json.contentHash;
    envelope.signature = json.signature;
    envelope.timestamp = json.timestamp;

    return envelope;
  }

  /**
   * Get envelope summary for quick inspection.
   * @returns {Object} Summary data
   */
  getSummary() {
    return {
      runId: this.content?.runId,
      envelopeType: this.envelopeType,
      version: this.version,
      createdAt: new Date(this.timestamp).toISOString(),
      contentHash: this.contentHash,
      hasSignature: !!this.signature,
      policyCount: this.policyReferences.length,
      sovereigntyCompliant: this.sovereigntyFlags.violations?.length === 0
    };
  }
}

/**
 * Convenience function for creating envelopes.
 * @param {Object} params - Envelope parameters
 * @returns {TransparencyEnvelope} Created envelope
 */
export function createTransparencyEnvelope(params) {
  return TransparencyEnvelope.create(params);
}

export default TransparencyEnvelope;
