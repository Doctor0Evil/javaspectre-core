// High-level query helpers over SQLite for motif-centric and sovereignty-centric questions.

import Database from "better-sqlite3";
import { buildLinkageWhere } from "./VirtualObjectLinkage.js";

export class FederatedAtlasQueries {
  constructor({ dbPath = "javaspectre-catalog.sqlite3" } = {}) {
    this.db = new Database(dbPath);
  }

  /**
   * "What did we find in this run?"
   * Returns all motif families, DOM signatures, and FSM motifs for a run.
   */
  listRunArtifacts(runId) {
    const families = this.db
      .prepare("SELECT payload_json FROM motif_families WHERE run_id = ?")
      .all(runId)
      .map((r) => JSON.parse(r.payload_json));

    const dom = this.db
      .prepare("SELECT payload_json FROM dom_stability_signatures WHERE run_id = ?")
      .all(runId)
      .map((r) => JSON.parse(r.payload_json));

    const fsm = this.db
      .prepare("SELECT payload_json FROM trace_state_machine_motifs WHERE run_id = ?")
      .all(runId)
      .map((r) => JSON.parse(r.payload_json));

    return { families, dom, fsm };
  }

  /**
   * "Where else has this motif appeared?"
   * Uses fsm_hash or dom_signature_hash to find reuse across runs/nodes.
   */
  findMotifOccurrences({ fsmHash, domSignatureHash }) {
    if (!fsmHash && !domSignatureHash) {
      throw new Error("findMotifOccurrences requires fsmHash or domSignatureHash.");
    }

    if (fsmHash) {
      const rows = this.db
        .prepare(
          "SELECT run_id, node_id, did, payload_json FROM trace_state_machine_motifs WHERE fsm_hash = ?"
        )
        .all(fsmHash);
      return rows.map((r) => ({
        runId: r.run_id,
        nodeId: r.node_id,
        did: r.did,
        motif: JSON.parse(r.payload_json)
      }));
    }

    const rows = this.db
      .prepare(
        "SELECT run_id, node_id, did, payload_json FROM dom_stability_signatures WHERE dom_signature_hash = ?"
      )
      .all(domSignatureHash);
    return rows.map((r) => ({
      runId: r.run_id,
      nodeId: r.node_id,
      did: r.did,
      signature: JSON.parse(r.payload_json)
    }));
  }

  /**
   * "Stable login motifs with low drift in civic domains."
   */
  listStableCivicLoginFamilies({ minStabilityBand = "stable" } = {}) {
    const tiers = ["medium", "stable", "very-stable"];
    const allowedBands = tiers.slice(tiers.indexOf(minStabilityBand));
    const placeholders = allowedBands.map(() => "?").join(",");

    const sql = `
      SELECT mf.payload_json
      FROM motif_families mf
      JOIN trust_tier_clusters tc
        ON mf.family_id = json_extract(tc.payload_json, '$.familyId')
      WHERE mf.motif_type LIKE '%login%'
        AND tc.tier = 'auto-use'
        AND tc.domain_category = 'civic'
        AND json_extract(mf.payload_json, '$.stabilityBand') IN (${placeholders})
    `;

    const rows = this.db.prepare(sql).all(...allowedBands);
    return rows.map((r) => JSON.parse(r.payload_json));
  }

  /**
   * "Find quarantined motifs from low-battery devices operated by this DID last week."
   * Assumes SovereignNodeProfile/Edge overlays have stored a perf_tier/locality and battery stats.
   */
  listRiskyMotifsForDidInWindow({ did, sinceIso, untilIso }) {
    const sql = `
      SELECT tc.payload_json AS cluster_json,
             r.run_id,
             r.node_id
      FROM trust_tier_clusters tc
      JOIN runs r ON r.run_id = tc.run_id
      JOIN nodes n ON n.node_id = r.node_id
      WHERE tc.tier = 'quarantine'
        AND r.did = ?
        AND r.created_at_iso BETWEEN ? AND ?
        AND n.perf_tier = 'low'
    `;

    const rows = this.db.prepare(sql).all(did, sinceIso, untilIso);
    return rows.map((r) => ({
      runId: r.run_id,
      nodeId: r.node_id,
      cluster: JSON.parse(r.cluster_json)
    }));
  }

  /**
   * Federation hook: export high-confidence auto-use motif families for sharing.
   * This is the surface you’d feed into FGL / differential-privacy aggregation.
   */
  exportFederatedMotifSnapshot({ minSpread = 0.5 }) {
    const sql = `
      SELECT mf.family_id,
             mf.motif_type,
             mf.spread_score,
             tc.domain_category,
             tc.tier,
             mf.payload_json
      FROM motif_families mf
      JOIN trust_tier_clusters tc
        ON mf.family_id = json_extract(tc.payload_json, '$.familyId')
      WHERE tc.tier = 'auto-use'
        AND mf.spread_score >= ?
    `;
    const rows = this.db.prepare(sql).all(minSpread);

    return rows.map((r) => ({
      familyId: r.family_id,
      motifType: r.motif_type,
      spreadScore: r.spread_score,
      domainCategory: r.domain_category,
      tier: r.tier,
      // Payload can be post-processed (e.g., DP) before shipping off-node.
      motifFamily: JSON.parse(r.payload_json)
    }));
  }

  close() {
    this.db.close();
  }
}

export default FederatedAtlasQueries;
