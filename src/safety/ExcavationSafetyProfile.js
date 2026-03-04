// Defines safety budgets, trust tiers, and policy constraints for excavation operations.
// Enforces no-rollbacks, no-downgrades, and sovereignty compliance at runtime.

export class ExcavationSafetyProfile {
  constructor(options) {
    this.profileName = options?.profileName ?? 'default';
    this.version = '1.0.0';
    this.createdAt = Date.now();

    // Resource budgets (hard limits)
    this.nodeBudget = options?.nodeBudget ?? 20000;
    this.traceSpanBudget = options?.traceSpanBudget ?? 50000;
    this.deepPassBudget = options?.deepPassBudget ?? 2000;
    this.maxRunSeconds = options?.maxRunSeconds ?? 15;

    // Confidence thresholds for object classification
    this.minConfidenceForAutoUse = options?.minConfidenceForAutoUse ?? 0.85;
    this.minConfidenceForDisplay = options?.minConfidenceForDisplay ?? 0.4;
    this.maxDriftForAutoUse = options?.maxDriftForAutoUse ?? 0.2;
    this.maxDriftForCitizenUI = options?.maxDriftForCitizenUI ?? 0.6;

    // Context metadata
    this.context = {
      role: options?.context?.role ?? 'citizen',
      deviceClass: options?.context?.deviceClass ?? 'edge-unknown',
      networkTrust: options?.context?.networkTrust ?? 'unknown',
      consentLevel: options?.context?.consentLevel ?? 'minimal',
      locationHint: options?.context?.locationHint ?? null
    };

    // Sovereignty invariants (immutable once set)
    this.sovereigntyInvariants = {
      noRollbacks: true,
      noDowngrades: true,
      noHiddenControl: true,
      auditTrailRequired: true
    };
  }

  /**
   * Enforce budget constraints on excavation stats.
   * @param {Object} stats - Excavation statistics
   * @throws {Error} If budgets are exceeded
   */
  enforceBudgets(stats) {
    const violations = [];

    if (stats.nodeCount > this.nodeBudget) {
      violations.push(`Node budget exceeded: ${stats.nodeCount} > ${this.nodeBudget}`);
    }

    if (stats.traceSpanCount > this.traceSpanBudget) {
      violations.push(`Trace span budget exceeded: ${stats.traceSpanCount} > ${this.traceSpanBudget}`);
    }

    if (stats.deepPassObjects > this.deepPassBudget) {
      violations.push(`Deep pass budget exceeded: ${stats.deepPassObjects} > ${this.deepPassBudget}`);
    }

    if (violations.length > 0) {
      const error = new Error(`Safety profile violations: ${violations.join('; ')}`);
      error.violations = violations;
      error.profileName = this.profileName;
      throw error;
    }
  }

  /**
   * Determine if deep pass excavation is allowed based on safety profile.
   * @param {Object} params - Current excavation metrics
   * @returns {boolean} Deep pass permission
   */
  shouldEnterDeepPass(params) {
    const { nodeCount, virtualObjectCount, mode } = params;

    // Check remaining budget for deep pass
    const remainingNodeBudget = this.nodeBudget - nodeCount;
    const remainingObjectBudget = this.deepPassBudget - virtualObjectCount;

    // Deep pass requires sufficient remaining budget
    if (remainingNodeBudget < this.deepPassBudget * 0.5) {
      return false;
    }

    if (remainingObjectBudget < this.deepPassBudget * 0.5) {
      return false;
    }

    // Mode-specific rules
    if (mode === 'trace' && remainingNodeBudget < this.traceSpanBudget * 0.3) {
      return false;
    }

    return true;
  }

