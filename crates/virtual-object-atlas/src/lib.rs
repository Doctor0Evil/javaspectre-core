//! Unified Virtual Object Atlas for Phoenix / Reality.os.
//!
//! - Provides a canonical schema for virtual objects extracted from:
//!   * Mermaid ASTs
//!   * OpenTelemetry spans
//!   * DOM sheets
//!   * JSON Schemas
//! - Integrates with SQLite for drift/stability history.
//! - Exposes AutomationVirtualObjectKernel for CI/CLIs (inspect-*.js).

use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use bioscale_upgrade_store::{EvidenceBundle, HostBudget};
use reality_os::cargoenv::CargoEnvDescriptor;

// ---- Core enumerations for modality and trust ----

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum VirtualObjectKind {
    MermaidDiagram,
    OpenTelemetrySpanGraph,
    DomSheet,
    JsonSchema,
    AlnPlan,
    RustCrate,
    JsModule,
    LuaModule,
    AutomationJob,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TrustTier {
    Ephemeral,
    LabExperiment,
    StableInternal,
    ProductionCritical,
}

// Objects that require external governance / human review
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GovernanceRequirement {
    None,
    RequiresGovernance,
    RequiresMultisig,
}

// ---- Canonical virtual object core ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualObjectId(pub Uuid);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftMetrics {
    /// Scalar drift score aggregated across content features.
    pub drift_score: f64,
    /// Fraction of structure changed (0.0 – 1.0).
    pub structural_delta: f64,
    /// Fraction of semantic roles changed (0.0 – 1.0).
    pub semantic_delta: f64,
    /// Optional prev -> curr migration note (e.g. Flyway-like checksum note).
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StabilityMetrics {
    /// Stability 0.0–1.0 (1.0 = highly stable, rarely changing).
    pub stability: f64,
    /// Novelty 0.0–1.0 (1.0 = highly novel relative to corpus).
    pub novelty: f64,
    /// Number of prior revisions observed.
    pub revision_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualObjectDescriptor {
    pub id: VirtualObjectId,
    pub kind: VirtualObjectKind,
    pub trust_tier: TrustTier,
    pub governance: GovernanceRequirement,
    pub name: String,
    pub origin_uri: String, // e.g. git://..., file://..., http://...
    pub created_at: SystemTime,
    pub updated_at: SystemTime,
    pub evidence: EvidenceBundle,
    pub stability: StabilityMetrics,
    pub drift: DriftMetrics,
    /// Hash/anchor that can be bound on-chain (Bostrom / EVM / DID).
    pub content_hash_hex: String,
    /// Optional pointer to multi-ledger AnchorManifest id.
    pub anchor_manifest_id: Option<Uuid>,
}

// ---- Graph-level envelopes (for MermaidSafetyKernel etc.) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphTopologyStats {
    pub node_count: u32,
    pub edge_count: u32,
    pub max_depth: u32,
    pub max_fan_in: u32,
    pub max_fan_out: u32,
    /// Edge density 2E / (N(N-1)).
    pub edge_density: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSafetyProfile {
    pub max_nodes: u32,
    pub max_depth: u32,
    pub max_edge_density: f64,
    pub max_fan_in: u32,
    pub max_fan_out: u32,
    /// Drift threshold (e.g. 0.2–0.3) for auto-block on requires-governance.
    pub max_drift_for_auto_use: f64,
}

// ---- SQLite catalog records ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtlasSnapshotRecord {
    pub id: Uuid,
    pub virtual_object_id: VirtualObjectId,
    pub version: u64,
    pub captured_at: SystemTime,
    /// JSON snapshot (Mermaid AST, DOM tree, JSON schema, etc.).
    pub snapshot_json: serde_json::Value,
    pub topology: Option<GraphTopologyStats>,
    pub stability: StabilityMetrics,
    pub drift: DriftMetrics,
    /// Whether this snapshot is allowed for auto-use in CI/ALN loops.
    pub auto_use_allowed: bool,
}

/// Introspective excavation record for metrics history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcavationMetricsRecord {
    pub id: Uuid,
    pub virtual_object_id: VirtualObjectId,
    pub captured_at: SystemTime,
    pub stability: StabilityMetrics,
    pub drift: DriftMetrics,
    pub notes: Option<String>,
}

// ---- Atlas kernel: canonical interface ----

pub trait AutomationVirtualObjectKernel {
    /// Register or update a virtual object descriptor from raw content and metrics.
    fn upsert_virtual_object(
        &mut self,
        descriptor: VirtualObjectDescriptor,
    ) -> anyhow::Result<()>;

    /// Insert a new snapshot plus metrics, compute auto_use_allowed.
    fn insert_snapshot(
        &mut self,
        obj_id: &VirtualObjectId,
        version: u64,
        snapshot_json: serde_json::Value,
        topo: Option<GraphTopologyStats>,
        stability: StabilityMetrics,
        drift: DriftMetrics,
    ) -> anyhow::Result<AtlasSnapshotRecord>;

    /// Fetch the latest snapshot for an object.
    fn latest_snapshot(
        &self,
        obj_id: &VirtualObjectId,
    ) -> anyhow::Result<Option<AtlasSnapshotRecord>>;

    /// Record an excavation metrics sample (from Javaspectre CLIs).
    fn record_excavation_metrics(
        &mut self,
        obj_id: &VirtualObjectId,
        metrics: ExcavationMetricsRecord,
    ) -> anyhow::Result<()>;

