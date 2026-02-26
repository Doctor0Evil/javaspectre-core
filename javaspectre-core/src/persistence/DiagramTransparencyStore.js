// Persists MermaidDiagramEnvelope records into SQLite, mirroring TransparencyEnvelope.

import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DiagramTransparencyStore {
  constructor(options = {}) {
    const dbPath =
      options.dbPath ??
      path.join(__dirname, "..", "..", "db", "javaspectre_catalog.sqlite");

    this.db = new sqlite3.Database(dbPath);
  }

  /**
   * Inserts a MermaidDiagramEnvelope into the diagram_envelopes table.
   * @param {object} envelope - Result of MermaidSafetyKernel.validateAndSealDiagram
   * @returns {Promise<object>} - Resolves to the stored envelope
   */
  saveDiagramEnvelope(envelope) {
    const {
      runId,
      timestamp,
      mode,
      intent,
      safetyProfile,
      summary,
      contentHash,
    } = this._extractEnvelopeFields(envelope);

    const sql = `
      INSERT INTO diagram_envelopes (
        runid,
        timestamp,
        mode,
        intent,
        profilename,
        maxnodes,
        maxedges,
        maxsubgraphs,
        maxdepth,
        maxfanout,
        maxfanin,
        nodecount,
        edgecount,
        subgraphcount,
        diagrammaxdepth,
        tiers,
        contenthash,
        envelopejson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      runId,
      timestamp,
      mode,
      intent,
      safetyProfile.profileName,
      safetyProfile.maxNodes,
      safetyProfile.maxEdges,
      safetyProfile.maxSubgraphs,
      safetyProfile.maxDepth,
      safetyProfile.maxFanOutPerNode,
      safetyProfile.maxFanInPerNode,
      summary.nodeCount,
      summary.edgeCount,
      summary.subgraphCount,
      summary.maxDepth,
      JSON.stringify(summary.tiers),
      contentHash,
      JSON.stringify(envelope),
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(envelope);
        }
      });
    });
  }

  _extractEnvelopeFields(envelope) {
    if (!envelope || envelope.kind !== "MermaidDiagramEnvelope") {
      throw new Error("DiagramTransparencyStore: invalid envelope kind");
    }

    const {
      runId,
      timestamp,
      mode,
      intent,
      safetyProfile,
      summary,
      contentHash,
    } = envelope;

    return {
      runId,
      timestamp,
      mode,
      intent,
      safetyProfile,
      summary,
      contentHash,
    };
  }
}

export default DiagramTransparencyStore;
