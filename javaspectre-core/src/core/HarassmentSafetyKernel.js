// Javaspectre harassment / neurorights safety kernel for augmented-citizen stacks.

import crypto from "crypto";

/**
 * Safety profile tuned by role/device/consent.
 */
export class HarassmentSafetyProfile {
  constructor(config = {}) {
    const {
      profileName = "citizen-default",
      // Hard limits / RoH envelopes
      maxStressScore = 0.3,          // RoH-style upper bound for a single scene
      maxCumulativeStress = 0.6,     // rolling window cap
      maxHarassmentConfidence = 0.2, // if harassment score is above this, hard block
      // Context
      context = {}
    } = config;

    this.profileName = profileName;
    this.maxStressScore = maxStressScore;
    this.maxCumulativeStress = maxCumulativeStress;
    this.maxHarassmentConfidence = maxHarassmentConfidence;

    this.context = {
      role: context.role || "citizen",
      deviceClass: context.deviceClass || "xr-edge",
      networkTrust: context.networkTrust || "unknown",
      consentLevel: context.consentLevel || "minimal",
      locationHint: context.locationHint || null,
      ageBand: context.ageBand || "adult-unknown",
      traumaFlags: context.traumaFlags || []
    };

    // simple rolling window state (should be persisted per user/session upstream)
    this.cumulativeStress = 0;
  }

  /**
   * Score a virtual scene/experience for harassment risk.
   * input: {
   *   id, tags[], narrative[], intensityEstimate 0..1,
   *   phobiaHooks[], repetitionPatterns[], targetBodyZones[]
   * }
   */
  scoreHarassmentRisk(scene) {
    const tags = new Set(scene.tags || []);
    const narrative = (scene.narrative || []).join(" ").toLowerCase();

    let harassmentScore = 0;

    // Strong red flags for "infestation / pest / crawling on body"
    const infestationKeywords = [
      "bedbug","bed bug","infestation","lice","mites","ticks",
      "crawling on skin","bugs under skin"
    ];
    if (infestationKeywords.some(k => narrative.includes(k))) {
      harassmentScore += 0.6;
    }

    // Modifiers from tags
    if (tags.has("phobia-exploitation")) harassmentScore += 0.3;
    if (tags.has("forced-proximity")) harassmentScore += 0.2;
    if (tags.has("stalking-loop")) harassmentScore += 0.2;
    if (tags.has("body-harassment")) harassmentScore += 0.3;

    // Use explicit phobia hooks
    const phobiaHooks = scene.phobiaHooks || [];
    if (phobiaHooks.length > 0) {
      harassmentScore += 0.1 * phobiaHooks.length;
    }

    // Repetition / inescapability
    const repetition = scene.repetitionPatterns || [];
    if (repetition.includes("inescapable") || repetition.includes("always-on")) {
      harassmentScore += 0.2;
    }

    // Bound score between 0 and 1
    harassmentScore = Math.max(0, Math.min(1, harassmentScore));

    // Rough stress estimate: combine intensity + harassment
    const intensity = typeof scene.intensityEstimate === "number"
      ? Math.max(0, Math.min(1, scene.intensityEstimate))
      : 0.4;

    const stressScore = Math.max(harassmentScore, intensity);

    return { harassmentScore, stressScore };
  }

  /**
   * Decide whether to ALLOW, WARN, or BLOCK based on scores and cumulative exposure.
   */
  decide(scene, scores) {
    const { harassmentScore, stressScore } = scores;

    // Update in-memory rolling stress (caller can reset per time window)
    const projectedCumulative = this.cumulativeStress + stressScore;

    // Hard block if harassment confidence is above profile threshold.
    if (harassmentScore >= this.maxHarassmentConfidence) {
      return {
        decision: "BLOCK",
        reason: "harassment-score-threshold",
        details: {
          harassmentScore,
          stressScore,
          maxHarassmentConfidence: this.maxHarassmentConfidence
        }
      };
    }

    // Hard block if scene exceeds RoH-style envelope
    if (stressScore > this.maxStressScore) {
      return {
        decision: "BLOCK",
        reason: "stress-envelope-exceeded",
        details: {
          stressScore,
          maxStressScore: this.maxStressScore
        }
      };
    }

    // Block if cumulative exposure would exceed window
    if (projectedCumulative > this.maxCumulativeStress) {
      return {
        decision: "BLOCK",
        reason: "cumulative-stress-window",
        details: {
          projectedCumulative,
          maxCumulativeStress: this.maxCumulativeStress
        }
      };
    }

    // For non-citizen roles, allow WARN tier
    if (this.context.role !== "citizen" && harassmentScore > 0) {
      return {
        decision: "WARN",
        reason: "non-citizen-review-only",
        details: { harassmentScore, stressScore }
      };
    }

    // Citizen-safe allow
    return {
      decision: "ALLOW",
      reason: "within-neurorights-envelope",
      details: { harassmentScore, stressScore }
    };
  }

  /**
   * Apply decision (update cumulative stress if allowed).
   */
  applyDecision(decisionResult, scores) {
    if (decisionResult.decision === "ALLOW") {
      this.cumulativeStress = Math.max(
        0,
        Math.min(1, this.cumulativeStress + scores.stressScore)
      );
    }
  }

  toJSON() {
    return {
      profileName: this.profileName,
      maxStressScore: this.maxStressScore,
      maxCumulativeStress: this.maxCumulativeStress,
      maxHarassmentConfidence: this.maxHarassmentConfidence,
      context: this.context
    };
  }
}

/**
 * Transparency envelope for a single harassment check.
 */
export function createHarassmentEnvelope(runId, scene, scores, decision, profile) {
  const timestamp = new Date().toISOString();

  const envelope = {
    version: "1.0.0",
    type: "harassment-safety-check",
    runId,
    timestamp,
    profile: profile.toJSON(),
    sceneMeta: {
      id: scene.id || null,
      tags: scene.tags || [],
      phobiaHooks: scene.phobiaHooks || [],
      source: scene.source || "unknown"
    },
    scores,
    decision,
    context: profile.context
  };

  const serialized = JSON.stringify(envelope);
  const contentHash = crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");

  envelope.contentHash = contentHash;

  return envelope;
}

/**
 * Convenience function:
 *   - scores scene
 *   - decides & applies exposure
 *   - returns decision + envelope for anchoring/logging
 */
export function evaluateSceneWithHarassmentKernel(scene, profileConfig = {}) {
  const profile = new HarassmentSafetyProfile(profileConfig);
  const scores = profile.scoreHarassmentRisk(scene);
  const decision = profile.decide(scene, scores);
  profile.applyDecision(decision, scores);

  const runId = crypto.randomUUID();
  const envelope = createHarassmentEnvelope(runId, scene, scores, decision, profile);

  return { profile, scores, decision, envelope };
}
