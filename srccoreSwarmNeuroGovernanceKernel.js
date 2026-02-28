// Swarm-level neuro-governance kernel for CyberKube-style medical swarms.
// Enforces consent-aware neurorights policies, logs decisions, and prepares
// anchorable evidence for Bostrom / multi-ledger pipelines.

import crypto from "node:crypto";
import { ExcavationSafetyProfile } from "./coreSafetyAndTransparencyKernel.js";
import { createTransparencyEnvelope } from "./coreSafetyAndTransparencyKernel.js";

export class NeurorightsPolicyEngine {
  constructor(config) {
    this.config = {
      // Hard neurorights defaults; can be overridden per deployment.
      requireExplicitConsentForRisk: ["neural-write", "stimulation", "personality-drift"],
      requireHumanOversightForRisk: ["stimulation", "personality-drift"],
      maxAdaptiveRateHz: 0.5, // no more than one risky adaptation every 2 s per subject
      ...config
    };
    this.subjectWindows = new Map(); // subjectId -> { lastRiskEvents: [{t, riskClass}], rateHz }
  }

  evaluateRequest(request) {
    const now = Date.now();
    const {
      subjectId,
      riskClass,
      consent,
      operatorRole,
      mode
    } = request;

    const violations = [];

    if (!subjectId) {
      violations.push("missing-subject-id");
    }
    if (!riskClass) {
      violations.push("missing-risk-class");
    }

    // Consent checks for neurorights (cognitive liberty, mental privacy).
    if (
      this.config.requireExplicitConsentForRisk.includes(riskClass) &&
      consent?.level !== "explicit"
    ) {
      violations.push("insufficient-consent");
    }

    if (consent?.expired === true) {
      violations.push("consent-expired");
    }

    // Human oversight requirement for high-risk modes.
    if (
      this.config.requireHumanOversightForRisk.includes(riskClass) &&
      operatorRole !== "clinician"
    ) {
      violations.push("human-oversight-required");
    }

    // Rate limiting per subject to prevent rapid, opaque behavior shifts.
    const window = this._updateRateWindow(subjectId, riskClass, now);
    if (window.rateHz > this.config.maxAdaptiveRateHz) {
      violations.push("adaptive-rate-limit-exceeded");
    }

    // FDA/ISO-like "mode" check: high-risk neural-write should not run
    // in degraded / unknown swarm modes.
    if (riskClass === "neural-write" && mode !== "normal") {
      violations.push("unsafe-mode-for-neural-write");
    }

    const allowed = violations.length === 0;
    const tier = allowed ? "auto-use" : "quarantine";

    return {
      allowed,
      tier,
      violations,
      evaluatedAt: new Date(now).toISOString(),
      window
    };
  }

  _updateRateWindow(subjectId, riskClass, nowMs) {
    const spanMs = 10_000; // 10 s sliding window
    const key = subjectId || "_unknown";
    const existing = this.subjectWindows.get(key) || { lastRiskEvents: [] };

    const events = existing.lastRiskEvents.filter(e => nowMs - e.t <= spanMs);
    events.push({ t: nowMs, riskClass });

    const rateHz = events.length / (spanMs / 1000);
    const updated = { lastRiskEvents: events, rateHz };
    this.subjectWindows.set(key, updated);
    return updated;
  }
}

export class SwarmNeuroGovernanceKernel {
  constructor(options = {}) {
    this.policyEngine = new NeurorightsPolicyEngine(options.policy);
    this.safetyProfile = options.safetyProfile || new ExcavationSafetyProfile({
      profileName: "swarm-neuro-default",
      nodeBudget: 5000,
      traceSpanBudget: 20000,
      deepPassBudget: 512,
      maxRunSeconds: 2,
      context: {
        role: "swarm-controller",
        deviceClass: "cluster",
        networkTrust: "hospital-lan",
        consentLevel: "unspecified",
        locationHint: options.locationHint || null
      }
    });
  }

  /**
   * Evaluate a proposed adaptation and, if allowed, wrap it in a
   * TransparencyEnvelope-like object with contentHash suitable for anchoring.
   *
   * @param {object} decision - Proposed swarm decision:
   *   {
   *     decisionId, subjectId, nodeIds, riskClass,
   *     consent: { level, expired, source },
   *     operator: { id, role },
   *     mode: "normal"|"degraded"|"emergency",
   *     parameters: { ...neuralParamDelta },
   *     metrics: { ...runtimeBounds },
   *     alnContext: { modelId, planId },
   *     deviceContext: { swarmId, firmwareVersion }
   *   }
   */
  evaluateAndSealDecision(decision) {
    if (!decision?.decisionId) {
      throw new Error("SwarmNeuroGovernanceKernel: decisionId is required.");
    }

    const evaluation = this.policyEngine.evaluateRequest({
      subjectId: decision.subjectId,
      riskClass: decision.riskClass,
      consent: decision.consent,
      operatorRole: decision.operator?.role,
      mode: decision.mode
    });

    // Map policy result into trust tier and safety profile rationale.
    const outputsSummary = {
      decisionId: decision.decisionId,
      subjectId: decision.subjectId || null,
      nodeIds: decision.nodeIds || [],
      riskClass: decision.riskClass,
      allowed: evaluation.allowed,
      tier: evaluation.tier,
      violations: evaluation.violations,
      operatorRole: decision.operator?.role || null,
      mode: decision.mode,
      parameters: decision.parameters || {}
    };

    // Treat this as a short "run" for the safety profile.
    const metrics = {
      nodesProcessed: Array.isArray(decision.nodeIds) ? decision.nodeIds.length : 0,
      spansProcessed: 0,
      deepPassObjects: 0,
      runSeconds: decision.metrics?.runSeconds ?? 0.01,
      ...decision.metrics
    };

    // Enforce safety budgets (ISO-style resource controls).
    this.safetyProfile.enforceBudgets(metrics);

    const runId = decision.decisionId;
    const intent = `swarm-neuro-decision:${decision.riskClass}`;
    const mode = "swarm-neuro";

    const inputsSummary = {
      subjectId: decision.subjectId || null,
      consent: decision.consent || null,
      nodeIds: decision.nodeIds || [],
      deviceContext: decision.deviceContext || {},
      alnContext: decision.alnContext || {}
    };

    const envMeta = {
      javaspectreVersion: decision.env?.javaspectreVersion || "swarm-0.1.0",
      nodeVersion: process.version
    };

    const envelope = createTransparencyEnvelope(
      runId,
      intent,
      mode,
      this.safetyProfile,
      inputsSummary,
      metrics,
      outputsSummary,
      evaluation.violations.length ? evaluation.violations : [],
      [`operator:${decision.operator?.id || "unknown"}`],
      [`neuro-governance:${evaluation.tier}`],
      envMeta
    );

    // Minimal, chain-agnostic anchor fragment – this is what your existing
    // AnchorManifest builder will consume.
    const anchorSeed = {
      runId,
      contentHash: envelope.contentHash,
      subjectId: decision.subjectId || null,
      did: decision.operator?.did || null,
      riskClass: decision.riskClass,
      createdAt: envelope.timestamp,
      homeChain: "bostrom",
      deviceContext: inputsSummary.deviceContext,
      alnContext: inputsSummary.alnContext
    };

    return {
      evaluation,
      envelope,
      anchorSeed
    };
  }
}

export default SwarmNeuroGovernanceKernel;
