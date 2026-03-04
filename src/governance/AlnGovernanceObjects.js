// Defines ALN governance syntax objects for machine-law compliance.
// Encodes invariants, workflow profiles, and sovereignty constraints as first-class objects.

import crypto from 'node:crypto';

export class LawfulWorkflowProfile {
  constructor(options) {
    this.profileId = options?.profileId ?? this._generateProfileId();
    this.version = '1.0.0';
    this.createdAt = Date.now();
    this.koScope = 'sourzewizard.aln.syntax-dev';
    this.koPurpose = options?.koPurpose ?? 'Define governed workflow for ALN-anchored research';

    // Core invariants (immutable)
    this.invariants = {
      assumptionTransparency: true,
      workflowGraphRequired: true,
      stressTestMandatory: true,
      pluralArchitectureRequired: true,
      researchFeedbackRequired: true
    };

    // State types for workflow machine
    this.stateTypes = [
      'Citizen_Context',
      'AI_Context',
      'Workflow_Graph',
      'Stress_Profile',
      'Architecture_Profile',
      'Experiment_Set',
      'Governance_Record'
    ];

    // Permitted transitions (no rollbacks, no downgrades)
    this.permittedTransitions = [
      { from: 'Citizen_Context', to: 'AI_Context' },
      { from: 'AI_Context', to: 'Workflow_Graph' },
      { from: 'Workflow_Graph', to: 'Stress_Profile' },
      { from: 'Stress_Profile', to: 'Architecture_Profile' },
      { from: 'Architecture_Profile', to: 'Experiment_Set' },
      { from: 'Experiment_Set', to: 'Governance_Record' }
    ];

    // Hard guards
    this.hardGuards = {
      noHiddenControl: true,
      noGhostActors: true,
      noSilentOverrides: true,
      consentTokenRequired: true,
      sovereigntyProfileRequired: true
    };

    // Sovereignty flags
    this.sovereigntyFlags = {
      noRollbacks: true,
      noDowngrades: true,
      monotoneEvolution: true,
      auditTrailEnabled: true,
      immutableAnchors: true
    };

    // Binding for ALN blockchain anchoring
    this.alnBinding = {
      offlineTokenizable: true,
      alnSourzeReady: true,
      anchoringTarget: 'ALN-blockchain',
      ecosystem: 'SourzeWizard'
    };
  }

  /**
   * Validate workflow profile against invariants.
   * @returns {Object} Validation result
   */
  validate() {
    const violations = [];

    // Check invariants are enabled
    for (const [key, value] of Object.entries(this.invariants)) {
      if (!value) {
        violations.push(`Invariant ${key} is disabled.`);
      }
    }

    // Check hard guards
    for (const [key, value] of Object.entries(this.hardGuards)) {
      if (!value) {
        violations.push(`Hard guard ${key} is disabled.`);
      }
    }

    // Check for rollback/downgrade patterns in transitions
    const transitionMap = new Map();
    for (const t of this.permittedTransitions) {
      if (!transitionMap.has(t.from)) {
        transitionMap.set(t.from, []);
      }
      transitionMap.get(t.from).push(t.to);
    }

    // Detect cycles (potential rollback vectors)
    for (const [from, targets] of transitionMap.entries()) {
      for (const target of targets) {
        if (transitionMap.has(target) && transitionMap.get(target).includes(from)) {
          violations.push(`Circular transition detected: ${from} <-> ${target}`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      profileId: this.profileId,
      validatedAt: Date.now()
    };
  }

  /**
   * Check if a state transition is permitted.
   * @param {string} fromState - Source state
   * @param {string} toState - Target state
   * @returns {Object} Transition permission result
   */
  isTransitionPermitted(fromState, toState) {
    const permitted = this.permittedTransitions.some(
      t => t.from === fromState && t.to === toState
    );

    // Check for downgrade (reverse transition)
    const isDowngrade = this.permittedTransitions.some(
      t => t.from === toState && t.to === fromState
    );

    return {
      permitted,
      isDowngrade,
      allowed: permitted && !isDowngrade,
      fromState,
      toState,
      checkedAt: Date.now()
    };
  }

  /**
   * Serialize profile to JSON for ALN anchoring.
   * @returns {Object} JSON-serializable profile
   */
  toJSON() {
    return {
      profileId: this.profileId,
      version: this.version,
      createdAt: this.createdAt,
      koScope: this.koScope,
      koPurpose: this.koPurpose,
      invariants: this.invariants,
      stateTypes: this.stateTypes,
      permittedTransitions: this.permittedTransitions,
      hardGuards: this.hardGuards,
      sovereigntyFlags: this.sovereigntyFlags,
      alnBinding: this.alnBinding,
      validationHash: this._computeHash()
    };
  }

  /**
   * Deserialize profile from JSON.
   * @param {Object} json - Serialized profile
   * @returns {LawfulWorkflowProfile} Reconstructed profile
   */
  static fromJSON(json) {
    const profile = new LawfulWorkflowProfile({
      profileId: json.profileId,
      koPurpose: json.koPurpose
    });

    profile.version = json.version;
    profile.createdAt = json.createdAt;
    profile.koScope = json.koScope;
    profile.invariants = json.invariants;
    profile.stateTypes = json.stateTypes;
    profile.permittedTransitions = json.permittedTransitions;
    profile.hardGuards = json.hardGuards;
    profile.sovereigntyFlags = json.sovereigntyFlags;
    profile.alnBinding = json.alnBinding;

    return profile;
  }

  /**
   * Compute hash for integrity verification.
   * @private
   */
  _computeHash() {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      profileId: this.profileId,
      version: this.version,
      invariants: this.invariants,
      hardGuards: this.hardGuards,
      sovereigntyFlags: this.sovereigntyFlags
    }, Object.keys({
      profileId: this.profileId,
      version: this.version,
      invariants: this.invariants,
      hardGuards: this.hardGuards,
      sovereigntyFlags: this.sovereigntyFlags
    }).sort()));
    return hash.digest('hex');
  }

