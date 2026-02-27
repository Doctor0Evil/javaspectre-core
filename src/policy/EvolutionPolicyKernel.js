// EvolutionPolicyKernel enforces "shape, never cap" doctrine for EVOLVE and TRAIT.

export class EvolutionPolicyKernel {
  constructor(config = {}) {
    this.maxDeltaPerStep = config.maxDeltaPerStep ?? 0.05;          // fraction of local band
    this.maxDeltaPerInterval = config.maxDeltaPerInterval ?? 0.2;   // per session / window
    this.softPainThreshold = config.softPainThreshold ?? 0.3;       // 0..1 normalized
    this.hardPainThreshold = config.hardPainThreshold ?? 0.7;
    this.lifeforceFloor = config.lifeforceFloor ?? 0.35;            // e.g., BLOOD/OXYGEN normalized
    this.ecoCeiling = config.ecoCeiling ?? 0.8;                     // ECO / NANO load
    this.cooldownSeconds = config.cooldownSeconds ?? 3600;
  }

  /**
   * Validate a proposed EVOLVE step.
   * Ensures: no lifetime caps, only per-step / per-interval shaping.
   */
  validateEvolveStep({ hostId, domainId, currentValue, proposedDelta, intervalAccumulated, bands }) {
    if (!hostId || !domainId) {
      throw new Error("EvolutionPolicyKernel.validateEvolveStep requires hostId and domainId.");
    }
    if (typeof proposedDelta !== "number") {
      throw new Error("proposedDelta must be numeric.");
    }

    const lifeforce = bands?.lifeforce ?? 1.0;
    const ecoLoad = bands?.ecoLoad ?? 0.0;

    const perStepLimit = this.maxDeltaPerStep;
    const perIntervalLimit = this.maxDeltaPerInterval;

    const magnitude = Math.abs(proposedDelta);
    const intervalMagnitude = Math.abs(intervalAccumulated + proposedDelta);

    const reasons = [];
    let adjustedDelta = proposedDelta;

    // Lifeforce floors and eco ceilings: slow or temporarily block, never cap total EVOLVE.
    if (lifeforce < this.lifeforceFloor) {
      adjustedDelta = proposedDelta * 0.1;
      reasons.push("lifeforce_low_micro_step");
    }
    if (ecoLoad > this.ecoCeiling) {
      adjustedDelta = proposedDelta * 0.1;
      reasons.push("eco_high_micro_step");
    }

    // Enforce per-step magnitude shaping
    if (Math.abs(adjustedDelta) > perStepLimit) {
      adjustedDelta = perStepLimit * Math.sign(adjustedDelta);
      reasons.push("step_clamped_to_maxDeltaPerStep");
    }

    // Enforce per-interval shaping (no lifetime ceiling)
    if (intervalMagnitude > perIntervalLimit) {
      const remaining = Math.max(perIntervalLimit - Math.abs(intervalAccumulated), 0);
      adjustedDelta = remaining * Math.sign(proposedDelta);
      reasons.push("interval_clamped_to_maxDeltaPerInterval");
    }

    // Compute resulting value but do not impose a hard maxTotal cap
    const nextValue = currentValue + adjustedDelta;

    return {
      hostId,
      domainId,
      allowed: Math.abs(adjustedDelta) > 0,
      adjustedDelta,
      nextValue,
      reasons
    };
  }

