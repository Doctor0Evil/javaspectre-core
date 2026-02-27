// Host-sovereign evolution guard implementing "shape, never cap" for ALN-mediated traits.

import crypto from "node:crypto";

export class HostConsentKey {
  constructor({ publicKeyPem }) {
    if (!publicKeyPem) throw new Error("HostConsentKey requires publicKeyPem");
    this.publicKeyPem = publicKeyPem;
  }

  verifyCommand({ payload, signature }) {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(JSON.stringify(payload));
    verifier.end();
    const ok = verifier.verify(this.publicKeyPem, Buffer.from(signature, "hex"));
    if (!ok) throw new Error("Host command signature verification failed");
    return true;
  }
}

export class ShapeOnlyProfile {
  constructor(config = {}) {
    this.id = config.id || "default-shape-only";
    this.maxTraitDeltaPerHour = config.maxTraitDeltaPerHour ?? 0.05;
    this.maxConcurrentTraitUpdates = config.maxConcurrentTraitUpdates ?? 4;
    this.minHostFloorByTrait = { ...(config.minHostFloorByTrait || {}) };
    this.context = {
      deviceClass: config.context?.deviceClass || "edge-unknown",
      networkTrust: config.context?.networkTrust || "unknown",
      consentLevel: config.context?.consentLevel || "minimal",
      locationHint: config.context?.locationHint || null
    };
  }

  setHostFloor(traitId, floorValue, hostKey, command) {
    hostKey.verifyCommand(command);
    this.minHostFloorByTrait[traitId] = floorValue;
  }

  enforceShapeOnly(currentTraits, proposedUpdates) {
    const violations = [];
    if (!Array.isArray(proposedUpdates)) {
      throw new Error("proposedUpdates must be an array");
    }

    if (proposedUpdates.length > this.maxConcurrentTraitUpdates) {
      violations.push(
        `Too many concurrent trait updates: ${proposedUpdates.length} > ${this.maxConcurrentTraitUpdates}`
      );
    }

    const shapedUpdates = proposedUpdates.map(update => {
      const { traitId, delta, proposedValue } = update;
      if (typeof traitId !== "string") {
        violations.push("Missing traitId on update");
        return null;
      }

      const currentVal = currentTraits[traitId] ?? 0;
      const floor = this.minHostFloorByTrait[traitId];
      let limitedDelta = delta;

      if (Math.abs(delta) > this.maxTraitDeltaPerHour) {
        limitedDelta =
          (delta > 0 ? 1 : -1) * this.maxTraitDeltaPerHour;
      }

      let newValue =
        typeof proposedValue === "number"
          ? proposedValue
          : currentVal + limitedDelta;

      if (typeof floor === "number" && newValue < floor) {
        newValue = floor;
        violations.push(
          `Shape-only floor enforced for trait ${traitId}: clamped to host floor ${floor}`
        );
      }

      return {
        traitId,
        previousValue: currentVal,
        requestedDelta: delta,
        appliedDelta: newValue - currentVal,
        newValue
      };
    }).filter(Boolean);

    return { shapedUpdates, violations };
  }

  toJSON() {
    return {
      id: this.id,
      maxTraitDeltaPerHour: this.maxTraitDeltaPerHour,
      maxConcurrentTraitUpdates: this.maxConcurrentTraitUpdates,
      minHostFloorByTrait: this.minHostFloorByTrait,
      context: this.context
    };
  }
}

export class BiocompatibilityIndex {
  static compute({ sensoryMetrics, metabolicMetrics, morphologyMetrics }) {
    const clamp01 = x => Math.max(0, Math.min(1, x));

    const sensory =
      sensoryMetrics &&
      typeof sensoryMetrics.overloadRate === "number" &&
      typeof sensoryMetrics.latencyScore === "number"
        ? clamp01(
            1 -
              sensoryMetrics.overloadRate * 0.7 +
              sensoryMetrics.latencyScore * 0.3
          )
        : 0.5;

    const metabolic =
      metabolicMetrics &&
      typeof metabolicMetrics.energyOverhead === "number" &&
      typeof metabolicMetrics.uptimeStability === "number"
        ? clamp01(
            1 -
              metabolicMetrics.energyOverhead * 0.6 +
              metabolicMetrics.uptimeStability * 0.4
          )
        : 0.5;

    const morphology =
      morphologyMetrics &&
      typeof morphologyMetrics.stressShift === "number" &&
      typeof morphologyMetrics.reversibilityScore === "number"
        ? clamp01(
            1 -
              morphologyMetrics.stressShift * 0.6 +
              morphologyMetrics.reversibilityScore * 0.4
          )
        : 0.5;

    const overall = clamp01(
      sensory * 0.34 + metabolic * 0.33 + morphology * 0.33
    );

    return {
      overall,
      sensory,
      metabolic,
      morphology
    };
  }
}

export class EvolutionGuard {
  constructor({ hostKey, profile }) {
    if (!hostKey || !profile) {
      throw new Error("EvolutionGuard requires hostKey and profile");
    }
    this.hostKey = hostKey;
    this.profile = profile;
  }

  planEvolutionStep({ currentTraits, proposedUpdates, bioSignals }) {
    const shaped = this.profile.enforceShapeOnly(
      currentTraits,
      proposedUpdates
    );
    const bci = BiocompatibilityIndex.compute({
      sensoryMetrics: bioSignals?.sensory,
      metabolicMetrics: bioSignals?.metabolic,
      morphologyMetrics: bioSignals?.morphology
    });

    const painCorridorFlag =
      bioSignals?.sensory?.painScore &&
      bioSignals.sensory.painScore > 0.7;

    const lifeforceLowFlag =
      bioSignals?.metabolic?.lifeforceScore &&
      bioSignals.metabolic.lifeforceScore < 0.3;

    const requiresHostConfirmation =
      bci.overall < 0.5 || painCorridorFlag || lifeforceLowFlag;

    const rationale = {
      bci,
      violations: shaped.violations,
      painCorridorFlag,
      lifeforceLowFlag,
      note:
        "Shape-only evolution; host confirmation required when BCI is low or pain/lifeforce flags are raised."
    };

    return {
      shapedUpdates: shaped.shapedUpdates,
      rationale,
      requiresHostConfirmation
    };
  }

  applyHostDecision({ decision, currentTraits, plan, command }) {
    this.hostKey.verifyCommand(command);

    if (decision !== "approve") {
      return {
        appliedTraits: { ...currentTraits },
        note: `Host decision '${decision}' – no changes applied.`
      };
    }

    const appliedTraits = { ...currentTraits };
    for (const u of plan.shapedUpdates) {
      appliedTraits[u.traitId] = u.newValue;
    }

    return {
      appliedTraits,
      note: "Host-approved evolution step applied under shape-only constraints."
    };
  }
}

export default EvolutionGuard;
