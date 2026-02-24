// SQLite + JSON1 schema helper for DID-linked content_hash indexing
// in SovereignExcavationProfile-style catalogs.

export const SOVEREIGN_DB_FILENAME = "javaspectre-sovereign-catalog.sqlite";

export const SovereignDidIndexSchema = {
  tables: {
    sovereign_excavation_profiles: `
CREATE TABLE IF NOT EXISTS sovereign_excavation_profiles (
  profile_id       TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  motif_id         TEXT NOT NULL,
  node_id          TEXT NOT NULL,
  created_at_ns    INTEGER NOT NULL,
  updated_at_ns    INTEGER NOT NULL,
  payload_json     TEXT NOT NULL, -- full JSON document
  -- immutable cryptographic digest (content_hash) must ALSO be present in payload_json
  -- e.g. { "content_hash": "..." , "did": "...", "node_id": "..." }
  FOREIGN KEY(run_id) REFERENCES runs(run_id)
);`,
    runs: `
CREATE TABLE IF NOT EXISTS runs (
  run_id         TEXT PRIMARY KEY,
  started_at_ns  INTEGER NOT NULL,
  finished_at_ns INTEGER,
  mode           TEXT NOT NULL,
  origin_hint    TEXT,
  run_meta_json  TEXT NOT NULL
);`
  },

  // JSON1 expression indexes for DID / content_hash / node_id
  // These never materialize or transform the digest; they only index the
  // exact JSON path, preserving immutability and verifiability at query time.
  indexes: {
    sovereign_excavation_profiles: `
CREATE INDEX IF NOT EXISTS idx_se_profiles_content_hash
  ON sovereign_excavation_profiles (
    json_extract(payload_json, '$.content_hash')
  );

CREATE INDEX IF NOT EXISTS idx_se_profiles_did
  ON sovereign_excavation_profiles (
    json_extract(payload_json, '$.did')
  );

CREATE INDEX IF NOT EXISTS idx_se_profiles_node_id
  ON sovereign_excavation_profiles (
    json_extract(payload_json, '$.node_id')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_se_profiles_run_motif
  ON sovereign_excavation_profiles (run_id, motif_id);`
  },

  // Optional view exposing virtual columns for query ergonomics
  views: {
    v_sovereign_profiles: `
CREATE VIEW IF NOT EXISTS v_sovereign_profiles AS
SELECT
  profile_id,
  run_id,
  motif_id,
  node_id,
  created_at_ns,
  updated_at_ns,
  json_extract(payload_json, '$.content_hash') AS content_hash,
  json_extract(payload_json, '$.did')          AS did,
  json_extract(payload_json, '$.node_id')      AS node_id_json,
  payload_json
FROM sovereign_excavation_profiles;`
  }
};

/**
 * Returns an ordered list of SQL statements to bring a fresh SQLite DB
 * into alignment with the sovereign DID index schema.
 */
export function getSovereignDidSchemaMigrationSql() {
  return [
    SovereignDidIndexSchema.tables.runs,
    SovereignDidIndexSchema.tables.sovereign_excavation_profiles,
    SovereignDidIndexSchema.indexes.sovereign_excavation_profiles,
    SovereignDidIndexSchema.views.v_sovereign_profiles
  ];
}

/**
 * Convenience helper: given a rusqlite/SQLite client wrapper that exposes
 * db.exec(sql), apply the migration in a single call.
 */
export async function applySovereignDidSchema(db) {
  const statements = getSovereignDidSchemaMigrationSql();
  for (const sql of statements) {
    // eslint-disable-next-line no-await-in-loop
    await db.exec(sql);
  }
}

export default {
  SOVEREIGN_DB_FILENAME,
  SovereignDidIndexSchema,
  getSovereignDidSchemaMigrationSql,
  applySovereignDidSchema
};