  /**
   * Evaluate TRAIT consent and revocation, based on pain, lifeforce, eco, and history.
   * TRAIT is always revocable; revocation eligibility does not depend on total EVOLVE.
   */
  evaluateTraitState({ trait, signals, now = Date.now() }) {
    if (!trait || !trait.id || !trait.domainId) {
      throw new Error("evaluateTraitState requires a trait with id and domainId.");
    }

    const pain = signals?.pain ?? 0.0;              // 0..1
    const irritation = signals?.irritation ?? 0.0;  // 0..1
    const lifeforce = signals?.lifeforce ?? 1.0;
    const ecoLoad = signals?.ecoLoad ?? 0.0;
    const hardStopsAfterTrait = signals?.hardStopsAfterTrait ?? 0;

    const discomfort = Math.max(pain, irritation);
    const flags = [];
    let recommendedAction = "maintain";
    let coolingDown = false;

    // Evidence-based revocation / attenuation triggers
    if (discomfort >= this.hardPainThreshold) {
      flags.push("hard_pain_corridor");
      recommendedAction = "rollback_micro_steps";
      coolingDown = true;
    } else if (discomfort >= this.softPainThreshold) {
      flags.push("soft_pain_corridor");
      recommendedAction = "attenuate_trait";
    }

    if (lifeforce < this.lifeforceFloor) {
      flags.push("lifeforce_floor_approach");
      if (recommendedAction === "maintain") {
        recommendedAction = "attenuate_trait";
      }
      coolingDown = true;
    }

    if (ecoLoad > this.ecoCeiling) {
      flags.push("eco_overload");
      if (recommendedAction === "maintain") {
        recommendedAction = "attenuate_trait";
      }
    }

    if (hardStopsAfterTrait > 0) {
      flags.push("repeated_hard_stops");
      if (recommendedAction === "maintain") {
        recommendedAction = "rollback_micro_steps";
      }
      coolingDown = true;
    }

    // Respect host revocation intent at all times.
    if (trait.hostRevoked === true) {
      flags.push("host_revocation");
      recommendedAction = "rollback_micro_steps";
      coolingDown = true;
    }

    const nextState = {
      id: trait.id,
      domainId: trait.domainId,
      status: trait.status ?? "enabled",
      coolingDown,
      recommendedAction,
      flags,
      lastEvaluatedAt: new Date(now).toISOString()
    };

    if (coolingDown) {
      nextState.status = "cooldown";
      nextState.cooldownUntil = new Date(now + this.cooldownSeconds * 1000).toISOString();
    }

    return nextState;
  }

  /**
   * Check if SMART automation is allowed to act on a TRAIT for a given host.
   * Enforces Metabolic_Consent corridors and lifeforce/DECAY-like limits.
   */
  isSmartAutomationAllowed({ trait, metabolicConsent, lifeforce, decayBand }) {
    if (!trait || !trait.id) {
      throw new Error("isSmartAutomationAllowed requires a trait with id.");
    }

    const consentCorridor = metabolicConsent?.corridorForTrait?.[trait.id] ?? null;
    const flags = [];

    if (!consentCorridor) {
      flags.push("no_metabolic_consent_corridor");
      return { allowed: false, flags };
    }

    if (trait.status === "cooldown" || trait.status === "revoked") {
      flags.push("trait_not_in_active_state");
      return { allowed: false, flags };
    }

    if (lifeforce < this.lifeforceFloor) {
      flags.push("lifeforce_too_low_for_smart");
      return { allowed: false, flags };
    }

    if (decayBand && decayBand === "hard_stop") {
      flags.push("decay_hard_stop_active");
      return { allowed: false, flags };
    }

    flags.push("within_metabolic_consent");
    return { allowed: true, flags };
  }

  /**
   * Governance guard: ensure a policy object does not introduce forbidden hard caps.
   * Throws if lifetime caps or TRAIT-transfer fields are detected.
   */
  static assertNoHardCapsOrTransferability(policy) {
    if (!policy || typeof policy !== "object") return;

    const forbiddenKeys = [
      "maxTotalEvolve",
      "maxLifetimeEvolve",
      "maxTraitCount",
      "maxLifetimeTraitCount",
      "maxEvolutionDomains"
    ];

    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(policy, key)) {
        throw new Error(`Forbidden structural cap detected in policy: ${key}`);
      }
    }

    if (policy.traitTransferable === true ||
        policy.traitStakeable === true ||
        policy.traitBridgeable === true) {
      throw new Error("TRAIT must not be transferable, stakeable, or bridgeable.");
    }

    if (Array.isArray(policy.traitFields)) {
      for (const field of policy.traitFields) {
        if (field === "soul" || field === "consciousness" || field === "soulBalance") {
          throw new Error("TRAIT fields may not encode soul or consciousness.");
        }
      }
    }
  }
}

export default EvolutionPolicyKernel;