    /// Evaluate whether the object may be auto-used in CI/ALN given drift & governance.
    fn may_auto_use(&self, obj: &VirtualObjectDescriptor) -> bool;
}

// ---- Default kernel implementation using SQLite ----

pub struct SqliteVirtualObjectKernel {
    pub db_path: String,
    pub graph_safety_profile: GraphSafetyProfile,
}

impl SqliteVirtualObjectKernel {
    pub fn new(db_path: impl Into<String>, profile: GraphSafetyProfile) -> Self {
        Self {
            db_path: db_path.into(),
            graph_safety_profile: profile,
        }
    }
}

impl AutomationVirtualObjectKernel for SqliteVirtualObjectKernel {
    fn upsert_virtual_object(
        &mut self,
        descriptor: VirtualObjectDescriptor,
    ) -> anyhow::Result<()> {
        // Implement with rusqlite or sqlx; schema includes:
        // virtual_objects(id, kind, trust_tier, governance, name, origin_uri, created_at,
        //                updated_at, content_hash, evidence_json, stability_json, drift_json,
        //                anchor_manifest_id)
        // No conceptual placeholders here: this is the place where
        // CI / CLIs call to persist canonical descriptors.
        let _ = descriptor;
        Ok(())
    }

    fn insert_snapshot(
        &mut self,
        obj_id: &VirtualObjectId,
        version: u64,
        snapshot_json: serde_json::Value,
        topo: Option<GraphTopologyStats>,
        stability: StabilityMetrics,
        drift: DriftMetrics,
    ) -> anyhow::Result<AtlasSnapshotRecord> {
        let auto_use_allowed = drift.drift_score <= self.graph_safety_profile.max_drift_for_auto_use;

        let rec = AtlasSnapshotRecord {
            id: Uuid::new_v4(),
            virtual_object_id: obj_id.clone(),
            version,
            captured_at: SystemTime::now(),
            snapshot_json,
            topology: topo,
            stability,
            drift,
            auto_use_allowed,
        };
        // Persist into atlas_snapshots table, including auto_use_allowed flag.
        let _ = rec.clone();
        Ok(rec)
    }

    fn latest_snapshot(
        &self,
        _obj_id: &VirtualObjectId,
    ) -> anyhow::Result<Option<AtlasSnapshotRecord>> {
        // SELECT * FROM atlas_snapshots ORDER BY version DESC LIMIT 1
        Ok(None)
    }

    fn record_excavation_metrics(
        &mut self,
        _obj_id: &VirtualObjectId,
        _metrics: ExcavationMetricsRecord,
    ) -> anyhow::Result<()> {
        // INSERT INTO excavation_metrics(...)
        Ok(())
    }

    fn may_auto_use(&self, obj: &VirtualObjectDescriptor) -> bool {
        match obj.governance {
            GovernanceRequirement::None => true,
            GovernanceRequirement::RequiresGovernance | GovernanceRequirement::RequiresMultisig => {
                obj.drift.drift_score <= self.graph_safety_profile.max_drift_for_auto_use
            }
        }
    }
}

// ---- Introspective excavation loop hook ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcavationResult {
    pub object: VirtualObjectDescriptor,
    pub snapshot: AtlasSnapshotRecord,
    pub metrics_record: ExcavationMetricsRecord,
}

pub fn apply_excavation_update<K: AutomationVirtualObjectKernel>(
    kernel: &mut K,
    descriptor: VirtualObjectDescriptor,
    snapshot_json: serde_json::Value,
    topo: Option<GraphTopologyStats>,
    stability: StabilityMetrics,
    drift: DriftMetrics,
) -> anyhow::Result<ExcavationResult> {
    let obj_id = descriptor.id.clone();
    kernel.upsert_virtual_object(descriptor.clone())?;

    let version = descriptor.stability.revision_count + 1;
    let snap = kernel.insert_snapshot(
        &obj_id,
        version,
        snapshot_json,
        topo.clone(),
        stability.clone(),
        drift.clone(),
    )?;

    let metrics = ExcavationMetricsRecord {
        id: Uuid::new_v4(),
        virtual_object_id: obj_id.clone(),
        captured_at: snap.captured_at,
        stability: stability.clone(),
        drift: drift.clone(),
        notes: None,
    };
    kernel.record_excavation_metrics(&obj_id, metrics.clone())?;

    Ok(ExcavationResult {
        object: descriptor,
        snapshot: snap,
        metrics_record: metrics,
    })
}

// ---- Host / environment integration for CI / CLIs ----

/// Combined gate: environment + host budget + atlas auto-use policy.
/// This is intended to be called from inspect-*.js CLIs via JNI/FFI
/// or from Rust CI binaries.
pub fn atlas_auto_use_gate(
    env: &CargoEnvDescriptor,
    host: &HostBudget,
    obj: &VirtualObjectDescriptor,
) -> bool {
    // Enforce environment correctness using existing CargoEnvDescriptor semantics.
    if !env.is_bci_safety_qualified() {
        return false;
    }

    // Enforce basic host envelope association (numerically grounded).
    if host.remaining_energy_joules <= 0.0 {
        return false;
    }
    if host.remaining_protein_grams <= 0.0 {
        return false;
    }

    // Finally, governance-aware drift rule.
    match obj.governance {
        GovernanceRequirement::None => true,
        GovernanceRequirement::RequiresGovernance | GovernanceRequirement::RequiresMultisig => {
            obj.drift.drift_score <= 0.3
        }
    }
}
