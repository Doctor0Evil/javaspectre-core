-- Core object-family tables with standardized linkage fields and JSON1 payloads.

PRAGMA foreign_keys = ON;

-- 1. Runs and nodes (linkage roots)

CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  created_at_iso TEXT NOT NULL,
  node_id       TEXT,
  did           TEXT,
  intent        TEXT,
  mode          TEXT,
  envelope_hash TEXT,         -- TransparencyEnvelope.contentHash
  envelope_json TEXT          -- full JSON copy, immutable
);

CREATE INDEX IF NOT EXISTS idx_runs_node_id ON runs(node_id);
CREATE INDEX IF NOT EXISTS idx_runs_did ON runs(did);

CREATE TABLE IF NOT EXISTS nodes (
  node_id      TEXT PRIMARY KEY,
  device_class TEXT NOT NULL,   -- e.g. "jetson-orin-nano"
  perf_tier    TEXT NOT NULL,   -- "low" | "medium" | "high"
  locality     TEXT,
  payload_json TEXT NOT NULL     -- SovereignNodeProfile JSON
);

-- 2. DOMStabilitySignature family

CREATE TABLE IF NOT EXISTS dom_stability_signatures (
  dom_signature_hash TEXT PRIMARY KEY,
  normalized_selector TEXT NOT NULL,
  role                TEXT NOT NULL,
  stability_band      TEXT NOT NULL,
  stability_score     REAL NOT NULL,
  run_id              TEXT,
  node_id             TEXT,
  did                 TEXT,
  content_hash        TEXT,
  payload_json        TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dom_sig_run_id ON dom_stability_signatures(run_id);
CREATE INDEX IF NOT EXISTS idx_dom_sig_role_band ON dom_stability_signatures(role, stability_band);
CREATE INDEX IF NOT EXISTS idx_dom_sig_node ON dom_stability_signatures(node_id);
CREATE INDEX IF NOT EXISTS idx_dom_sig_did ON dom_stability_signatures(did);

-- 3. TraceStateMachineMotif family

CREATE TABLE IF NOT EXISTS trace_state_machine_motifs (
  motif_id       TEXT PRIMARY KEY,
  fsm_hash       TEXT NOT NULL,
  domain_category TEXT NOT NULL,
  error_rate     REAL NOT NULL,
  run_id         TEXT,
  node_id        TEXT,
  did            TEXT,
  content_hash   TEXT,
  payload_json   TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_motifs_fsm_hash ON trace_state_machine_motifs(fsm_hash);
CREATE INDEX IF NOT EXISTS idx_motifs_domain ON trace_state_machine_motifs(domain_category);
CREATE INDEX IF NOT EXISTS idx_motifs_run_id ON trace_state_machine_motifs(run_id);
CREATE INDEX IF NOT EXISTS idx_motifs_node ON trace_state_machine_motifs(node_id);
CREATE INDEX IF NOT EXISTS idx_motifs_did ON trace_state_machine_motifs(did);

-- 4. VirtualObjectMotifFamily

CREATE TABLE IF NOT EXISTS motif_families (
  family_id          TEXT PRIMARY KEY,
  motif_type         TEXT NOT NULL,
  spread_score       REAL NOT NULL,
  member_count       INTEGER NOT NULL,
  run_id             TEXT,
  node_id            TEXT,
  did                TEXT,
  content_hash       TEXT,
  payload_json       TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_families_type ON motif_families(motif_type);
CREATE INDEX IF NOT EXISTS idx_families_spread ON motif_families(spread_score);
CREATE INDEX IF NOT EXISTS idx_families_run_id ON motif_families(run_id);
CREATE INDEX IF NOT EXISTS idx_families_node ON motif_families(node_id);
CREATE INDEX IF NOT EXISTS idx_families_did ON motif_families(did);

-- 5. TrustTierCluster

CREATE TABLE IF NOT EXISTS trust_tier_clusters (
  cluster_id      TEXT PRIMARY KEY,
  tier            TEXT NOT NULL,           -- "auto-use" | "warn" | "quarantine"
  domain_category TEXT NOT NULL,
  median_confidence REAL,
  median_drift      REAL,
  run_id          TEXT,
  node_id         TEXT,
  did             TEXT,
  content_hash    TEXT,
  payload_json    TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clusters_tier_domain
  ON trust_tier_clusters(tier, domain_category);
CREATE INDEX IF NOT EXISTS idx_clusters_run_id ON trust_tier_clusters(run_id);
CREATE INDEX IF NOT EXISTS idx_clusters_node ON trust_tier_clusters(node_id);
CREATE INDEX IF NOT EXISTS idx_clusters_did ON trust_tier_clusters(did);

-- 6. MotifReuseLedgerEntry (federation and reputation)

CREATE TABLE IF NOT EXISTS motif_reuse_ledger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  motif_id        TEXT NOT NULL,
  target_repo     TEXT NOT NULL,
  reuser_node_id  TEXT NOT NULL,
  did             TEXT,
  trust_tier_at_reuse TEXT,
  reuse_time_iso  TEXT NOT NULL,
  reuse_context   TEXT NOT NULL,      -- JSON
  run_id          TEXT,
  content_hash    TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reuse_motif_repo
  ON motif_reuse_ledger(motif_id, target_repo);
CREATE INDEX IF NOT EXISTS idx_reuse_node ON motif_reuse_ledger(reuser_node_id);
CREATE INDEX IF NOT EXISTS idx_reuse_did ON motif_reuse_ledger(did);
CREATE INDEX IF NOT EXISTS idx_reuse_run_id ON motif_reuse_ledger(run_id);
