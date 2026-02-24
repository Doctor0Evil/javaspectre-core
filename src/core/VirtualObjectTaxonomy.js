// Unified taxonomy and helpers for DOMStabilitySignature, TraceStateMachineMotif,
// VirtualObjectMotifFamily, ExcavationEnergyProfile, ModeCanonicalizationMap,
// SovereignExcavationProfile, TransparencyAnchorManifest, TrustTierCluster,
// RedactionPatternProfile, SovereignNodeProfile, EdgeZoneCognitiveOverlay,
// SustainabilityImpactScenario, MotifReuseLedgerEntry, IntegrityDeviationSnapshot,
// CitizenFacingExplainerPacket.

import crypto from "node:crypto";

/**
 * Utility: stable JSON hash (SHA-256) for IDs and signatures.
 */
export function hashJson(value) {
  const json = JSON.stringify(value);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Base class for all virtual objects with common metadata.
 */
export class VirtualObjectBase {
  constructor({ id = null, type, createdAt = null, sourceRunId = null, tags = [] }) {
    if (!type) throw new Error("VirtualObjectBase requires type.");
    this.id = id || crypto.randomUUID();
    this.type = type;
    this.createdAt = createdAt || new Date().toISOString();
    this.sourceRunId = sourceRunId || null;
    this.tags = Array.isArray(tags) ? tags : [];
  }

  toIndexKey() {
    return `${this.type}:${this.id}`;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      createdAt: this.createdAt,
      sourceRunId: this.sourceRunId,
      tags: this.tags
    };
  }
}

/**
 * DOMStabilitySignature
 * Compact fingerprint of a DOM component’s structure & temporal stability.
 */
export class DOMStabilitySignature extends VirtualObjectBase {
  constructor({
    normalizedSelector,
    role,
    stabilityScore,
    driftHistory = [],
    volatilityMetrics = {},
    domSample = null,
    sourceRunId = null,
    tags = []
  }) {
    const signaturePayload = {
      normalizedSelector,
      role,
      volatilityMetrics
    };
    const domSignatureHash = hashJson(signaturePayload);
    super({ id: domSignatureHash, type: "DOMStabilitySignature", sourceRunId, tags });

    this.domSignatureHash = domSignatureHash;
    this.normalizedSelector = normalizedSelector;
    this.role = role; // e.g. "form", "button", "banner", "table"
    this.stabilityScore = typeof stabilityScore === "number" ? stabilityScore : 0;
    this.driftHistory = driftHistory; // array of { runId, stabilityScore, timestamp }
    this.volatilityMetrics = volatilityMetrics; // path volatility, edit distance, mutation counts
    this.domSample = domSample; // optional structural excerpt
  }

  get stabilityBand() {
    const s = this.stabilityScore;
    if (s >= 0.9) return "very-stable";
    if (s >= 0.75) return "stable";
    if (s >= 0.5) return "medium";
    return "fragile";
  }

  static indexKeys(instance) {
    return {
      dom_signature_hash: instance.domSignatureHash,
      role: instance.role,
      stability_band: instance.stabilityBand
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      domSignatureHash: this.domSignatureHash,
      normalizedSelector: this.normalizedSelector,
      role: this.role,
      stabilityScore: this.stabilityScore,
      stabilityBand: this.stabilityBand,
      driftHistory: this.driftHistory,
      volatilityMetrics: this.volatilityMetrics,
      domSample: this.domSample
    };
  }
}

/**
 * TraceStateMachineMotif
 * FSM inferred from OpenTelemetry span sequences, representing recurring flows.
 */
export class TraceStateMachineMotif extends VirtualObjectBase {
  constructor({
    fsmTopology,
    domainCategory,
    errorRate,
    temporalDrift = [],
    spanSample = null,
    sourceRunId = null,
    tags = []
  }) {
    const fsmHash = hashJson(fsmTopology);
    super({ id: fsmHash, type: "TraceStateMachineMotif", sourceRunId, tags });

    this.motifId = this.id;
    this.fsmHash = fsmHash;
    this.fsmTopology = fsmTopology; // e.g. { states, transitions, startStates, endStates }
    this.domainCategory = domainCategory; // e.g. "login", "checkout", "benefits-flow"
    this.errorRate = typeof errorRate === "number" ? errorRate : 0;
    this.temporalDrift = temporalDrift; // array of { runId, fsmHash, timestamp }
    this.spanSample = spanSample;
  }

