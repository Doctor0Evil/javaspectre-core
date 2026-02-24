// Unified safety + transparency core for the Javaspectre introspection loop.

import crypto from "crypto";

/**
 * ExcavationSafetyProfile
 * Dynamic, mode-agnostic policy engine that:
 * - Enforces hard resource budgets per run.
 * - Classifies virtual objects into trust tiers.
 * - Applies privacy-preserving redaction.
 * - Is explicitly aware of context (role, device, network, consent).
 */
export class ExcavationSafetyProfile {
  constructor(config = {}) {
    const {
      profileName = "default-conservative",
      // Hard limits
      nodeBudget = 20000,
      traceSpanBudget = 50000,
      deepPassBudget = 2000,
      maxRunSeconds = 15,
      // Trust thresholds
      minConfidenceForAutoUse = 0.85,
      minConfidenceForDisplay = 0.4,
      maxDriftForAutoUse = 0.2,
      maxDriftForCitizenUI = 0.6,
      // Redaction
      redactPatterns = null,
      // Context tags (role, device, network, consent)
      context = {},
    } = config;

    this.profileName = profileName;

    // Budgets
    this.nodeBudget = nodeBudget;
    this.traceSpanBudget = traceSpanBudget;
    this.deepPassBudget = deepPassBudget;
    this.maxRunSeconds = maxRunSeconds;

    // Trust thresholds
    this.minConfidenceForAutoUse = minConfidenceForAutoUse;
    this.minConfidenceForDisplay = minConfidenceForDisplay;
    this.maxDriftForAutoUse = maxDriftForAutoUse;
    this.maxDriftForCitizenUI = maxDriftForCitizenUI;

    // Context / environment
    this.context = {
      role: context.role || "citizen",
      deviceClass: context.deviceClass || "edge-unknown",
      networkTrust: context.networkTrust || "unknown",
      consentLevel: context.consentLevel || "minimal",
      locationHint: context.locationHint || null,
    };

    // Privacy patterns
    this.redactPatterns =
      redactPatterns ||
      [
        // SSN-like
        { name: "ssn", regex: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g },
        // Simple credit card pattern
        {
          name: "credit-card",
          regex: /\b(?:\d[ -]*?){13,16}\b/g,
        },
        // Email
        {
          name: "email",
          regex:
            /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
        },
      ];
  }

  /**
   * Enforce budgets at the end (or during) an excavation pass.
   * stats: {
   *   nodesProcessed?: number,
   *   spansProcessed?: number,
   *   deepPassObjects?: number,
   *   runSeconds?: number
   * }
   * Throws an Error if a hard budget is exceeded.
   */
  enforceBudgets(stats) {
    const violations = [];

    if (
      typeof stats.nodesProcessed === "number" &&
      stats.nodesProcessed > this.nodeBudget
    ) {
      violations.push(
        `DOM node budget exceeded: ${stats.nodesProcessed} > ${this.nodeBudget}`
      );
    }

    if (
      typeof stats.spansProcessed === "number" &&
      stats.spansProcessed > this.traceSpanBudget
    ) {
      violations.push(
        `Trace span budget exceeded: ${stats.spansProcessed} > ${this.traceSpanBudget}`
      );
    }

    if (
      typeof stats.deepPassObjects === "number" &&
      stats.deepPassObjects > this.deepPassBudget
    ) {
      violations.push(
        `Deep-pass budget exceeded: ${stats.deepPassObjects} > ${this.deepPassBudget}`
      );
    }

    if (
      typeof stats.runSeconds === "number" &&
      stats.runSeconds > this.maxRunSeconds
    ) {
      violations.push(
        `Max run seconds exceeded: ${stats.runSeconds} > ${this.maxRunSeconds}`
      );
    }

    if (violations.length > 0) {
      const error = new Error(
        `ExcavationSafetyProfile.enforceBudgets: violation(s): ${violations.join(
          "; "
        )}`
      );
      error.violations = violations;
      throw error;
    }

    return { ok: true, violations: [] };
  }

  /**
   * Classify a virtual object into trust tiers.
   * obj: {
   *   id: string,
   *   confidence: number (0..1),
   *   drift: number (0..1),
   *   kind?: string,
   *   evidenceCount?: number
   * }
   *
   * Returns:
   *   { id, tier, rationale, flags }
   */
  classifyObject(obj) {
    const { id, confidence = 0, drift = 1 } = obj;
    const flags = [];

    if (confidence >= this.minConfidenceForAutoUse) {
      flags.push("high-confidence");
    } else if (confidence >= this.minConfidenceForDisplay) {
      flags.push("display-ok");
    } else {
      flags.push("low-confidence");
    }

    if (drift <= this.maxDriftForAutoUse) {
      flags.push("low-drift");
    } else if (drift <= this.maxDriftForCitizenUI) {
      flags.push("medium-drift");
    } else {
      flags.push("high-drift");
    }

    let tier = "quarantine";

    const autoUseOk =
      confidence >= this.minConfidenceForAutoUse &&
      drift <= this.maxDriftForAutoUse;

    const showWithWarningOk =
      !autoUseOk &&
      confidence >= this.minConfidenceForDisplay &&
      drift <= this.maxDriftForCitizenUI;

    if (autoUseOk) {
      tier = "auto-use";
    } else if (showWithWarningOk) {
      tier = "show-with-warning";
    } else {
      tier = "quarantine";
    }

    const rationale = {
      confidence,
      drift,
      thresholds: {
        minConfidenceForAutoUse: this.minConfidenceForAutoUse,
        minConfidenceForDisplay: this.minConfidenceForDisplay,
        maxDriftForAutoUse: this.maxDriftForAutoUse,
        maxDriftForCitizenUI: this.maxDriftForCitizenUI,
      },
      context: this.context,
    };

    return { id, tier, rationale, flags };
  }

