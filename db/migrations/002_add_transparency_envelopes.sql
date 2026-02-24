-- Adds a table to store TransparencyEnvelope records for each excavation run.

CREATE TABLE IF NOT EXISTS transparency_envelopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  intent TEXT,
  javaspectre_version TEXT,
  node_version TEXT,
  node_budget INTEGER,
  trace_span_budget INTEGER,
  deep_pass_budget INTEGER,
  max_run_seconds INTEGER,
  nodes_processed INTEGER,
  spans_processed INTEGER,
  deep_pass_objects INTEGER,
  run_seconds REAL,
  virtual_objects INTEGER,
  high_confidence_stable INTEGER,
  quarantined INTEGER,
  risks_noted TEXT,
  assumptions TEXT,
  notes TEXT,
  content_hash TEXT NOT NULL,
  envelope_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transparency_envelopes_run_id
  ON transparency_envelopes (run_id);

CREATE INDEX IF NOT EXISTS idx_transparency_envelopes_timestamp
  ON transparency_envelopes (timestamp);
