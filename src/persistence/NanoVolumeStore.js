// Inserts NanoVolume metrics into the SQLite catalog.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export class NanoVolumeStore {
  constructor(options = {}) {
    const dbPath =
      options.databasePath ||
      path.join(process.cwd(), "javaspectre-catalog.sqlite3);

    const exists = fs.existsSync(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    if (!exists && options.ensureSchema) {
      const schemaPath =
        options.schemaPath ||
        path.join(process.cwd(), "db", "schema.sql");
      const sql = fs.readFileSync(schemaPath, "utf8");
      this.db.exec(sql);
    }

    this.prepareStatements();
  }

  prepareStatements() {
    this.insertStmt = this.db.prepare(
      `
      INSERT INTO nanovolumes (
        run_id,
        session_id,
        mode,
        intent,
        nano_volume,
        nano_events,
        nano_bytes,
        nano_energy,
        nano_cost,
        avg_stability,
        avg_drift,
        high_drift_objects,
        auto_use_objects,
        quarantined_objects,
        created_at_iso,
        runtime_seconds,
        metrics_json,
        transparency_run_id,
        anchor_manifest_id
      )
      VALUES (
        @run_id,
        @session_id,
        @mode,
        @intent,
        @nano_volume,
        @nano_events,
        @nano_bytes,
        @nano_energy,
        @nano_cost,
        @avg_stability,
        @avg_drift,
        @high_drift_objects,
        @auto_use_objects,
        @quarantined_objects,
        @created_at_iso,
        @runtime_seconds,
        @metrics_json,
        @transparency_run_id,
        @anchor_manifest_id
      )
    `
    );

    this.topNStmt = this.db.prepare(
      `
      SELECT
        run_id,
        session_id,
        mode,
        intent,
        nano_volume,
        nano_events,
        nano_bytes,
        avg_stability,
        avg_drift,
        created_at_iso,
        runtime_seconds
      FROM nanovolumes
      WHERE run_id = @run_id
      ORDER BY nano_volume DESC
      LIMIT @limit
    `
    );
  }

  /**
   * Save a NanoVolume record.
   *
   * @param {Object} payload - NanoVolume data.
   * Required fields:
   *   runId, mode, nanoVolume, nanoEvents, nanoBytes
   * Optional fields:
   *   sessionId, intent, nanoEnergy, nanoCost, avgStability,
   *   avgDrift, highDriftObjects, autoUseObjects, quarantinedObjects,
   *   createdAtIso, runtimeSeconds, rawMetrics,
   *   transparencyRunId, anchorManifestId
   */
  saveNanoVolume(payload) {
    const nowIso = new Date().toISOString();

    const row = {
      run_id: payload.runId,
      session_id: payload.sessionId || null,
      mode: payload.mode || "unknown",
      intent: payload.intent || null,
      nano_volume: Number(payload.nanoVolume),
      nano_events: Number(payload.nanoEvents),
      nano_bytes: Number(payload.nanoBytes),
      nano_energy:
        payload.nanoEnergy !== undefined ? Number(payload.nanoEnergy) : null,
      nano_cost:
        payload.nanoCost !== undefined ? Number(payload.nanoCost) : null,
      avg_stability:
        payload.avgStability !== undefined ? Number(payload.avgStability) : null,
      avg_drift:
        payload.avgDrift !== undefined ? Number(payload.avgDrift) : null,
      high_drift_objects:
        payload.highDriftObjects !== undefined
          ? Number(payload.highDriftObjects)
          : null,
      auto_use_objects:
        payload.autoUseObjects !== undefined
          ? Number(payload.autoUseObjects)
          : null,
      quarantined_objects:
        payload.quarantinedObjects !== undefined
          ? Number(payload.quarantinedObjects)
          : null,
      created_at_iso: payload.createdAtIso || nowIso,
      runtime_seconds:
        payload.runtimeSeconds !== undefined
          ? Number(payload.runtimeSeconds)
          : null,
      metrics_json: JSON.stringify(payload.rawMetrics || {}),
      transparency_run_id: payload.transparencyRunId || null,
      anchor_manifest_id: payload.anchorManifestId || null,
    };

    if (!row.run_id) {
      throw new Error("NanoVolumeStore.saveNanoVolume requires runId.");
    }
    if (Number.isNaN(row.nano_volume)) {
      throw new Error("nanoVolume must be a number.");
    }
    if (Number.isNaN(row.nano_events)) {
      throw new Error("nanoEvents must be a number.");
    }
    if (Number.isNaN(row.nano_bytes)) {
      throw new Error("nanoBytes must be a number.");
    }

    this.insertStmt.run(row);
  }

  /**
   * Get top-N NanoVolume rows for a given run_id.
   *
   * @param {string} runId
   * @param {number} limit
   * @returns {Array<Object>}
   */
  getTopNanoVolumesForRun(runId, limit = 10) {
    if (!runId) {
      throw new Error("getTopNanoVolumesForRun requires runId.");
    }
    const safeLimit = Number(limit) > 0 ? Number(limit) : 10;
    return this.topNStmt.all({ run_id: runId, limit: safeLimit });
  }

  close() {
    this.db.close();
  }
}

export default NanoVolumeStore;
