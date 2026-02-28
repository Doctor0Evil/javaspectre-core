// Normalizes DOM, JSON, trace, and diagram artifacts into a unified SQLite-backed atlas
// with stability/novelty/drift and NanoData metrics.

import Database from 'better-sqlite3';

/**
 * VirtualObjectAtlasWriter
 *  - Assumes core tables sessions, snapshots, virtualobjectscores already exist.
 *  - Adds / uses modality tables: domsheets, jsonschemas, spans, diagrams.
 */
export class VirtualObjectAtlasWriter {
  /**
   * @param {object} options
   * @param {string} options.databasePath - Path to javaspectre-catalog.sqlite3
   */
  constructor(options) {
    const dbPath = options.databasePath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.ensureSchema();
    this.prepareStatements();
  }

  ensureSchema() {
    const ddl = `
    CREATE TABLE IF NOT EXISTS domsheets (
      dom_sheet_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotid     TEXT NOT NULL,
      void           TEXT NOT NULL,
      selector       TEXT NOT NULL,
      kind           TEXT NOT NULL, -- tag | class | motif
      node_count     INTEGER NOT NULL,
      attrs_example  TEXT NOT NULL, -- JSON
      dom_stability  REAL NOT NULL,
      dom_drift      REAL NOT NULL,
      dom_novelty    REAL NOT NULL,
      dom_nanovolume REAL NOT NULL,
      FOREIGN KEY (snapshotid) REFERENCES snapshots(snapshotid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_domsheets_snapshotid ON domsheets(snapshotid);
    CREATE INDEX IF NOT EXISTS idx_domsheets_void ON domsheets(void);

    CREATE TABLE IF NOT EXISTS jsonschemas (
      schema_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotid     TEXT NOT NULL,
      void           TEXT NOT NULL,
      endpoint_hint  TEXT,
      field_stats    TEXT NOT NULL, -- JSON
      json_stability REAL NOT NULL,
      json_drift     REAL NOT NULL,
      json_novelty   REAL NOT NULL,
      json_nanovolume REAL NOT NULL,
      FOREIGN KEY (snapshotid) REFERENCES snapshots(snapshotid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jsonschemas_snapshotid ON jsonschemas(snapshotid);
    CREATE INDEX IF NOT EXISTS idx_jsonschemas_void ON jsonschemas(void);

    CREATE TABLE IF NOT EXISTS spans (
      span_id        TEXT PRIMARY KEY,
      traceid        TEXT NOT NULL,
      snapshotid     TEXT NOT NULL,
      void           TEXT NOT NULL,
      service        TEXT,
      route          TEXT,
      status_code    INTEGER,
      attrs_json     TEXT NOT NULL,
      trace_stability REAL NOT NULL,
      trace_drift     REAL NOT NULL,
      trace_novelty   REAL NOT NULL,
      trace_nanovolume REAL NOT NULL,
      FOREIGN KEY (snapshotid) REFERENCES snapshots(snapshotid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_spans_snapshotid ON spans(snapshotid);
    CREATE INDEX IF NOT EXISTS idx_spans_void ON spans(void);
    CREATE INDEX IF NOT EXISTS idx_spans_traceid ON spans(traceid);

    CREATE TABLE IF NOT EXISTS diagrams (
      diagram_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotid     TEXT NOT NULL,
      void           TEXT NOT NULL,
      diagram_type   TEXT NOT NULL, -- flowchart | state | sequence | class | graph
      ast_json       TEXT NOT NULL,
      ast_stability  REAL NOT NULL,
      ast_drift      REAL NOT NULL,
      ast_novelty    REAL NOT NULL,
      ast_nanovolume REAL NOT NULL,
      FOREIGN KEY (snapshotid) REFERENCES snapshots(snapshotid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_diagrams_snapshotid ON diagrams(snapshotid);
    CREATE INDEX IF NOT EXISTS idx_diagrams_void ON diagrams(void);
    `;
    this.db.exec(ddl);
  }

  prepareStatements() {
    this.insertDomSheetStmt = this.db.prepare(`
      INSERT INTO domsheets
        (snapshotid, void, selector, kind, node_count, attrs_example,
         dom_stability, dom_drift, dom_novelty, dom_nanovolume)
      VALUES
        (@snapshotid, @void, @selector, @kind, @node_count, @attrs_example,
         @dom_stability, @dom_drift, @dom_novelty, @dom_nanovolume)
    `);

    this.insertJsonSchemaStmt = this.db.prepare(`
      INSERT INTO jsonschemas
        (snapshotid, void, endpoint_hint, field_stats,
         json_stability, json_drift, json_novelty, json_nanovolume)
      VALUES
        (@snapshotid, @void, @endpoint_hint, @field_stats,
         @json_stability, @json_drift, @json_novelty, @json_nanovolume)
    `);

    this.insertSpanStmt = this.db.prepare(`
      INSERT INTO spans
        (span_id, traceid, snapshotid, void, service, route, status_code,
         attrs_json, trace_stability, trace_drift, trace_novelty, trace_nanovolume)
      VALUES
        (@span_id, @traceid, @snapshotid, @void, @service, @route, @status_code,
         @attrs_json, @trace_stability, @trace_drift, @trace_novelty, @trace_nanovolume)
    `);

    this.insertDiagramStmt = this.db.prepare(`
      INSERT INTO diagrams
        (snapshotid, void, diagram_type, ast_json,
         ast_stability, ast_drift, ast_novelty, ast_nanovolume)
      VALUES
        (@snapshotid, @void, @diagram_type, @ast_json,
         @ast_stability, @ast_drift, @ast_novelty, @ast_nanovolume)
    `);
  }

