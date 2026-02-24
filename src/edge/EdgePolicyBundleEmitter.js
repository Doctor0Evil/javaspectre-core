// Emits compact JSON bundles for Rust edge runtimes based on the catalog.

import Database from "better-sqlite3";

export class EdgePolicyBundleEmitter {
  constructor({ dbPath = "javaspectre-catalog.sqlite3" } = {}) {
    this.db = new Database(dbPath);
  }

  /**
   * Build a per-node policy bundle:
   * - latest ExcavationEnergyProfile
   * - current safety budgets (ExcavationSafetyProfile snapshot)
   * - hot TraceStateMachineMotif entries for live orchestration
   */
  buildNodeBundle(nodeId) {
    const energyRow = this.db
      .prepare(
        `SELECT payload_json
         FROM energy_profiles
         WHERE node_id = ?
         ORDER BY created_at_iso DESC
         LIMIT 1`
      )
      .get(nodeId);

    const safetyRow = this.db
      .prepare(
        `SELECT nodebudget, tracespanbudget, deeppassbudget, maxrunseconds
         FROM safety_budgets
         WHERE node_id = ?
         ORDER BY updated_at_iso DESC
         LIMIT 1`
      )
      .get(nodeId);

    const motifs = this.db
      .prepare(
        `SELECT payload_json
         FROM trace_state_machine_motifs
         WHERE node_id = ?
           AND error_rate >= 0.05
         ORDER BY error_rate DESC
         LIMIT 64`
      )
      .all(nodeId)
      .map((r) => JSON.parse(r.payload_json));

    const energyProfile = energyRow ? JSON.parse(energyRow.payload_json) : null;
    const safetyBudgets = safetyRow
      ? {
          nodeBudget: safetyRow.nodebudget,
          traceSpanBudget: safetyRow.tracespanbudget,
          deepPassBudget: safetyRow.deeppassbudget,
          maxRunSeconds: safetyRow.maxrunseconds
        }
      : null;

    return {
      nodeId,
      generatedAtIso: new Date().toISOString(),
      energyProfile,
      safetyBudgets,
      traceMotifs: motifs
    };
  }

  close() {
    this.db.close();
  }
}

export default EdgePolicyBundleEmitter;
