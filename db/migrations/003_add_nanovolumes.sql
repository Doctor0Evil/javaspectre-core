-- Stores per-run NanoVolume metrics, keyed by run/session.

CREATE TABLE IF NOT EXISTS nanovolumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,              -- links to sessions/runId in your catalog
  session_id TEXT,                   -- optional: link to sessions.sessionid if present
  mode TEXT NOT NULL,                -- e.g. 'dom', 'trace', 'har', 'json'
  intent TEXT,                       -- short description of the run's purpose

  -- Core NanoVolume metrics
  nano_volume REAL NOT NULL,         -- scalar NanoVolume score for the run
  nano_events INTEGER NOT NULL,      -- count of nano-scale events/objects
  nano_bytes INTEGER NOT NULL,       -- approximate bytes contributing to NanoVolume
  nano_energy REAL,                  -- optional: estimated energy cost in nano-units
  nano_cost REAL,                    -- optional: monetary or abstract cost unit

  -- Links to stability/drift (optional but useful)
  avg_stability REAL,                -- mean stability across virtual-objects
  avg_drift REAL,                    -- mean drift across virtual-objects
  high_drift_objects INTEGER,        -- count of high-drift objects
  auto_use_objects INTEGER,          -- count of objects tiered as 'auto-use'
  quarantined_objects INTEGER,       -- count of objects tiered as 'quarantine'

  -- Timing and ordering
  created_at_iso TEXT NOT NULL,      -- ISO-8601 timestamp when row created
  runtime_seconds REAL,              -- run wall-clock seconds

  -- Raw JSON snapshot, for future-proofing
  metrics_json TEXT NOT NULL,        -- full NanoVolume JSON payload

  -- Optional foreign-key-like links (no hard FK to stay flexible)
  transparency_run_id TEXT,          -- link to transparencyenvelopes.runid when present
  anchor_manifest_id TEXT            -- link to AnchorManifest.manifestId when present
);

CREATE INDEX IF NOT EXISTS idx_nanovolumes_run_id
  ON nanovolumes (run_id);

CREATE INDEX IF NOT EXISTS idx_nanovolumes_session_mode
  ON nanovolumes (session_id, mode);

CREATE INDEX IF NOT EXISTS idx_nanovolumes_created_at
  ON nanovolumes (created_at_iso);
