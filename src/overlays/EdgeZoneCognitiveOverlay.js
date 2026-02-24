// Canonical neuromorphic/XR overlay spec with DID + transparency anchors.
// Designed to be FFI-safe for Rust edge runtimes and indexable from SQLite.

/**
 * EdgeZoneCognitiveOverlay
 * - Represents a neuromorphic/XR overlay bound to a spatial anchor and DID.
 * - Cross-language index keys: runId, motifId, nodeId, did, contentHash.
 * - XR anchoring: spatialAnchorId, spaceId, referenceFrame, domStabilitySignature.
 * - Neuromorphic activation: motifType, motifSignature, activationThreshold, decayMs.
 * - Policy + scheduling: cpuBudgetMs, gpuBudgetMs, sensorAccessWindowMs, meshPersistenceMs.
 */

export class EdgeZoneCognitiveOverlay {
  constructor(config) {
    // Core identity (must be stable across JS/Rust/SQLite)
    this.runId = String(config.runId);                 // e.g., ULID/UUID
    this.motifId = String(config.motifId);             // logical overlay motif id
    this.nodeId = String(config.nodeId);               // edge node identity
    this.overlayId = String(config.overlayId || `${config.runId}:${config.motifId}`);
    this.did = config.did ? String(config.did) : null; // DID of agent/citizen
    this.contentHash = String(config.contentHash);     // hash of TransparencyEnvelope or overlay payload

    // XR spatial anchoring
    this.spatialAnchorId = String(config.spatialAnchorId); // XR platform anchor id
    this.spaceId = String(config.spaceId || "default-space");
    this.referenceFrame = String(config.referenceFrame || "world-locked");
    this.domStabilitySignature = String(config.domStabilitySignature || ""); // DOMSheet-derived signature

    // Neuromorphic / motif activation
    this.motifType = String(config.motifType || "snn-motif");    // e.g., "snn-motif", "temporal-cue"
    this.motifSignature = String(config.motifSignature || "");   // hashed / compressed motif descriptor
    this.activationThreshold = Number(
      typeof config.activationThreshold === "number" ? config.activationThreshold : 0.7
    ); // 0..1
    this.deactivationThreshold = Number(
      typeof config.deactivationThreshold === "number" ? config.deactivationThreshold : 0.3
    ); // hysteresis
    this.decayMs = Number(
      typeof config.decayMs === "number" ? config.decayMs : 250
    ); // motif firing decay window

    // Scheduling + resource budgets (Rust edge runtime enforces)
    this.cpuBudgetMs = Number(config.cpuBudgetMs || 4);          // per-activation CPU budget
    this.gpuBudgetMs = Number(config.gpuBudgetMs || 8);          // per-activation GPU budget
    this.sensorAccessWindowMs = Number(config.sensorAccessWindowMs || 50);
    this.meshPersistenceMs = Number(config.meshPersistenceMs || 5000);
    this.maxConcurrentInstances = Number(config.maxConcurrentInstances || 3);

    // Transparency + provenance
    this.transparencyRunId = String(config.transparencyRunId || this.runId);
    this.transparencyAnchorRef = String(config.transparencyAnchorRef || "");
    this.transparencyLedger = String(config.transparencyLedger || "bostrom");
    this.auditFlags = Array.isArray(config.auditFlags) ? config.auditFlags.slice() : [];

    // Overlay payload hints (XR + UI)
    this.overlayKind = String(config.overlayKind || "hud");       // "hud", "annotation", "field-of-view"
    this.overlayPriority = Number(config.overlayPriority || 0.5); // 0..1
    this.payloadUri = String(config.payloadUri || "");            // URL/URN to overlay assets
    this.payloadContentType = String(config.payloadContentType || "application/json");

    // Optional policy tags (edge runtime / ALN policies)
    this.tags = Array.isArray(config.tags) ? config.tags.slice() : [];
    this.createdAt = config.createdAt || new Date().toISOString();
  }

  /**
   * Minimal composite key for SQLite + cross-runtime lookup.
   * This maps directly to a composite primary key (run_id, motif_id).
   */
  compositeKey() {
    return {
      run_id: this.runId,
      motif_id: this.motifId
    };
  }

  /**
   * FFI-safe, Rust-friendly metadata descriptor.
   * Avoids JS-specific types and nested structures that are hard to map.
   */
  toFfiDescriptor() {
    return {
      // Primary keys
      run_id: this.runId,
      motif_id: this.motifId,
      node_id: this.nodeId,
      overlay_id: this.overlayId,

      // Identity / anchors
      did: this.did,
      content_hash: this.contentHash,
      transparency_run_id: this.transparencyRunId,
      transparency_anchor_ref: this.transparencyAnchorRef,
      transparency_ledger: this.transparencyLedger,

      // XR spatial anchoring
      spatial_anchor_id: this.spatialAnchorId,
      space_id: this.spaceId,
      reference_frame: this.referenceFrame,
      dom_stability_signature: this.domStabilitySignature,

      // Neuromorphic activation
      motif_type: this.motifType,
      motif_signature: this.motifSignature,
      activation_threshold: this.activationThreshold,
      deactivation_threshold: this.deactivationThreshold,
      decay_ms: this.decayMs,

      // Scheduling budgets
      cpu_budget_ms: this.cpuBudgetMs,
      gpu_budget_ms: this.gpuBudgetMs,
      sensor_access_window_ms: this.sensorAccessWindowMs,
      mesh_persistence_ms: this.meshPersistenceMs,
      max_concurrent_instances: this.maxConcurrentInstances,

      // Overlay payload hints
      overlay_kind: this.overlayKind,
      overlay_priority: this.overlayPriority,
      payload_uri: this.payloadUri,
      payload_content_type: this.payloadContentType,

      // Tags / flags
      tags: this.tags,
      audit_flags: this.auditFlags,
      created_at: this.createdAt
    };
  }

  /**
   * JSON representation suitable for SQLite JSON column and JS catalog reflection.
   */
  toJSON() {
    return this.toFfiDescriptor();
  }

  /**
   * Factory helper from a plain object (e.g., parsed SQLite JSON).
   */
  static fromJSON(json) {
    return new EdgeZoneCognitiveOverlay({
      runId: json.run_id,
      motifId: json.motif_id,
      nodeId: json.node_id,
      overlayId: json.overlay_id,
      did: json.did,
      contentHash: json.content_hash,
      transparencyRunId: json.transparency_run_id,
      transparencyAnchorRef: json.transparency_anchor_ref,
      transparencyLedger: json.transparency_ledger,
      spatialAnchorId: json.spatial_anchor_id,
      spaceId: json.space_id,
      referenceFrame: json.reference_frame,
      domStabilitySignature: json.dom_stability_signature,
      motifType: json.motif_type,
      motifSignature: json.motif_signature,
      activationThreshold: json.activation_threshold,
      deactivationThreshold: json.deactivation_threshold,
      decayMs: json.decay_ms,
      cpuBudgetMs: json.cpu_budget_ms,
      gpuBudgetMs: json.gpu_budget_ms,
      sensorAccessWindowMs: json.sensor_access_window_ms,
      meshPersistenceMs: json.mesh_persistence_ms,
      maxConcurrentInstances: json.max_concurrent_instances,
      overlayKind: json.overlay_kind,
      overlayPriority: json.overlay_priority,
      payloadUri: json.payload_uri,
      payloadContentType: json.payload_content_type,
      tags: json.tags || [],
      auditFlags: json.audit_flags || [],
      createdAt: json.created_at
    });
  }
}

export default EdgeZoneCognitiveOverlay;
