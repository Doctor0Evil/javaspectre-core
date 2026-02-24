// Executes a Javaspectre excavation run with safety budgets and transparency envelopes applied.

import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

import VirtualObjectExcavator from "./VirtualObjectExcavator.js";
import ExcavationSessionManager from "./ExcavationSessionManager.js";
import VirtualObjectScoreEngine from "./VirtualObjectScoreEngine.js";
import ExcavationSafetyProfile from "../security/ExcavationSafetyProfile.js";
import { createTransparencyEnvelope } from "../security/TransparencyEnvelope.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SafetyWrappedExcavationRunner {
  constructor(options = {}) {
    const {
      profileName = "edge-default",
      safetyProfile = null,
      historyWindow = 20,
      maxDepth = 6,
      maxArraySample = 16
    } = options;

    this.safetyProfile =
      safetyProfile instanceof ExcavationSafetyProfile
        ? safetyProfile
        : new ExcavationSafetyProfile(profileName);

    this.excavator = new VirtualObjectExcavator({
      maxDepth,
      maxArraySample,
      includeDom: options.includeDom === true,
      includeFunctions: options.includeFunctions === true
    });

    this.sessionManager = new ExcavationSessionManager({
      maxDepth,
      maxSnapshots: 5
    });

    this.scoreEngine = new VirtualObjectScoreEngine({
      historyWindow
    });
  }

  /**
   * Run a full shallow+deep excavation with budgets and transparency.
   * @param {Object} params
   * @param {"json"|"dom"|"trace"} params.mode
   * @param {any} params.input
   * @param {Object} params.runMeta
   * @param {Object} params.origin
   * @returns {{ report: Object, envelope: Object }}
   */
  runWithSafety(params) {
    const { mode, input, runMeta = {}, origin = {} } = params;

    const runStart = Date.now();
    const sessionId = `${mode}:${origin.label || "unnamed"}`;
    const session = this.sessionManager.startSession(sessionId, {
      source: origin.sourcePath || null,
      mode,
      originHint: origin.originHint || null
    });

    // Shallow pass
    const shallowResult = this.buildExcavationResult(mode, input);
    const shallowSnapshot = this.sessionManager.addSnapshot(
      session.id,
      shallowResult,
      "shallow"
    );

    // Budget check after shallow pass
    const shallowStats = this.deriveStats(shallowResult, runStart);
    const shallowBudget = this.safetyProfile.enforceBudgets(shallowStats);
    if (!shallowBudget.ok) {
      const report = this.buildReport(session, shallowSnapshot);
      const envelope = this.buildEnvelope({
        runMeta,
        origin,
        metrics: shallowStats,
        outputs: report,
        risks: [
          `Budgets exceeded during shallow pass: ${shallowBudget.violations.join(", ")}`
        ]
      });
      return { report, envelope };
    }

    // Decide deep-pass candidates under budget
    const deepCandidates = this.selectDeepCandidates(shallowResult);
    const costScore = this.estimateCostScore(deepCandidates, shallowStats);
    const valueScore = this.estimateValueScore(deepCandidates);

    if (!this.safetyProfile.shouldEnterDeepPass(valueScore, costScore)) {
      const report = this.buildReport(session, shallowSnapshot);
      const envelope = this.buildEnvelope({
        runMeta,
        origin,
        metrics: shallowStats,
        outputs: report,
        risks: [
          "Deep pass skipped by ExcavationSafetyProfile based on value/cost tradeoff."
        ]
      });
      return { report, envelope };
    }

    // Deep pass
    const deepResult = this.buildExcavationResult(mode, input, {
      focus: deepCandidates
    });
    const deepSnapshot = this.sessionManager.addSnapshot(
      session.id,
      deepResult,
      "deep"
    );

    const scores = this.scoreEngine.scoreSnapshot(deepSnapshot);
    const fullStats = this.deriveStats(deepResult, runStart);
    fullStats.deepCandidates = deepCandidates.length;

    const fullBudget = this.safetyProfile.enforceBudgets(fullStats);
    const report = this.buildReport(session, deepSnapshot, scores);

    const risks = [];
    if (!fullBudget.ok) {
      risks.push(
        `Budgets exceeded during deep pass: ${fullBudget.violations.join(", ")}`
      );
    }

    const envelope = this.buildEnvelope({
      runMeta,
      origin,
      metrics: fullStats,
      outputs: report,
      risks
    });

    return { report, envelope };
  }

  buildExcavationResult(mode, input, options = {}) {
    if (mode === "json") {
      return this.excavator.excavate({ value: input, domRoot: null });
    }
    if (mode === "dom") {
      return this.excavator.excavate({
        value: null,
        domRoot: input.domRoot || null
      });
    }
    if (mode === "trace") {
      return this.excavator.excavate({ value: input, domRoot: null });
    }
    throw new Error(`Unsupported excavation mode: ${mode}`);
  }

  deriveStats(result, runStartMs) {
    const nodes =
      Array.isArray(result.domSheets) && result.domSheets.length > 0
        ? result.domSheets.reduce((acc, sheet) => acc + (sheet.nodeCount || 0), 0)
        : 0;

    const spans =
      Array.isArray(result.phantoms) && result.phantoms.length > 0
        ? result.phantoms.reduce((acc, phantom) => acc + (phantom.spanCount || 0), 0)
        : 0;

    const deepCandidates =
      Array.isArray(result.virtualObjects) ? result.virtualObjects.length : 0;

    const runSeconds = (Date.now() - runStartMs) / 1000;

    return {
      nodes,
      spans,
      deepCandidates,
      runSeconds
    };
  }

  selectDeepCandidates(result) {
    if (!Array.isArray(result.virtualObjects)) return [];
    const candidates = result.virtualObjects.filter((vo) => {
      if (typeof vo.stability === "number") {
        return vo.stability >= 0.4;
      }
      return true;
    });
    return candidates.slice(0, this.safetyProfile.deepPassBudget);
  }

  estimateCostScore(candidates, stats) {
    const nodePressure = Math.min(1, stats.nodes / this.safetyProfile.nodeBudget);
    const spanPressure = Math.min(1, stats.spans / this.safetyProfile.traceSpanBudget);
    const candidatePressure = Math.min(
      1,
      candidates.length / this.safetyProfile.deepPassBudget
    );
    return (nodePressure + spanPressure + candidatePressure) / 3;
  }

  estimateValueScore(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return 0;
    let score = 0;
    for (const vo of candidates) {
      let local = 0.4;
      if (typeof vo.stability === "number") {
        local += 0.3 * vo.stability;
      }
      if (typeof vo.novelty === "number") {
        local += 0.3 * vo.novelty;
      }
      score += Math.min(1, local);
    }
    return Math.min(1, score / candidates.length);
  }

  buildReport(session, snapshot, scores = []) {
    const summary = this.sessionManager.getSessionSummary(session.id);
    const virtualObjects = Array.isArray(snapshot.result.virtualObjects)
      ? snapshot.result.virtualObjects
      : [];

    let highConfidenceStable = 0;
    let quarantined = 0;

    for (const vo of virtualObjects) {
      const confidence = typeof vo.confidence === "number" ? vo.confidence : 0.0;
      const drift = typeof vo.drift === "number" ? vo.drift : 1.0;
      const classification = this.safetyProfile.classifyObject(confidence, drift);
      if (classification === "auto-use") highConfidenceStable += 1;
      if (classification === "quarantine") quarantined += 1;
    }

    return {
      sessionId: summary.id,
      createdAt: summary.createdAt,
      summary: summary.summary,
      snapshotLabel: snapshot.label,
      virtualObjectCount: virtualObjects.length,
      highConfidenceStable,
      quarantined,
      scores
    };
  }

  buildEnvelope({ runMeta, origin, metrics, outputs, risks }) {
    const envelope = createTransparencyEnvelope(
      {
        intent: runMeta.intent || "spectral-excavation",
        mode: runMeta.mode || runMeta.modeHint || "dom",
        javaspectreVersion: runMeta.javaspectreVersion || "0.1.0"
      },
      {
        domSourceType: origin.domSourceType || null,
        traceSourceType: origin.traceSourceType || null,
        harSourceType: origin.harSourceType || null,
        originHint: origin.originHint || null
      },
      {
        virtualObjectCount: outputs.virtualObjectCount,
        highConfidenceStable: outputs.highConfidenceStable,
        quarantined: outputs.quarantined,
        risksNoted: risks || [],
        assumptions: [
          "Run executed under ExcavationSafetyProfile constraints.",
          "Citizen consent and ALN policies were evaluated upstream."
        ],
        notes: outputs.summary ? [JSON.stringify(outputs.summary)] : []
      },
      this.safetyProfile,
      {
        nodesProcessed: metrics.nodes,
        spansProcessed: metrics.spans,
        deepPassObjects: metrics.deepCandidates || 0,
        runSeconds: metrics.runSeconds
      }
    );

    return envelope;
  }

  /**
   * Persist report and envelope next to input for audit and anchoring.
   */
  static persistRunArtifacts({ outputDir, report, envelope }) {
    const dir = outputDir || process.cwd();
    const reportPath = path.join(dir, ".javaspectre-excavation-report.json");
    const envelopePath = path.join(dir, ".javaspectre-transparency-envelope.json");

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    fs.writeFileSync(envelopePath, JSON.stringify(envelope, null, 2), "utf8");

    return { reportPath, envelopePath };
  }
}

export default SafetyWrappedExcavationRunner;
