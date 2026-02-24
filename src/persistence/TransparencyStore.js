// Creates TransparencyEnvelope records and stores them into SQLite.

import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTransparencyEnvelope } from "../security/TransparencyEnvelope.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TransparencyStore {
  constructor(options = {}) {
    const dbPath = options.dbPath ||
      path.join(__dirname, "..", "..", "db", "javaspectre_catalog.sqlite");
    this.db = new sqlite3.Database(dbPath);
  }

  saveEnvelopeFromRun(runMeta, inputs, outputs, safetyProfile, metrics) {
    const envelope = createTransparencyEnvelope(
      runMeta,
      inputs,
      outputs,
      safetyProfile,
      metrics
    );

    const stmt = this.db.prepare(
      `INSERT INTO transparency_envelopes (
        run_id, timestamp, profile_name, mode, intent,
        javaspectre_version, node_version,
        node_budget, trace_span_budget, deep_pass_budget, max_run_seconds,
        nodes_processed, spans_processed, deep_pass_objects, run_seconds,
        virtual_objects, high_confidence_stable, quarantined,
        risks_noted, assumptions, notes,
        content_hash, envelope_json
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )`
    );

    const outputsSummary = envelope.outputsSummary;
    const info = envelope;

    return new Promise((resolve, reject) => {
      stmt.run(
        info.runId,
        info.timestamp,
        info.safetyProfile.profileName,
        info.runMeta.mode,
        info.runMeta.intent,
        info.runMeta.javaspectreVersion,
        info.runMeta.nodeVersion,
        info.safetyProfile.nodeBudget,
        info.safetyProfile.traceSpanBudget,
        info.safetyProfile.deepPassBudget,
        info.safetyProfile.maxRunSeconds,
        info.metrics.nodesProcessed,
        info.metrics.spansProcessed,
        info.metrics.deepPassObjects,
        info.metrics.runSeconds,
        outputsSummary.virtualObjects,
        outputsSummary.highConfidenceStable,
        outputsSummary.quarantined,
        JSON.stringify(info.risksNoted),
        JSON.stringify(info.assumptions),
        JSON.stringify(info.notes),
        info.contentHash,
        JSON.stringify(envelope),
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(envelope);
          }
        }
      );
    });
  }
}

export default TransparencyStore;