  static indexKeys(instance) {
    return {
      motif_id: instance.motifId,
      fsm_hash: instance.fsmHash,
      domain_category: instance.domainCategory
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      motifId: this.motifId,
      fsmHash: this.fsmHash,
      fsmTopology: this.fsmTopology,
      domainCategory: this.domainCategory,
      errorRate: this.errorRate,
      temporalDrift: this.temporalDrift,
      spanSample: this.spanSample
    };
  }
}

/**
 * VirtualObjectMotifFamily
 * Cluster of related DOM signatures, schemas, trace motifs into a semantic workflow.
 */
export class VirtualObjectMotifFamily extends VirtualObjectBase {
  constructor({
    familyId = null,
    motifType,
    memberIds = [],
    crossSystemSpread = 0,
    trustTierDistribution = { autoUse: 0, warn: 0, quarantine: 0 },
    description = "",
    sourceRunId = null,
    tags = []
  }) {
    const id = familyId || crypto.randomUUID();
    super({ id, type: "VirtualObjectMotifFamily", sourceRunId, tags });

    this.familyId = this.id;
    this.motifType = motifType; // e.g. "gov-benefits-application-flow"
    this.memberIds = memberIds; // array of virtual-object IDs (DOM, trace, schema)
    this.crossSystemSpread = crossSystemSpread; // normalized [0..1] or integer count normalized later
    this.trustTierDistribution = trustTierDistribution;
    this.description = description;
  }

  get memberCount() {
    return this.memberIds.length;
  }

  static indexKeys(instance) {
    return {
      family_id: instance.familyId,
      motif_type: instance.motifType,
      spread_score: instance.crossSystemSpread
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      familyId: this.familyId,
      motifType: this.motifType,
      memberIds: this.memberIds,
      memberCount: this.memberCount,
      crossSystemSpread: this.crossSystemSpread,
      trustTierDistribution: this.trustTierDistribution,
      description: this.description
    };
  }
}

/**
 * ExcavationEnergyProfile
 * Per-run energy and bandwidth accounting by mode and node type.
 */
export class ExcavationEnergyProfile extends VirtualObjectBase {
  constructor({
    runId,
    nodeId,
    nodeType,
    modeBreakdown,
    totalWattSeconds = null,
    totalBytes = null,
    hardwareClass = null,
    sourceRunId = null,
    tags = []
  }) {
    if (!runId || !nodeId || !nodeType) {
      throw new Error("ExcavationEnergyProfile requires runId, nodeId, nodeType.");
    }
    super({ id: runId, type: "ExcavationEnergyProfile", sourceRunId, tags });

    this.runId = runId;
    this.nodeId = nodeId;
    this.nodeType = nodeType; // e.g. "orin-nano", "phone", "laptop"
    this.hardwareClass = hardwareClass; // optional human label
    this.modeBreakdown = modeBreakdown || {
      dom: { wattSeconds: 0, bytes: 0 },
      trace: { wattSeconds: 0, bytes: 0 },
      har: { wattSeconds: 0, bytes: 0 }
    };

    const sumWs = Object.values(this.modeBreakdown).reduce(
      (acc, m) => acc + (m.wattSeconds || 0),
      0
    );
    const sumBytes = Object.values(this.modeBreakdown).reduce(
      (acc, m) => acc + (m.bytes || 0),
      0
    );

    this.totalWattSeconds = totalWattSeconds ?? sumWs;
    this.totalBytes = totalBytes ?? sumBytes;
  }

  static indexKeys(instance) {
    return {
      run_id: instance.runId,
      node_id: instance.nodeId,
      mode: Object.keys(instance.modeBreakdown).join(",")
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      runId: this.runId,
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      hardwareClass: this.hardwareClass,
      modeBreakdown: this.modeBreakdown,
      totalWattSeconds: this.totalWattSeconds,
      totalBytes: this.totalBytes
    };
  }
}

/**
 * ModeCanonicalizationMap
 * Maps raw inputs to canonical virtual-object structures.
 */
