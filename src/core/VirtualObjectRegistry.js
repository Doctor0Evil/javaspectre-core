// Central registry for Javaspectre virtual object types and SQLite mappings.
// All models include run_id, node_id, did, content_hash for coordination,
// federation, and auditability.

export class VirtualObjectRegistry {
  constructor() {
    /** @type {Record<string, VirtualObjectType>} */
    this.types = Object.create(null);
    this._initDefaults();
  }

  /**
   * Register a new virtual object type.
   * @param {VirtualObjectType} def
   */
  registerType(def) {
    if (!def || typeof def.name !== "string") {
      throw new Error("VirtualObjectRegistry.registerType requires a name");
    }
    if (this.types[def.name]) {
      throw new Error(`VirtualObject type already registered: ${def.name}`);
    }
    this.types[def.name] = Object.freeze({ ...def });
  }

  /**
   * Get a type definition by name.
   * @param {string} name
   * @returns {VirtualObjectType | undefined}
   */
  getType(name) {
    return this.types[name];
  }

  /**
   * List all registered type definitions.
   * @returns {VirtualObjectType[]}
   */
  listTypes() {
    return Object.values(this.types);
  }

  /**
   * Return the SQLite table definition metadata for all types.
   * This can be used by migration generators.
   */
  listSqliteMappings() {
    return this.listTypes().map((t) => ({
      name: t.name,
      table: t.sqlite.table,
      primaryKey: t.sqlite.primaryKey,
      indexes: t.sqlite.indexes,
      columns: t.sqlite.columns,
    }));
  }

  _initDefaults() {
    // Common linkage fields all types must expose.
    const linkageFields = {
      run_id: { type: "TEXT", required: true },
      node_id: { type: "TEXT", required: true },
      did: { type: "TEXT", required: true },
      content_hash: { type: "TEXT", required: true },
    };

    // 1. DOMStabilitySignature
    this.registerType({
      name: "DOMStabilitySignature",
      description:
        "Stabilized DOM motif with drift and NanoVolume metrics over a replay window.",
      category: "motif",
      sqlite: {
        table: "dom_stability_signatures",
        primaryKey: ["run_id", "motif_id"],
        indexes: [
          ["run_id"],
          ["selector"],
          ["stability_score"],
          ["drift_score"],
        ],
        columns: {
          ...linkageFields,
          motif_id: { type: "TEXT", required: true },
          selector: { type: "TEXT", required: true },
          role_hint: { type: "TEXT", required: false },
          stability_score: { type: "REAL", required: true },
          drift_score: { type: "REAL", required: true },
          nano_volume: { type: "REAL", required: false },
          snapshots_seen: { type: "INTEGER", required: false },
          attributes_signature: { type: "JSON", required: false },
        },
      },
    });

    // 2. TraceStateMachineMotif
    this.registerType({
      name: "TraceStateMachineMotif",
      description:
        "Hidden state machine inferred from OpenTelemetry span graphs for a service or endpoint.",
      category: "motif",
      sqlite: {
        table: "trace_state_machine_motifs",
        primaryKey: ["run_id", "motif_id"],
        indexes: [
          ["run_id"],
          ["service"],
          ["stability_score"],
          ["drift_score"],
        ],
        columns: {
          ...linkageFields,
          motif_id: { type: "TEXT", required: true },
          service: { type: "TEXT", required: true },
          fsm_states: { type: "JSON", required: true },
          fsm_transitions: { type: "JSON", required: true },
          loop_signatures: { type: "JSON", required: false },
          stability_score: { type: "REAL", required: true },
          drift_score: { type: "REAL", required: true },
          span_count: { type: "INTEGER", required: true },
        },
      },
    });

    // 3. VirtualObjectMotifFamily
    this.registerType({
      name: "VirtualObjectMotifFamily",
      description:
        "Cluster of related motifs (DOM, JSON, trace) forming a reusable virtual-object family.",
      category: "motif-family",
      sqlite: {
        table: "virtual_object_motif_families",
        primaryKey: ["run_id", "family_id"],
        indexes: [
          ["run_id"],
          ["dominant_kind"],
          ["stability_median"],
          ["drift_median"],
        ],
        columns: {
          ...linkageFields,
          family_id: { type: "TEXT", required: true },
          dominant_kind: { type: "TEXT", required: true },
          member_motifs: { type: "JSON", required: true },
          stability_median: { type: "REAL", required: true },
          drift_median: { type: "REAL", required: true },
          novelty_score: { type: "REAL", required: false },
          endpoints_hint: { type: "JSON", required: false },
        },
      },
    });

    // 4. SovereignExcavationProfile
    this.registerType({
      name: "SovereignExcavationProfile",
      description:
        "Per-DID excavation policy snapshot (budgets, scopes, consent, anchoring).",
      category: "sovereignty",
      sqlite: {
        table: "sovereign_excavation_profiles",
        primaryKey: ["did", "profile_id"],
        indexes: [
          ["did"],
          ["node_id"],
          ["run_id"],
        ],
        columns: {
          ...linkageFields,
          profile_id: { type: "TEXT", required: true },
          run_id: { type: "TEXT", required: false },
          safety_profile_snapshot: { type: "JSON", required: true },
          scopes: { type: "JSON", required: true },
          consent_level: { type: "TEXT", required: true },
          anchoring_policy: { type: "JSON", required: true },
          kyc_level: { type: "TEXT", required: false },
          compliance_tags: { type: "JSON", required: false },
        },
      },
    });

    // 5. TransparencyAnchorManifest
    this.registerType({
      name: "TransparencyAnchorManifest",
      description:
        "Multi-ledger anchor manifest for a TransparencyEnvelope (Bostrom home chain plus mirrors).",
      category: "sovereignty",
      sqlite: {
        table: "transparency_anchor_manifests",
        primaryKey: ["run_id", "manifest_id"],
        indexes: [
          ["run_id"],
          ["envelope_hash"],
        ],
        columns: {
          ...linkageFields,
          manifest_id: { type: "TEXT", required: true },
          envelope_hash: { type: "TEXT", required: true },
          anchors: { type: "JSON", required: true },
          governance_profile: { type: "JSON", required: false },
        },
      },
    });

    // 6. EdgeZoneCognitiveOverlay
    this.registerType({
      name: "EdgeZoneCognitiveOverlay",
      description:
        "XR/neuromorphic overlay definition per node/zone, tied to motif families and energy/safety constraints.",
      category: "overlay",
      sqlite: {
        table: "edge_zone_cognitive_overlays",
        primaryKey: ["run_id", "overlay_id"],
        indexes: [
          ["run_id"],
          ["node_id"],
          ["zone_label"],
        ],
        columns: {
          ...linkageFields,
          overlay_id: { type: "TEXT", required: true },
          zone_label: { type: "TEXT", required: true },
          motif_families: { type: "JSON", required: true },
          energy_budget_hint: { type: "JSON", required: false },
          safety_mode: { type: "TEXT", required: true },
          allowed_interactions: { type: "JSON", required: true },
          xr_projection_specs: { type: "JSON", required: false },
        },
      },
    });
  }
}

/**
 * @typedef {Object} VirtualObjectType
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {{ table: string, primaryKey: string[], indexes: string[][], columns: Record<string,{type:string,required:boolean}> }} sqlite
 */

const defaultRegistry = new VirtualObjectRegistry();

export function getVirtualObjectRegistry() {
  return defaultRegistry;
}

export default defaultRegistry;