  /**
   * Redact PII-like patterns in arbitrary text.
   * Returns { redacted, matches }.
   */
  redactText(text) {
    if (typeof text !== "string" || !text.length) {
      return { redacted: text, matches: [] };
    }

    let redacted = text;
    const matches = [];

    for (const pattern of this.redactPatterns) {
      const regex = pattern.regex;
      if (!regex || !(regex instanceof RegExp)) continue;

      const found = [];
      let match;
      regex.lastIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        found.push(match[0]);
      }

      if (found.length > 0) {
        matches.push({
          name: pattern.name,
          count: found.length,
        });
        redacted = redacted.replace(regex, "[REDACTED]");
      }
    }

    return { redacted, matches };
  }

  /**
   * Export a plain JSON snapshot suitable for embedding into a TransparencyEnvelope.
   */
  toJSON() {
    return {
      profileName: this.profileName,
      nodeBudget: this.nodeBudget,
      traceSpanBudget: this.traceSpanBudget,
      deepPassBudget: this.deepPassBudget,
      maxRunSeconds: this.maxRunSeconds,
      minConfidenceForAutoUse: this.minConfidenceForAutoUse,
      minConfidenceForDisplay: this.minConfidenceForDisplay,
      maxDriftForAutoUse: this.maxDriftForAutoUse,
      maxDriftForCitizenUI: this.maxDriftForCitizenUI,
      context: this.context,
      redactPatterns: this.redactPatterns.map((p) => ({
        name: p.name,
        // Intentionally omit regex itself; it is implementation detail.
      })),
    };
  }
}

/**
 * TransparencyEnvelope
 * Immutable evidence log for a single excavation run.
 * - Includes safety profile snapshot, metrics, inputs/outputs summary.
 * - Computes a SHA-256 content hash as tamper-evident seal.
 */
export function createTransparencyEnvelope({
  runId,
  intent,
  mode,
  safetyProfile,
  inputsSummary,
  metrics,
  outputsSummary,
  risksNoted = [],
  assumptions = [],
  notes = [],
  env = {},
}) {
  if (!runId) {
    throw new Error("createTransparencyEnvelope requires a runId.");
  }

  const timestamp = new Date().toISOString();

  const envelope = {
    version: "1.0.0",
    timestamp,
    runId,
    runMeta: {
      intent: intent || "unspecified",
      mode: mode || "unknown",
      environment: {
        javaspectreVersion: env.javaspectreVersion || "unknown",
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    },
    safetyProfile: safetyProfile
      ? safetyProfile.toJSON()
      : null,
    inputsSummary: inputsSummary || {},
    metrics: metrics || {},
    outputsSummary: outputsSummary || {},
    risksNoted: Array.isArray(risksNoted) ? risksNoted : [],
    assumptions: Array.isArray(assumptions)
      ? assumptions
      : [],
    notes: Array.isArray(notes) ? notes : [],
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
 * Example helper to wire SafetyProfile and TransparencyEnvelope into
 * the main Javaspectre introspection loop.
 *
 * This is designed to be called from the CLI or SessionManager.
 * It does not perform excavation itself; instead, it:
 * - Starts a timer.
 * - Lets caller run excavation work.
 * - Enforces budgets based on returned stats.
 * - Builds a TransparencyEnvelope.
 */
export async function runWithSafetyAndEnvelope({
  runId,
  intent,
  mode,
  safetyProfile,
  executePass,
  inputsSummaryBuilder,
  outputsSummaryBuilder,
  env,
}) {
  const profile =
    safetyProfile ||
    new ExcavationSafetyProfile({
      profileName: "default-conservative",
    });

  const startedAt = process.hrtime.bigint();

  // executePass() is provided by caller and must return:
  // {
  //   stats: { nodesProcessed, spansProcessed, deepPassObjects },
  //   metricsExtra?: object,
  //   objects?: Array<{ id, confidence, drift, ... }>
  // }
  const result = await executePass(profile);
  const endedAt = process.hrtime.bigint();

  const elapsedSeconds =
    Number(endedAt - startedAt) / 1e9;

  const statsWithTime = {
    ...(result.stats || {}),
    runSeconds: elapsedSeconds,
  };

  // Enforce budgets at the end of the run.
  profile.enforceBudgets(statsWithTime);

  // Build summaries.
  const inputsSummary =
    typeof inputsSummaryBuilder === "function"
      ? inputsSummaryBuilder()
      : {};

  const outputsSummary =
    typeof outputsSummaryBuilder === "function"
      ? outputsSummaryBuilder(result.objects || [])
      : {};

  const metrics = {
    ...statsWithTime,
    ...(result.metricsExtra || {}),
  };

  const envelope = createTransparencyEnvelope({
    runId,
    intent,
    mode,
    safetyProfile: profile,
    inputsSummary,
    metrics,
    outputsSummary,
    env,
    risksNoted: result.risksNoted || [],
    assumptions: result.assumptions || [],
    notes: result.notes || [],
  });

  return { result, envelope };
}