export class ModeCanonicalizationMap extends VirtualObjectBase {
  constructor({
    adapterName,
    adapterVersion,
    rawType,
    canonicalSchemaId,
    lossinessMetrics = {},
    notes = "",
    sourceRunId = null,
    tags = []
  }) {
    if (!adapterName || !adapterVersion || !rawType || !canonicalSchemaId) {
      throw new Error("ModeCanonicalizationMap requires adapterName, adapterVersion, rawType, canonicalSchemaId.");
    }
    const idPayload = { adapterName, adapterVersion, rawType, canonicalSchemaId };
    const id = hashJson(idPayload);
    super({ id, type: "ModeCanonicalizationMap", sourceRunId, tags });

    this.adapterName = adapterName;
    this.adapterVersion = adapterVersion;
    this.rawType = rawType; // "dom", "trace", "har"
    this.canonicalSchemaId = canonicalSchemaId;
    this.lossinessMetrics = lossinessMetrics; // e.g. { droppedFields: 3, structuralDriftScore: 0.12 }
    this.notes = notes;
  }

  static indexKeys(instance) {
    return {
      adapter_name: instance.adapterName,
      adapter_version: instance.adapterVersion,
      canonical_schema_id: instance.canonicalSchemaId
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      adapterName: this.adapterName,
      adapterVersion: this.adapterVersion,
      rawType: this.rawType,
      canonicalSchemaId: this.canonicalSchemaId,
      lossinessMetrics: this.lossinessMetrics,
      notes: this.notes
    };
  }
}

/**
 * SovereignNodeProfile
 * Slow-changing descriptor of a Javaspectre node.
 */
export class SovereignNodeProfile extends VirtualObjectBase {
  constructor({
    nodeId,
    deviceClass,
    perfTier,
    locality,
    supportedModes,
    osInfo = {},
    hwInfo = {},
    tags = []
  }) {
    if (!nodeId || !deviceClass || !perfTier) {
      throw new Error("SovereignNodeProfile requires nodeId, deviceClass, perfTier.");
    }
    super({ id: nodeId, type: "SovereignNodeProfile", sourceRunId: null, tags });

    this.nodeId = nodeId;
    this.deviceClass = deviceClass; // e.g. "jetson-orin-nano", "phone-android", "desktop-linux"
    this.perfTier = perfTier; // "low", "medium", "high"
    this.locality = locality || null; // e.g. "Phoenix-AZ-US"
    this.supportedModes = supportedModes || ["dom", "trace", "har"];
    this.osInfo = osInfo;
    this.hwInfo = hwInfo;
  }

  static indexKeys(instance) {
    return {
      node_id: instance.nodeId,
      device_class: instance.deviceClass,
      perf_tier: instance.perfTier
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      nodeId: this.nodeId,
      deviceClass: this.deviceClass,
      perfTier: this.perfTier,
      locality: this.locality,
      supportedModes: this.supportedModes,
      osInfo: this.osInfo,
      hwInfo: this.hwInfo
    };
  }
}

/**
 * SovereignExcavationProfile
 * Off-chain engine persona binding DID, addresses, safety profile, and consent.
 */
export class SovereignExcavationProfile extends VirtualObjectBase {
  constructor({
    sovereignProfileId = null,
    did,
    bostromAddr,
    alternateAddrs = [],
    role,
    allowedDomains = [],
    consentLevel,
    safetyBudgets,
    allowedLedgers,
    networkTrust,
    auditPointers = [],
    deviceClass,
    nodeId,
    tags = []
  }) {
    const id = sovereignProfileId || crypto.randomUUID();
    super({ id, type: "SovereignExcavationProfile", tags, sourceRunId: null });

    this.sovereignProfileId = this.id;
    this.did = did || null;
    this.bostromAddr = bostromAddr || null;
    this.alternateAddrs = alternateAddrs;
    this.role = role || "civic"; // e.g. "civic", "personal", "lab"
    this.allowedDomains = allowedDomains;
    this.consentLevel = consentLevel || "minimal";
    this.safetyBudgets = safetyBudgets || {
      nodeBudget: 20000,
      traceSpanBudget: 50000,
      deepPassBudget: 2000,
      maxRunSeconds: 15
    };
    this.allowedLedgers = allowedLedgers || ["bostrom", "evm", "did"];
    this.networkTrust = networkTrust || "unknown"; // "public-wifi", "home", "enterprise"
    this.auditPointers = auditPointers; // array of e.g. transparencyEnvelope runIds
    this.deviceClass = deviceClass || null;
    this.nodeId = nodeId || null;
  }

