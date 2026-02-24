// Defines safety budgets and trust thresholds for DOM/trace excavation runs.

export class ExcavationSafetyProfile {
  constructor(profileName = "default") {
    this.profileName = profileName;

    // Hard limits per run (prevent abuse / overload)
    this.nodeBudget = 20000;           // max DOM nodes processed
    this.traceSpanBudget = 50000;      // max OpenTelemetry spans
    this.deepPassBudget = 2000;        // max objects allowed into deep-pass
    this.maxRunSeconds = 15;           // soft max per-run execution time

    // Confidence / drift thresholds (0.0–1.0)
    this.minConfidenceForAutoUse = 0.85;
    this.minConfidenceForDisplay = 0.4;
    this.maxDriftForAutoUse = 0.2;
    this.maxDriftForCitizenUI = 0.6;

    // Privacy / redaction rules
    this.redactPatterns = [
      /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,            // US SSN-like
      /\b[0-9]{16}\b/g,                             // 16-digit card-ish
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi // emails
    ];
  }

  shouldEnterDeepPass(estimatedValueScore, costScore) {
    // Favor high value, low cost; both 0.0–1.0
    if (this.deepPassBudget <= 0) return false;
    const decisionScore = estimatedValueScore - costScore;
    return decisionScore >= 0.25;
  }

  classifyObject(confidence, drift) {
    // Returns: "auto-use", "show-with-warning", or "quarantine"
    if (confidence >= this.minConfidenceForAutoUse && drift <= this.maxDriftForAutoUse) {
      return "auto-use";
    }
    if (confidence >= this.minConfidenceForDisplay && drift <= this.maxDriftForCitizenUI) {
      return "show-with-warning";
    }
    return "quarantine";
  }

  enforceBudgets(stats) {
    // stats: { nodes, spans, deepCandidates, runSeconds }
    const violations = [];
    if (stats.nodes > this.nodeBudget) violations.push("nodeBudget");
    if (stats.spans > this.traceSpanBudget) violations.push("traceSpanBudget");
    if (stats.deepCandidates > this.deepPassBudget) violations.push("deepPassBudget");
    if (stats.runSeconds > this.maxRunSeconds) violations.push("maxRunSeconds");
    return { ok: violations.length === 0, violations };
  }

  redactText(text) {
    let sanitized = text;
    for (const pattern of this.redactPatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }
    return sanitized;
  }
}

export default ExcavationSafetyProfile;