  /**
   * Generate unique profile ID.
   * @private
   */
  _generateProfileId() {
    const hash = crypto.createHash('sha256');
    hash.update(`lawful-workflow:${Date.now()}:${Math.random()}`);
    return `lwp_${hash.digest('hex').slice(0, 20)}`;
  }

  /**
   * Get profile summary for quick inspection.
   * @returns {Object} Summary data
   */
  getSummary() {
    const validation = this.validate();
    return {
      profileId: this.profileId,
      version: this.version,
      sovereigntyCompliant: validation.valid,
      invariantCount: Object.keys(this.invariants).length,
      stateTypeCount: this.stateTypes.length,
      transitionCount: this.permittedTransitions.length,
      alnReady: this.alnBinding.alnSourzeReady
    };
  }
}

export class GovernanceRecord {
  constructor(options) {
    this.recordId = options?.recordId ?? this._generateRecordId();
    this.version = '1.0.0';
    this.createdAt = Date.now();
    this.workflowProfileId = options?.workflowProfileId ?? null;
    this.runId = options?.runId ?? null;

    // Required sections from meta-skill spec
    this.sections = {
      problemHypothesis: options?.problemHypothesis ?? null,
      assumptionsAndConstraints: options?.assumptionsAndConstraints ?? [],
      workflowGraph: options?.workflowGraph ?? null,
      stressTestScenarios: options?.stressTestScenarios ?? [],
      alternateArchitectures: options?.alternateArchitectures ?? [],
      openResearchQuestions: options?.openResearchQuestions ?? [],
      suggestedExperiments: options?.suggestedExperiments ?? []
    };

    // Compliance metadata
    this.compliance = {
      allSectionsPresent: this._checkSectionsPresent(),
      invariantsRespected: true,
      sovereigntyFlags: {
        noRollbacks: true,
        noDowngrades: true,
        auditTrailEnabled: true
      }
    };

    // Anchoring metadata
    this.anchoring = {
      readyForAnchor: true,
      envelopeHash: options?.envelopeHash ?? null,
      manifestId: options?.manifestId ?? null,
      commitments: options?.commitments ?? []
    };
  }