  static indexKeys(instance) {
    return {
      sovereign_profile_id: instance.sovereignProfileId,
      did: instance.did,
      bostrom_addr: instance.bostromAddr,
      role: instance.role,
      device_class: instance.deviceClass
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      sovereignProfileId: this.sovereignProfileId,
      did: this.did,
      bostromAddr: this.bostromAddr,
      alternateAddrs: this.alternateAddrs,
      role: this.role,
      allowedDomains: this.allowedDomains,
      consentLevel: this.consentLevel,
      safetyBudgets: this.safetyBudgets,
      allowedLedgers: this.allowedLedgers,
      networkTrust: this.networkTrust,
      auditPointers: this.auditPointers,
      deviceClass: this.deviceClass,
      nodeId: this.nodeId
    };
  }
}

/**
 * TransparencyAnchorManifest
 * Minimal manifest that gets anchored on ledgers.
 */
export class TransparencyAnchorManifest extends VirtualObjectBase {
  constructor({
    contentHash,
    runId,
    did,
    chains,
    txRefs = [],
    envelopeVersion,
    createdAt = null,
    tags = []
  }) {
    if (!contentHash || !runId) {
      throw new Error("TransparencyAnchorManifest requires contentHash and runId.");
    }
    const manifestKey = { contentHash, runId };
    const manifestId = hashJson(manifestKey).slice(0, 32);
    super({
      id: manifestId,
      type: "TransparencyAnchorManifest",
      createdAt,
      sourceRunId: runId,
      tags
    });

    this.manifestId = this.id;
    this.contentHash = contentHash;
    this.runId = runId;
    this.did = did || null;
    this.chains = chains || []; // e.g. [{ chainId: "bostrom-main", txHash: "0x...", kind: "home" }]
    this.txRefs = txRefs;
    this.envelopeVersion = envelopeVersion || "1.0.0";
  }

  addChainCommitment({ chainId, txHash, kind, timestamp }) {
    this.chains.push({
      chainId,
      txHash,
      kind: kind || "satellite",
      timestamp: timestamp || new Date().toISOString()
    });
  }

  static indexKeys(instance) {
    return {
      content_hash: instance.contentHash,
      did: instance.did,
      chain_id: instance.chains[0]?.chainId || null,
      tx_hash: instance.chains[0]?.txHash || null
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      manifestId: this.manifestId,
      contentHash: this.contentHash,
      runId: this.runId,
      did: this.did,
      chains: this.chains,
      txRefs: this.txRefs,
      envelopeVersion: this.envelopeVersion
    };
  }
}

/**
 * TrustTierCluster
 * Groups virtual objects by trust tier and shared properties.
 */
export class TrustTierCluster extends VirtualObjectBase {
  constructor({
    tier,
    domainCategory,
    memberIds = [],
    medianConfidence,
    medianDrift,
    notes = "",
    sourceRunId = null,
    tags = []
  }) {
    if (!tier) throw new Error("TrustTierCluster requires a tier.");
    const idPayload = { tier, domainCategory, memberIds };
    const id = hashJson(idPayload);
    super({ id, type: "TrustTierCluster", sourceRunId, tags });

    this.clusterId = this.id;
    this.tier = tier; // "auto-use", "warn", "quarantine"
    this.domainCategory = domainCategory || "unknown";
    this.memberIds = memberIds;
    this.medianConfidence = typeof medianConfidence === "number" ? medianConfidence : null;
    this.medianDrift = typeof medianDrift === "number" ? medianDrift : null;
    this.notes = notes;
  }

  static indexKeys(instance) {
    return {
      tier: instance.tier,
      domain_category: instance.domainCategory,
      cluster_id: instance.clusterId
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      clusterId: this.clusterId,
      tier: this.tier,
      domainCategory: this.domainCategory,
      memberIds: this.memberIds,
      medianConfidence: this.medianConfidence,
      medianDrift: this.medianDrift,
      notes: this.notes
    };
  }
}

/**
 * RedactionPatternProfile
 * Versioned sets of patterns used to redact PII / sensitive fields.
 */
export class RedactionPatternProfile extends VirtualObjectBase {
  constructor({
    profileName,
    region,
    patterns,
    version,
    tags = []
  }) {
    if (!profileName || !region || !version) {
      throw new Error("RedactionPatternProfile requires profileName, region, version.");
    }
    const idPayload = { profileName, region, version };
    const id = hashJson(idPayload);
    super({ id, type: "RedactionPatternProfile", sourceRunId: null, tags });

    this.profileName = profileName;
    this.region = region; // e.g. "US", "EU", "AZ-US"
    this.version = version; // e.g. "1.0.0"
    this.patterns = patterns || []; // array of { patternName, dataType, regexSource }
  }

