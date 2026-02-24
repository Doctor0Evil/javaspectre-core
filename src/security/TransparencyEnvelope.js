// Wraps any Javaspectre run in an auditable, hash-friendly envelope.

import crypto from "crypto";

export function createTransparencyEnvelope(runMeta, inputs, outputs, safetyProfile, metrics) {
  const timestamp = new Date().toISOString();

  const envelope = {
    version: "1.0.0",
    timestamp,
    runId: crypto.randomUUID(),
    runMeta: {
      intent: runMeta.intent || "unspecified",
      mode: runMeta.mode || "dom",
      javaspectreVersion: runMeta.javaspectreVersion || "unknown",
      nodeVersion: process.version
    },
    safetyProfile: {
      profileName: safetyProfile.profileName,
      nodeBudget: safetyProfile.nodeBudget,
      traceSpanBudget: safetyProfile.traceSpanBudget,
      deepPassBudget: safetyProfile.deepPassBudget,
      maxRunSeconds: safetyProfile.maxRunSeconds,
      minConfidenceForAutoUse: safetyProfile.minConfidenceForAutoUse,
      maxDriftForAutoUse: safetyProfile.maxDriftForAutoUse
    },
    inputsSummary: {
      domSource: inputs.domSourceType || null,
      traceSource: inputs.traceSourceType || null,
      harSource: inputs.harSourceType || null,
      originHint: inputs.originHint || null
    },
    metrics: {
      nodesProcessed: metrics.nodesProcessed || 0,
      spansProcessed: metrics.spansProcessed || 0,
      deepPassObjects: metrics.deepPassObjects || 0,
      runSeconds: metrics.runSeconds || 0
    },
    outputsSummary: {
      virtualObjects: outputs.virtualObjectCount || 0,
      highConfidenceStable: outputs.highConfidenceStable || 0,
      quarantined: outputs.quarantined || 0
    },
    risksNoted: outputs.risksNoted || [],
    assumptions: outputs.assumptions || [],
    notes: outputs.notes || []
  };

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(envelope))
    .digest("hex");

  envelope.contentHash = hash;
  return envelope;
}
