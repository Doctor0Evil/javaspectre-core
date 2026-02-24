-- Transparency envelopes for excavation runs and policy shifts.

CREATE TABLE IF NOT EXISTS did_registry (
  did_uri            TEXT PRIMARY KEY,
  did_method         TEXT NOT NULL,        -- e.g. ion, bostrom, eth, aln
  controller         TEXT,                 -- optional controller DID or key
  created_at_iso     TEXT NOT NULL,
  metadata_json      TEXT NOT NULL         -- arbitrary JSON (verification methods, notes)
);

CREATE TABLE IF NOT EXISTS transparency_envelopes (
  envelope_id        TEXT PRIMARY KEY,     -- stable UUID or content-derived ID
  session_id         TEXT NOT NULL,        -- FK into sessions
  snapshot_id        TEXT,                 -- optional FK into snapshots (deep pass, HAR, DOM, spans, etc.)
  created_at_iso     TEXT NOT NULL,

  -- Safety profile + policy context
  safety_profile_id  TEXT NOT NULL,        -- e.g. "edge-conservative", "trusted-analyst", "lab-debug"
  safety_profile_json TEXT NOT NULL,       -- full ExcavationSafetyProfile snapshot
  policy_version     TEXT NOT NULL,        -- ALN policy graph version (e.g. git or hash)
  policy_path        TEXT NOT NULL,        -- e.g. "aln://policies/javaspectre/v1#edge"
  device_class       TEXT NOT NULL,        -- "jetson-edge", "mobile", "cloud-node", "desktop"
  environment        TEXT NOT NULL,        -- "public-space", "private-home", "lab", "unknown"
  user_role          TEXT NOT NULL,        -- "citizen", "operator", "auditor", "developer"
  user_consent_scope TEXT NOT NULL,        -- human-readable consent summary

  -- Hashing + DID binding (DID-aligned, multihash-friendly)
  content_hash_hex   TEXT NOT NULL,        -- raw hex of hash (e.g. BLAKE3, SHA-256)
  hash_algorithm     TEXT NOT NULL,        -- e.g. "blake3-256", "sha2-256"
  content_multihash  TEXT NOT NULL,        -- multibase-encoded multihash string
  did_uri            TEXT NOT NULL,        -- FK into did_registry.did_uri
  did_fragment       TEXT NOT NULL,        -- e.g. "#blake3-<base32>" or "#sha256-<hex>"

  -- Multi-ledger anchoring state
  provenance_chain   TEXT NOT NULL,        -- JSON array of ordered anchors
                                          -- e.g. ["bostrom:tx123", "ion:tx456", "eth:0xabc..."]
  anchoring_status   TEXT NOT NULL,        -- JSON object keyed by ledger
                                          -- e.g. {"bostrom":"pending","ion":"confirmed","eth":"not_scheduled"}

  -- Execution + safety metrics at time of envelope creation
  metrics_json       TEXT NOT NULL,        -- sampling budgets, redaction counts, drift scores, etc.
  decisions_json     TEXT NOT NULL,        -- ordered list of safety decisions, overrides, ALN rule firings
  notes              TEXT NOT NULL,        -- free-form human-audit notes (can be empty string)

  FOREIGN KEY (session_id)  REFERENCES sessions(sessionid)   ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshotid) ON DELETE SET NULL,
  FOREIGN KEY (did_uri)     REFERENCES did_registry(did_uri) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_envelopes_session_id
  ON transparency_envelopes(session_id);

CREATE INDEX IF NOT EXISTS idx_envelopes_snapshot_id
  ON transparency_envelopes(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_envelopes_did_uri
  ON transparency_envelopes(did_uri);

CREATE INDEX IF NOT EXISTS idx_envelopes_content_hash
  ON transparency_envelopes(content_hash_hex);

CREATE INDEX IF NOT EXISTS idx_envelopes_profile_env
  ON transparency_envelopes(safety_profile_id, environment, device_class);