  static indexKeys(instance) {
    return {
      profile_name: instance.profileName,
      region: instance.region,
      pattern_name: instance.patterns[0]?.patternName || null
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      profileName: this.profileName,
      region: this.region,
      version: this.version,
      patterns: this.patterns
    };
  }
}

/**
 * EdgeZoneCognitiveOverlay
 * Represents current XR/neuromorphic overlay state for a physical zone.
 */
export class EdgeZoneCognitiveOverlay extends VirtualObjectBase {
  constructor({
    zoneId,
    jetsonModel,
    activeMotifs = [],
    jetsonCapacityState,
    ambienceProfile,
    safetyEvents = [],
    sourceRunId = null,
    tags = []
  }) {
    if (!zoneId || !jetsonModel) {
      throw new Error("EdgeZoneCognitiveOverlay requires zoneId and jetsonModel.");
    }
    super({ id: zoneId, type: "EdgeZoneCognitiveOverlay", sourceRunId, tags });

    this.zoneId = zoneId;
    this.jetsonModel = jetsonModel;
    this.activeMotifs = activeMotifs; // array of motif family IDs or motif IDs
    this.jetsonCapacityState = jetsonCapacityState || {
      batterySoc: null,
      grantedStreams: null,
      maxStreams: null
    };
    this.ambienceProfile = ambienceProfile || {
      mode: "neutral",
      tempo: 100,
      density: 0.5
    };
    this.safetyEvents = safetyEvents; // e.g. frequent alerts, near-misses
  }

  static indexKeys(instance) {
    return {
      zone_id: instance.zoneId,
      jetson_model: instance.jetsonModel,
      ambience_mode: instance.ambienceProfile.mode
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      zoneId: this.zoneId,
      jetsonModel: this.jetsonModel,
      activeMotifs: this.activeMotifs,
      jetsonCapacityState: this.jetsonCapacityState,
      ambienceProfile: this.ambienceProfile,
      safetyEvents: this.safetyEvents
    };
  }
}

/**
 * SustainabilityImpactScenario
 * PlanetaryImpactSim-style scenario over proposed system using motifs.
 */
export class SustainabilityImpactScenario extends VirtualObjectBase {
  constructor({
    scenarioId = null,
    domain,
    estimatedUsers,
    co2Delta,
    roiScore,
    motifFamilyIds = [],
    description = "",
    priorityScore,
    region,
    sourceRunId = null,
    tags = []
  }) {
    const id = scenarioId || crypto.randomUUID();
    super({ id, type: "SustainabilityImpactScenario", sourceRunId, tags });

    this.scenarioId = this.id;
    this.domain = domain; // e.g. "smart-city-traffic", "gov-benefits-delivery"
    this.region = region || null;
    this.estimatedUsers = estimatedUsers || 0;
    this.co2Delta = co2Delta || 0; // negative = reduction
    this.roiScore = roiScore || 0; // 0..1
    this.motifFamilyIds = motifFamilyIds;
    this.description = description;
    this.priorityScore = typeof priorityScore === "number"
      ? priorityScore
      : this.computePriority();
  }

  computePriority() {
    const scaleUsers = Math.min(1, this.estimatedUsers / 1_000_000);
    const scaleCo2 = Math.min(1, Math.abs(this.co2Delta) / 1_000_000);
    return (scaleUsers * 0.4) + (scaleCo2 * 0.4) + (this.roiScore * 0.2);
  }

  static indexKeys(instance) {
    return {
      scenario_id: instance.scenarioId,
      domain: instance.domain,
      priority_score: instance.priorityScore
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      scenarioId: this.scenarioId,
      domain: this.domain,
      region: this.region,
      estimatedUsers: this.estimatedUsers,
      co2Delta: this.co2Delta,
      roiScore: this.roiScore,
      motifFamilyIds: this.motifFamilyIds,
      description: this.description,
      priorityScore: this.priorityScore
    };
  }
}

/**
 * MotifReuseLedgerEntry
 * Records each reuse of a virtual-object motif.
 */
