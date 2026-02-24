// High-level orchestrator that unifies excavation, safety, transparency, and anchoring.

import { v4 as uuidv4 } from "uuid";
import VirtualObjectExcavator from "./VirtualObjectExcavator.js";
import ExcavationSessionManager from "./ExcavationSessionManager.js";
import VirtualObjectScoreEngine from "./VirtualObjectScoreEngine.js";
import { ExcavationSafetyProfile, createTransparencyEnvelope } from "./SafetyAndTransparencyKernel.js";
import AnchorManifest from "../anchoring/AnchorManifest.js";
import { AnchorRouter } from "../anchoring/AnchorRouter.js";
import { CatalogStore } from "../persistence/CatalogStore.js";

export class SpectralExcavationOrchestrator {
  constructor(options = {}) {
    this.maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : 6;
    this.did = options.did || null;
    this.nodeId = options.nodeId || null;
    this.anchorRouter = options.anchorRouter || new AnchorRouter({});
    this.catalogStore = options.catalogStore || new CatalogStore({});
  }

  createSafetyProfile(context) {
    const profileName = context?.profileName || "default-conservative";
    const profile = new ExcavationSafetyProfile({
      profileName,
      nodeBudget: context?.nodeBudget ?? 20000,
      traceSpanBudget: context?.traceSpanBudget ?? 50000,
      deepPassBudget: context?.deepPassBudget ?? 2000,
      maxRunSeconds: context?.maxRunSeconds ?? 15,
      context: {
        role: context?.role || "citizen",
        deviceClass: context?.deviceClass || "edge-unknown",
        networkTrust: context?.networkTrust || "unknown",
        consentLevel: context?.consentLevel || "minimal",
        locationHint: context?.locationHint || null
      }
    });
    return profile;
  }

  async excavate({ mode, value, domRoot, traceData, context }) {
    const runId = context?.runId || uuidv4();
    const intent = context?.intent || `spectral-excavation-${mode || "unknown"}`;
    const safetyProfile = this.createSafetyProfile(context?.safety || {});
    const sessionManager = new ExcavationSessionManager({
      maxDepth: this.maxDepth,
      maxSnapshots: 20
    });
    const scoreEngine = new VirtualObjectScoreEngine({ historyWindow: 10 });
    const excavator = new VirtualObjectExcavator({
      maxDepth: this.maxDepth,
      maxArraySample: 16,
      includeDom: mode === "dom",
      includeFunctions: false
    });

    const session = sessionManager.startSession(runId, {
      mode,
      nodeId: this.nodeId,
      did: this.did,
      safetyProfile: safetyProfile.profileName
    });

    const startedAt = process.hrtime.bigint();

    // Shallow pass
    let shallowResult;
    if (mode === "json") {
      shallowResult = excavator.excavate({ value, domRoot: null });
    } else if (mode === "dom") {
      shallowResult = excavator.excavate({ value, domRoot: domRoot || null });
    } else if (mode === "trace") {
      // Expect traceData already normalized into a value-like structure
      shallowResult = excavator.excavate({ value: traceData, domRoot: null });
    } else {
      shallowResult = excavator.excavate({ value, domRoot: null });
    }

    const snapShallow = sessionManager.addSnapshot(session.id, shallowResult, "shallow");

    // Decide if deep pass should run
    const estimatedValueScore = 0.7;
    const costScore = 0.3;
    let deepResult = null;
    let snapDeep = null;
    if (safetyProfile.shouldEnterDeepPass(estimatedValueScore, costScore)) {
      deepResult = excavator.excavate({ value, domRoot: mode === "dom" ? domRoot || null : null });
      snapDeep = sessionManager.addSnapshot(session.id, deepResult, "deep");
    }

    const endedAt = process.hrtime.bigint();
    const runSeconds = Number(endedAt - startedAt) / 1e9;

    // Compute stats for budgets
    const nodesProcessed =
      shallowResult.virtualObjects.length +
      (deepResult ? deepResult.virtualObjects.length : 0);
    const spansProcessed = mode === "trace" ? (traceData?.length || 0) : 0;
    const deepPassObjects = deepResult ? deepResult.virtualObjects.length : 0;

    safetyProfile.enforceBudgets({
      nodesProcessed,
      spansProcessed,
      deepPassObjects,
      runSeconds
    });

    // Score and classify objects from the deepest available snapshot
    const targetSnapshot = snapDeep || snapShallow;
    const scored = scoreEngine.scoreSnapshot(targetSnapshot);

    const classified = scored.map((entry) => {
      const confidence = entry.stability;
      const drift = 1 - entry.novelty;
      const trust = safetyProfile.classifyObject({
        id: entry.id,
        confidence,
        drift,
        kind: entry.category,
        evidenceCount: entry.evidenceCount || 0
      });
      return {
        id: entry.id,
        category: entry.category,
        stability: entry.stability,
        novelty: entry.novelty,
        reuseHint: entry.reuseHint,
        confidence,
        drift,
        trustTier: trust.tier,
        trustRationale: trust.rationale,
        trustFlags: trust.flags
      };
    });

    // Persist catalog entities
    await this.catalogStore.saveRun({
      runId,
      mode,
      did: this.did,
      nodeId: this.nodeId,
      session,
      shallowResult,
      deepResult,
      classified
    });

    const inputsSummary = {
      mode,
      nodeId: this.nodeId,
      did: this.did,
      originHint: context?.originHint || null
    };

    const outputsSummary = {
      virtualObjects: classified.length,
      autoUse: classified.filter((c) => c.trustTier === "auto-use").length,
      quarantined: classified.filter((c) => c.trustTier === "quarantine").length
    };

    const metrics = {
      nodesProcessed,
      spansProcessed,
      deepPassObjects,
      runSeconds
    };

    const envMeta = {
      javaspectreVersion: context?.javaspectreVersion || "0.1.0"
    };

    const envelope = createTransparencyEnvelope(
      runId,
      intent,
      mode,
      safetyProfile,
      inputsSummary,
      metrics,
      outputsSummary,
      context?.risksNoted || [],
      context?.assumptions || [],
      context?.notes || [],
      envMeta
    );

    await this.catalogStore.saveTransparencyEnvelope(envelope);

    // Build and optionally anchor a manifest
    const manifest = new AnchorManifest(
      runId,
      envelope,
      this.did,
      safetyProfile,
      {
        nodeId: this.nodeId,
        mode,
        origin: context?.originHint || null
      },
      {
        planId: context?.alnPlanId || null,
        modelId: context?.alnModelId || null
      },
      {
        nanoVolume: nodesProcessed + spansProcessed,
        avgStability: classified.length
          ? classified.reduce((acc, c) => acc + c.stability, 0) / classified.length
          : 0
      }
    );

    if (context?.anchor === true) {
      const commitments = await this.anchorRouter.anchorManifest(manifest);
      commitments.forEach((c) => manifest.addCommitment(c));
      await this.catalogStore.updateAnchorCommitments(manifest);
    }

    return {
      runId,
      sessionSummary: sessionManager.getSessionSummary(session.id),
      objects: classified,
      transparencyEnvelope: envelope,
      anchorManifest: manifest.toJSON()
    };
  }
}

export default SpectralExcavationOrchestrator;
