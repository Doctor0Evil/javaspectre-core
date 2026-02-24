// Canonical JSON-schema-like descriptors for objects shared with Rust.

export const ExcavationEnergyProfileSchema = {
  id: "ExcavationEnergyProfile",
  type: "object",
  required: [
    "runId",
    "nodeId",
    "deviceClass",
    "perfTier",
    "estimatedJoules",
    "estimatedSeconds",
    "nanoDataVolume"
  ],
  properties: {
    runId: { type: "string" },
    nodeId: { type: "string" },
    deviceClass: { type: "string" }, // e.g. "jetson-orin-nx"
    perfTier: { type: "string", enum: ["low", "medium", "high"] },
    estimatedJoules: { type: "number", minimum: 0 },
    estimatedSeconds: { type: "number", minimum: 0 },
    nanoDataVolume: { type: "number", minimum: 0 }, // e.g. bytes or normalized units
    budgetJoules: { type: "number", minimum: 0 },
    budgetSeconds: { type: "number", minimum: 0 }
  }
};

export const SafetyBudgetSnapshotSchema = {
  id: "SafetyBudgetSnapshot",
  type: "object",
  required: ["nodeBudget", "traceSpanBudget", "deepPassBudget", "maxRunSeconds"],
  properties: {
    nodeBudget: { type: "integer", minimum: 0 },
    traceSpanBudget: { type: "integer", minimum: 0 },
    deepPassBudget: { type: "integer", minimum: 0 },
    maxRunSeconds: { type: "number", minimum: 0 }
  }
};

export const TraceStateMachineMotifSchema = {
  id: "TraceStateMachineMotif",
  type: "object",
  required: ["motifId", "fsmHash", "domainCategory", "errorRate"],
  properties: {
    motifId: { type: "string" },
    fsmHash: { type: "string" },
    domainCategory: { type: "string" }, // e.g. "finance", "civic"
    errorRate: { type: "number", minimum: 0, maximum: 1 },
    recentLatencyMsP95: { type: "number", minimum: 0 },
    recentCallRatePerMin: { type: "number", minimum: 0 }
  }
};