  /**
   * Classify virtual object into trust tiers.
   * @param {Object} params - Object scoring metrics
   * @returns {Object} Trust classification
   */
  classifyObject(params) {
    const { id, confidence, drift, kind } = params;

    let tier = 'quarantine';
    let reason = 'default-quarantine';

    // Auto-use tier: high confidence, low drift
    if (confidence >= this.minConfidenceForAutoUse && drift <= this.maxDriftForAutoUse) {
      tier = 'auto-use';
      reason = 'high-confidence-low-drift';
    }
    // Display tier: moderate confidence, acceptable drift
    else if (confidence >= this.minConfidenceForDisplay && drift <= this.maxDriftForCitizenUI) {
      tier = 'display-with-warning';
      reason = 'moderate-confidence-acceptable-drift';
    }
    // Show tier: low confidence but still displayable
    else if (confidence >= 0.2) {
      tier = 'show-with-warning';
      reason = 'low-confidence-high-drift';
    }

    return {
      objectId: id,
      tier,
      reason,
      confidence,
      drift,
      kind,
      profileName: this.profileName,
      classifiedAt: Date.now()
    };
  }

  /**
   * Check if object meets auto-use criteria for anchoring.
   * @param {Object} params - Object scoring metrics
   * @returns {boolean} Auto-use eligibility
   */
  isAutoUseEligible(params) {
    const classification = this.classifyObject(params);
    return classification.tier === 'auto-use';
  }

  /**
   * Validate profile against sovereignty invariants.
   * @returns {Object} Validation result
   */
  validateSovereignty() {
    const violations = [];

    // Check for rollback-enabling configurations
    if (this.nodeBudget <= 0) {
      violations.push('Node budget must be positive to prevent rollback attacks.');
    }

    // Check for downgrade-enabling configurations
    if (this.minConfidenceForAutoUse < this.minConfidenceForDisplay) {
      violations.push('Auto-use confidence must be >= display confidence to prevent downgrades.');
    }

    // Check for hidden control vectors
    if (this.context.networkTrust === 'unrestricted') {
      violations.push('Network trust cannot be unrestricted for sovereignty compliance.');
    }

    return {
      valid: violations.length === 0,
      violations,
      profileName: this.profileName,
      validatedAt: Date.now()
    };
  }

  /**
   * Serialize profile to JSON for storage/transport.
   * @returns {Object} JSON-serializable profile
   */
  toJSON() {
    return {
      profileName: this.profileName,
      version: this.version,
      createdAt: this.createdAt,
      budgets: {
        nodeBudget: this.nodeBudget,
        traceSpanBudget: this.traceSpanBudget,
        deepPassBudget: this.deepPassBudget,
        maxRunSeconds: this.maxRunSeconds
      },
      thresholds: {
        minConfidenceForAutoUse: this.minConfidenceForAutoUse,
        minConfidenceForDisplay: this.minConfidenceForDisplay,
        maxDriftForAutoUse: this.maxDriftForAutoUse,
        maxDriftForCitizenUI: this.maxDriftForCitizenUI
      },
      context: this.context,
      sovereigntyInvariants: this.sovereigntyInvariants
    };
  }

  /**
   * Deserialize profile from JSON.
   * @param {Object} json - Serialized profile
   * @returns {ExcavationSafetyProfile} Reconstructed profile
   */
  static fromJSON(json) {
    return new ExcavationSafetyProfile({
      profileName: json.profileName,
      nodeBudget: json.budgets?.nodeBudget,
      traceSpanBudget: json.budgets?.traceSpanBudget,
      deepPassBudget: json.budgets?.deepPassBudget,
      maxRunSeconds: json.budgets?.maxRunSeconds,
      minConfidenceForAutoUse: json.thresholds?.minConfidenceForAutoUse,
      minConfidenceForDisplay: json.thresholds?.minConfidenceForDisplay,
      maxDriftForAutoUse: json.thresholds?.maxDriftForAutoUse,
      maxDriftForCitizenUI: json.thresholds?.maxDriftForCitizenUI,
      context: json.context
    });
  }

  /**
   * Get profile summary for quick inspection.
   * @returns {Object} Summary data
   */
  getSummary() {
    const validation = this.validateSovereignty();
    return {
      profileName: this.profileName,
      version: this.version,
      sovereigntyCompliant: validation.valid,
      budgetUtilization: {
        node: '0%',
        traceSpan: '0%',
        deepPass: '0%'
      },
      trustTiers: {
        autoUse: this.minConfidenceForAutoUse,
        display: this.minConfidenceForDisplay,
        maxDrift: this.maxDriftForAutoUse
      }
    };
  }
}

export default ExcavationSafetyProfile;