export class MotifReuseLedgerEntry extends VirtualObjectBase {
  constructor({
    motifId,
    targetRepo,
    nodeId,
    reuseTime = null,
    trustTierAtReuse,
    reuseContext = {},
    tags = []
  }) {
    if (!motifId || !targetRepo || !nodeId) {
      throw new Error("MotifReuseLedgerEntry requires motifId, targetRepo, nodeId.");
    }
    const idPayload = { motifId, targetRepo, nodeId, reuseTime };
    const id = hashJson(idPayload);
    super({ id, type: "MotifReuseLedgerEntry", sourceRunId: null, tags });

    this.motifId = motifId;
    this.targetRepo = targetRepo;
    this.nodeId = nodeId;
    this.reuseTime = reuseTime || new Date().toISOString();
    this.trustTierAtReuse = trustTierAtReuse || "unknown";
    this.reuseContext = reuseContext; // e.g. { kind: "codegen", path: "src/x.js" }
  }

  static indexKeys(instance) {
    return {
      motif_id: instance.motifId,
      target_repo: instance.targetRepo,
      reuser_node_id: instance.nodeId
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      motifId: this.motifId,
      targetRepo: this.targetRepo,
      nodeId: this.nodeId,
      reuseTime: this.reuseTime,
      trustTierAtReuse: this.trustTierAtReuse,
      reuseContext: this.reuseContext
    };
  }
}

/**
 * IntegrityDeviationSnapshot
 * Snapshot of repo integrity issues.
 */
export class IntegrityDeviationSnapshot extends VirtualObjectBase {
  constructor({
    repoId,
    severity,
    issueType,
    issues = [],
    sourceRunId = null,
    tags = []
  }) {
    if (!repoId || !severity || !issueType) {
      throw new Error("IntegrityDeviationSnapshot requires repoId, severity, issueType.");
    }
    const idPayload = { repoId, severity, issueType, createdAt: new Date().toISOString() };
    const id = hashJson(idPayload);
    super({ id, type: "IntegrityDeviationSnapshot", sourceRunId, tags });

    this.repoId = repoId;
    this.severity = severity; // "low", "medium", "high", "critical"
    this.issueType = issueType; // "dead-code", "missing-tests", "no-export", "TODO"
    this.issues = issues; // e.g. [{ file, line, message }]
  }

  static indexKeys(instance) {
    return {
      repo_id: instance.repoId,
      severity: instance.severity,
      issue_type: instance.issueType
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      repoId: this.repoId,
      severity: this.severity,
      issueType: this.issueType,
      issues: this.issues
    };
  }
}

/**
 * CitizenFacingExplainerPacket
 * Distilled, human-readable explanation of an excavation run.
 */
export class CitizenFacingExplainerPacket extends VirtualObjectBase {
  constructor({
    runId,
    audience,
    riskSummary,
    actionsSuggested = [],
    keyMotifs = [],
    createdForDid = null,
    locale = "en-US",
    tags = []
  }) {
    if (!runId || !audience) {
      throw new Error("CitizenFacingExplainerPacket requires runId and audience.");
    }
    const idPayload = { runId, audience, createdForDid };
    const id = hashJson(idPayload);
    super({ id, type: "CitizenFacingExplainerPacket", sourceRunId: runId, tags });

    this.runId = runId;
    this.audience = audience; // "citizen-basic", "developer", "regulator"
    this.riskSummary = riskSummary || "";
    this.actionsSuggested = actionsSuggested; // array of { label, kind, href? }
    this.keyMotifs = keyMotifs; // motif or family IDs to explain
    this.createdForDid = createdForDid;
    this.locale = locale;
  }

  static indexKeys(instance) {
    return {
      run_id: instance.runId,
      audience: instance.audience,
      risk_level: this._inferRiskLevel(instance.riskSummary)
    };
  }

  static _inferRiskLevel(summary) {
    if (!summary) return "unknown";
    const text = summary.toLowerCase();
    if (text.includes("critical")) return "critical";
    if (text.includes("high")) return "high";
    if (text.includes("medium")) return "medium";
    if (text.includes("low")) return "low";
    return "unknown";
  }

  toJSON() {
    return {
      ...super.toJSON(),
      runId: this.runId,
      audience: this.audience,
      riskSummary: this.riskSummary,
      actionsSuggested: this.actionsSuggested,
      keyMotifs: this.keyMotifs,
      createdForDid: this.createdForDid,
      locale: this.locale
    };
  }
}
