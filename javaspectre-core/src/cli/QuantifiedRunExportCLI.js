/**
 * QuantifiedRunExportCLI
 *
 * Node CLI that:
 *  1) Connects to the Javaspectre SQLite catalog.
 *  2) Reads a TransparencyEnvelope row by runId.
 *  3) Loads classified virtual objects for that run.
 *  4) Emits .jsonl feature records suitable for ML training.
 *
 * Usage:
 *   node src/cli/QuantifiedRunExportCLI.js \
 *     --db ./db/javaspectre-catalog.sqlite \
 *     --run-id <uuid> \
 *     --out ./features/run-<uuid>.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sqlite3 from "sqlite3";

import { QuantifiedVirtualObjectMapper } from "../quantified/QuantifiedVirtualObjectMapper.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db") {
      args.db = argv[++i];
    } else if (arg === "--run-id") {
      args.runId = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(
    "Usage: node src/cli/QuantifiedRunExportCLI.js " +
      "--db <sqlite-file> --run-id <uuid> --out <file.jsonl>"
  );
}

/**
 * Open SQLite database as a Promise.
 */
function openDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function allAsync(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAsync(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function loadEnvelope(db, runId) {
  const row = await getAsync(
    db,
    `
    SELECT envelopejson
    FROM transparencyenvelopes
    WHERE runid = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [runId]
  );

  if (!row || !row.envelopejson) {
    throw new Error(`No TransparencyEnvelope found for runId=${runId}`);
  }

  return JSON.parse(row.envelopejson);
}

async function loadClassifiedObjects(db, runId) {
  // This assumes a "virtualobjects" table with columns:
  //  runid, objectid, kind, confidence, drift, category, payloadjson, tier, rationalejson.
  const rows = await allAsync(
    db,
    `
    SELECT runid, objectid, kind, confidence, drift, category,
           payloadjson, tier, rationalejson
    FROM virtualobjects
    WHERE runid = ?
    ORDER BY objectid ASC
    `,
    [runId]
  );

  return rows.map((row) => {
    let payload = null;
    let rationale = null;

    try {
      payload = row.payloadjson ? JSON.parse(row.payloadjson) : null;
    } catch {
      payload = null;
    }

    try {
      rationale = row.rationalejson ? JSON.parse(row.rationalejson) : null;
    } catch {
      rationale = null;
    }

    return {
      runId: row.runid,
      id: row.objectid,
      kind: row.kind,
      confidence:
        typeof row.confidence === "number"
          ? row.confidence
          : (rationale && typeof rationale.confidence === "number"
              ? rationale.confidence
              : null),
      drift:
        typeof row.drift === "number"
          ? row.drift
          : (rationale && typeof rationale.drift === "number"
              ? rationale.drift
              : null),
      category: row.category || null,
      tier: row.tier || null,
      rationale,
      payload
    };
  });
}

async function exportRunFeatures({ dbPath, runId, outPath }) {
  const absDb = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  const absOut = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);

  const db = await openDatabase(absDb);
  try {
    const envelope = await loadEnvelope(db, runId);
    const objects = await loadClassifiedObjects(db, runId);

    const mapper = new QuantifiedVirtualObjectMapper({});
    const runFeatures = mapper.toRunFeatures(envelope, objects, null);

    const outStream = fs.createWriteStream(absOut, { encoding: "utf8" });

    // First line: run-level features.
    outStream.write(JSON.stringify({ type: "run", runId, features: runFeatures }) + "\n");

    // Per-object lines.
    for (const obj of objects) {
      const record = {
        type: "object",
        runId,
        objectId: obj.id,
        kind: obj.kind,
        tier: obj.tier || obj.rationale?.tier || null,
        confidence: obj.confidence,
        drift: obj.drift,
        category: obj.category,
        runMetrics: {
          nodesProcessed: runFeatures.metrics.nodesProcessed,
          spansProcessed: runFeatures.metrics.spansProcessed,
          deepPassObjects: runFeatures.metrics.deepPassObjects,
          runSeconds: runFeatures.metrics.runSeconds
        },
        safety: runFeatures.safety,
        // payload is kept, but downstream ML can drop or hash fields as needed.
        payload: obj.payload ?? null
      };

      outStream.write(JSON.stringify(record) + "\n");
    }

    outStream.end();

    return { envelope, objects, outPath: absOut };
  } finally {
    db.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.db || !args.runId || !args.out) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  try {
    const result = await exportRunFeatures({
      dbPath: args.db,
      runId: args.runId,
      outPath: args.out
    });

    // eslint-disable-next-line no-console
    console.log(
      `Exported quantified features for runId=${args.runId} to ${result.outPath}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error exporting quantified run features:", err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Node ESM entrypoint
  main();
}
