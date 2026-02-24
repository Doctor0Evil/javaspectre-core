// Safety-aware CLI: runs an excavation with budgets and trust classification.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import VirtualObjectExcavator from "../core/VirtualObjectExcavator.js";
import ExcavationSessionManager from "../core/ExcavationSessionManager.js";
import VirtualObjectScoreEngine from "../core/VirtualObjectScoreEngine.js";
import { ExcavationSafetyProfile } from "../security/ExcavationSafetyProfile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, "utf8");
  return JSON.parse(raw);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    // eslint-disable-next-line no-console
    console.error("Usage: node inspect-safe.js <json-file>");
    process.exit(1);
  }

  const inputFile = args[0];
  const data = readJson(inputFile);

  const safety = new ExcavationSafetyProfile("default-cli");
  const sessionManager = new ExcavationSessionManager({ maxDepth: 6, maxSnapshots: 5 });
  const scorer = new VirtualObjectScoreEngine({ historyWindow: 10 });
  const excavator = new VirtualObjectExcavator({
    maxDepth: 6,
    maxArraySample: 16,
    includeDom: false,
    includeFunctions: false
  });

  const sessionId = `json:${path.basename(inputFile)}`;
  const session = sessionManager.startSession(sessionId, {
    source: inputFile,
    mode: "json",
    safetyProfile: safety.profileName
  });

  const start = Date.now();

  // Shallow pass
  const shallow = excavator.excavate({ value: data, domRoot: null });
  const snapShallow = sessionManager.addSnapshot(session.id, shallow, "shallow");

  // Deep pass (subject to budget heuristics)
  const estimatedValueScore = 0.7; // simple heuristic for now
  const costScore = 0.3;
  let deep = null;
  let snapDeep = null;

  if (safety.shouldEnterDeepPass(estimatedValueScore, costScore)) {
    deep = excavator.excavate({ value: data, domRoot: null });
    snapDeep = sessionManager.addSnapshot(session.id, deep, "deep");
  }

  const end = Date.now();
  const runSeconds = (end - start) / 1000;

  const stats = {
    nodes: shallow.virtualObjects.length,
    spans: 0,
    deepCandidates: deep ? deep.virtualObjects.length : 0,
    runSeconds
  };

  const budgetCheck = safety.enforceBudgets(stats);
  if (!budgetCheck.ok) {
    // eslint-disable-next-line no-console
    console.warn("Safety budgets exceeded:", budgetCheck.violations);
  }

  const targetSnapshot = snapDeep || snapShallow;
  const scores = scorer.scoreSnapshot(targetSnapshot);

  // Classify objects by trust level
  const classified = scores.map((entry) => {
    const confidence = entry.stability; // reuse stability as confidence proxy
    const drift = 1 - entry.novelty;    // invert novelty to approximate drift
    const trust = safety.classifyObject(confidence, drift);
    return {
      id: entry.id,
      category: entry.category,
      stability: entry.stability,
      novelty: entry.novelty,
      reuseHint: entry.reuseHint,
      trust
    };
  });

  const summary = sessionManager.getSessionSummary(session.id);
  const report = {
    session: summary,
    safety: {
      profileName: safety.profileName,
      budgets: {
        nodeBudget: safety.nodeBudget,
        traceSpanBudget: safety.traceSpanBudget,
        deepPassBudget: safety.deepPassBudget,
        maxRunSeconds: safety.maxRunSeconds
      },
      budgetCheck
    },
    scores: classified,
    metrics: {
      nodesProcessed: stats.nodes,
      spansProcessed: stats.spans,
      deepPassObjects: stats.deepCandidates,
      runSeconds
    }
  };

  const outPath = path.join(process.cwd(), ".javaspectre-inspect-safe.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Safety-aware excavation report written to ${outPath}`);
}

if (import.meta.url === `file://${__filename}`) {
  main();
}