  /**
   * Persist DOM sheet motifs from a DOMSheetStabilizer window.
   * domSheets: array of { selector, kind, nodeCount, attrsExample, stability, drift, novelty, nanoVolume, void }
   */
  saveDomSheets(snapshotId, domSheets) {
    const tx = this.db.transaction((rows) => {
      for (const row of rows) {
        this.insertDomSheetStmt.run({
          snapshotid: snapshotId,
          void: row.void,
          selector: row.selector,
          kind: row.kind,
          node_count: row.nodeCount,
          attrs_example: JSON.stringify(row.attrsExample ?? {}),
          dom_stability: row.stability,
          dom_drift: row.drift,
          dom_novelty: row.novelty,
          dom_nanovolume: row.nanoVolume
        });
      }
    });
    tx(domSheets || []);
  }

  /**
   * Persist inferred JSON schemas.
   * schemas: array of { void, endpointHint, fieldStats, stability, drift, novelty, nanoVolume }
   */
  saveJsonSchemas(snapshotId, schemas) {
    const tx = this.db.transaction((rows) => {
      for (const row of rows) {
        this.insertJsonSchemaStmt.run({
          snapshotid: snapshotId,
          void: row.void,
          endpoint_hint: row.endpointHint ?? null,
          field_stats: JSON.stringify(row.fieldStats ?? {}),
          json_stability: row.stability,
          json_drift: row.drift,
          json_novelty: row.novelty,
          json_nanovolume: row.nanoVolume
        });
      }
    });
    tx(schemas || []);
  }

  /**
   * Persist OpenTelemetry-like spans mapped to virtual objects.
   * spans: array of { spanId, traceId, void, service, route, statusCode, attrs, stability, drift, novelty, nanoVolume }
   */
  saveSpans(snapshotId, spans) {
    const tx = this.db.transaction((rows) => {
      for (const row of rows) {
        this.insertSpanStmt.run({
          span_id: row.spanId,
          traceid: row.traceId,
          snapshotid: snapshotId,
          void: row.void,
          service: row.service ?? null,
          route: row.route ?? null,
          status_code: typeof row.statusCode === 'number' ? row.statusCode : null,
          attrs_json: JSON.stringify(row.attrs ?? {}),
          trace_stability: row.stability,
          trace_drift: row.drift,
          trace_novelty: row.novelty,
          trace_nanovolume: row.nanoVolume
        });
      }
    });
    tx(spans || []);
  }

  /**
   * Persist Mermaid/diagram ASTs as diagram virtual-objects.
   * diagrams: array of { void, diagramType, ast, stability, drift, novelty, nanoVolume }
   */
  saveDiagrams(snapshotId, diagrams) {
    const tx = this.db.transaction((rows) => {
      for (const row of rows) {
        this.insertDiagramStmt.run({
          snapshotid: snapshotId,
          void: row.void,
          diagram_type: row.diagramType,
          ast_json: JSON.stringify(row.ast ?? {}),
          ast_stability: row.stability,
          ast_drift: row.drift,
          ast_novelty: row.novelty,
          ast_nanovolume: row.nanoVolume
        });
      }
    });
    tx(diagrams || []);
  }

  /**
   * Simple cross-modal atlas query helper:
   * returns all modalities for a given snapshotId + void.
   */
  getAtlasEntry(snapshotId, voidId) {
    const doms = this.db.prepare(
      'SELECT * FROM domsheets WHERE snapshotid = ? AND void = ?'
    ).all(snapshotId, voidId);

    const schemas = this.db.prepare(
      'SELECT * FROM jsonschemas WHERE snapshotid = ? AND void = ?'
    ).all(snapshotId, voidId);

    const spans = this.db.prepare(
      'SELECT * FROM spans WHERE snapshotid = ? AND void = ?'
    ).all(snapshotId, voidId);

    const diagrams = this.db.prepare(
      'SELECT * FROM diagrams WHERE snapshotid = ? AND void = ?'
    ).all(snapshotId, voidId);

    return { doms, schemas, spans, diagrams };
  }

  close() {
    this.db.close();
  }
}

export default VirtualObjectAtlasWriter;