  /**
   * Check if all required sections are present.
   * @private
   */
  _checkSectionsPresent() {
    const requiredSections = [
      'problemHypothesis',
      'assumptionsAndConstraints',
      'workflowGraph',
      'stressTestScenarios',
      'alternateArchitectures',
      'openResearchQuestions',
      'suggestedExperiments'
    ];

    for (const section of requiredSections) {
      const value = this.sections[section];
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value) && value.length === 0) {
        // Empty arrays are allowed for some sections
        if (['assumptionsAndConstraints', 'stressTestScenarios'].includes(section)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate record against workflow profile.
   * @param {LawfulWorkflowProfile} profile - Workflow profile to validate against
   * @returns {Object} Validation result
   */
  validateAgainstProfile(profile) {
    const violations = [];

    if (!profile) {
      violations.push('No workflow profile provided for validation.');
      return { valid: false, violations, recordId: this.recordId };
    }

    if (this.workflowProfileId !== profile.profileId) {
      violations.push(`Profile ID mismatch: ${this.workflowProfileId} vs ${profile.profileId}`);
    }

    const profileValidation = profile.validate();
    if (!profileValidation.valid) {
      violations.push(...profileValidation.violations.map(v => `Profile: ${v}`));
    }

    if (!this.compliance.allSectionsPresent) {
      violations.push('Not all required sections are present in the record.');
    }

    return {
      valid: violations.length === 0,
      violations,
      recordId: this.recordId,
      profileId: profile?.profileId ?? null,
      validatedAt: Date.now()
    };
  }

  /**
   * Serialize record to JSON for ALN anchoring.
   * @returns {Object} JSON-serializable record
   */
  toJSON() {
    return {
      recordId: this.recordId,
      version: this.version,
      createdAt: this.createdAt,
      workflowProfileId: this.workflowProfileId,
      runId: this.runId,
      sections: this.sections,
      compliance: this.compliance,
      anchoring: this.anchoring,
      contentHash: this._computeHash()
    };
  }

  /**
   * Deserialize record from JSON.
   * @param {Object} json - Serialized record
   * @returns {GovernanceRecord} Reconstructed record
   */
  static fromJSON(json) {
    const record = new GovernanceRecord({
      recordId: json.recordId,
      workflowProfileId: json.workflowProfileId,
      runId: json.runId,
      envelopeHash: json.anchoring?.envelopeHash,
      manifestId: json.anchoring?.manifestId,
      commitments: json.anchoring?.commitments
    });

    record.version = json.version;
    record.createdAt = json.createdAt;
    record.sections = json.sections;
    record.compliance = json.compliance;
    record.anchoring = json.anchoring;

    return record;
  }

  /**
   * Compute hash for integrity verification.
   * @private
   */
  _computeHash() {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      recordId: this.recordId,
      workflowProfileId: this.workflowProfileId,
      runId: this.runId,
      sections: this.sections,
      createdAt: this.createdAt
    }, Object.keys({
      recordId: this.recordId,
      workflowProfileId: this.workflowProfileId,
      runId: this.runId,
      sections: this.sections,
      createdAt: this.createdAt
    }).sort()));
    return hash.digest('hex');
  }

  /**
   * Generate unique record ID.
   * @private
   */
  _generateRecordId() {
    const hash = crypto.createHash('sha256');
    hash.update(`governance-record:${Date.now()}:${Math.random()}`);
    return `gr_${hash.digest('hex').slice(0, 20)}`;
  }

  /**
   * Get record summary for quick inspection.
   * @returns {Object} Summary data
   */
  getSummary() {
    return {
      recordId: this.recordId,
      version: this.version,
      createdAt: new Date(this.createdAt).toISOString(),
      workflowProfileId: this.workflowProfileId,
      runId: this.runId,
      allSectionsPresent: this.compliance.allSectionsPresent,
      readyForAnchor: this.anchoring.readyForAnchor,
      commitmentCount: this.anchoring.commitments.length
    };
  }
}

/**
 * Create a lawful workflow profile with default settings.
 * @param {Object} options - Profile options
 * @returns {LawfulWorkflowProfile} Created profile
 */
export function createLawfulWorkflowProfile(options) {
  return new LawfulWorkflowProfile(options);
}

/**
 * Create a governance record from research output.
 * @param {Object} options - Record options
 * @returns {GovernanceRecord} Created record
 */
export function createGovernanceRecord(options) {
  return new GovernanceRecord(options);
}

export default { LawfulWorkflowProfile, GovernanceRecord, createLawfulWorkflowProfile, createGovernanceRecord };
