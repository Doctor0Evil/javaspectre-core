-- EdgeZoneCognitiveOverlay catalog with composite (run_id, motif_id) key and JSON1 indexing.

CREATE TABLE IF NOT EXISTS edge_overlays (
  run_id                     TEXT NOT NULL,
  motif_id                   TEXT NOT NULL,
  node_id                    TEXT NOT NULL,
  overlay_id                 TEXT NOT NULL,
  did                        TEXT,
  content_hash               TEXT NOT NULL,
  spatial_anchor_id          TEXT NOT NULL,
  space_id                   TEXT NOT NULL,
  reference_frame            TEXT NOT NULL,
  motif_type                 TEXT NOT NULL,
  motif_signature            TEXT,
  activation_threshold       REAL NOT NULL,
  deactivation_threshold     REAL NOT NULL,
  decay_ms                   INTEGER NOT NULL,
  cpu_budget_ms              INTEGER NOT NULL,
  gpu_budget_ms              INTEGER NOT NULL,
  sensor_access_window_ms    INTEGER NOT NULL,
  mesh_persistence_ms        INTEGER NOT NULL,
  max_concurrent_instances   INTEGER NOT NULL,
  overlay_kind               TEXT NOT NULL,
  overlay_priority           REAL NOT NULL,
  payload_uri                TEXT,
  payload_content_type       TEXT,
  dom_stability_signature    TEXT,
  transparency_run_id        TEXT,
  transparency_anchor_ref    TEXT,
  transparency_ledger        TEXT,
  tags_json                  TEXT,
  audit_flags_json           TEXT,
  created_at                 TEXT NOT NULL,
  overlay_json               TEXT NOT NULL,
  PRIMARY KEY (run_id, motif_id)
);

-- Helpful indexes:
CREATE INDEX IF NOT EXISTS idx_edge_overlays_node_id
  ON edge_overlays (node_id);

CREATE INDEX IF NOT EXISTS idx_edge_overlays_did
  ON edge_overlays (did);

CREATE INDEX IF NOT EXISTS idx_edge_overlays_content_hash
  ON edge_overlays (content_hash);

CREATE INDEX IF NOT EXISTS idx_edge_overlays_spatial_anchor
  ON edge_overlays (spatial_anchor_id);

-- Example JSON1 virtual column for querying motif_type from overlay_json:
CREATE VIRTUAL TABLE IF NOT EXISTS edge_overlays_motif_idx
USING fts5 (
  run_id,
  motif_id,
  motif_type,
  content_hash,
  overlay_json,
  content='edge_overlays',
  content_rowid='rowid'
);
