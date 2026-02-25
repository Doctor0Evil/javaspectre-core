#! /usr/bin/env node
// javaspectre-core/src/cli/nanovolume-top.js
// Prints top-N NanoVolume rows for a given run_id.

import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import NanoVolumeStore from "../persistence/NanoVolumeStore.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function printUsage() {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: javaspectre-nanovolume-top <run-id> [N]\n" +
      "Prints the top-N NanoVolume entries for the given run-id."
  );
}

function formatRow(row) {
  return [
    `run_id=${row.run_id}`,
    `session=${row.session_id || "-"}`,
    `mode=${row.mode}`,
    `nanoVolume=${row.nano_volume.toFixed(4)}`,
    `nanoEvents=${row.nano_events}`,
    `nanoBytes=${row.nano_bytes}`,
    `avgStability=${row.avg_stability ?? "n/a"}`,
    `avgDrift=${row.avg_drift ?? "n/a"}`,
    `runtime=${row.runtime_seconds ?? "n/a"}s`,
    `created=${row.created_at_iso}`,
  ].join("  |  ");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const runId = args[0];
  const limit = args[1] ? Number(args[1]) : 10;

  const store = new NanoVolumeStore({ ensureSchema: false });
  try {
    const rows = store.getTopNanoVolumesForRun(runId, limit);
    if (!rows.length) {
      // eslint-disable-next-line no-console
      console.log(`No NanoVolume entries found for run_id=${runId}`);
      store.close();
      return;
    }

    // eslint-disable-next-line no-console
    console.log(
      `Top ${rows.length} NanoVolume entries for run_id=${runId} (highest nano_volume first):`
    );
    for (const row of rows) {
      // eslint-disable-next-line no-console
      console.log(formatRow(row));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error reading NanoVolume data:", String(err));
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

if (import.meta.url === `file://${filename}`) {
  main();
}
