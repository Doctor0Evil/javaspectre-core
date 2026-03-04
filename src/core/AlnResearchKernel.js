// ALN–Blockchain research kernel for Javaspectre chat.
// Orchestrates excavation, scoring, safety, and multi-ledger anchoring
// for each research-style chat turn.

import crypto from 'node:crypto';
import VirtualObjectExcavator from './VirtualObjectExcavator.js';          // file:21
import ExcavationSessionManager from './ExcavationSessionManager.js';      // file:20
import VirtualObjectScoreEngine from './VirtualObjectScoreEngine.js';      // file:20
import { createTransparencyEnvelope } from '../safety/TransparencyEnvelope.js'; // file:19
import ExcavationSafetyProfile from '../safety/ExcavationSafetyProfile.js';     // file:19
import AnchoringService from '../anchoring/AnchoringService.js';                // file:19

export class AlnResearchKernel {
  constructor(options) {
    this.excavator = new VirtualObjectExcavator({
      maxDepth: typeof options?.maxDepth === 'number' ? options.maxDepth : 6,
      maxArraySample: typeof options?.maxArraySample === 'number' ? options.maxArraySample : 8,
      includeDom: !!options?.includeDom
    });

    this.sessionManager = new ExcavationSessionManager({
      maxDepth: 6,
      maxSnapshots: 5
    });

    this.scoreEngine = new VirtualObjectScoreEngine({
      historyWindow: 20
    });

    // Safety profile for research actions (mirrors ExcavationSafetyProfile).
    this.safetyProfile = new ExcavationSafetyProfile({
      profileName: options?.safetyProfileName ?? 'chat-research-default',
      nodeBudget: options?.nodeBudget ?? 20000,
      traceSpanBudget: options?.traceSpanBudget ?? 50000,
      deepPassBudget: options?.deepPassBudget ?? 2000,
      maxRunSeconds: options?.maxRunSeconds ?? 15,
      minConfidenceForAutoUse: options?.minConfidenceForAutoUse ?? 0.85,
      minConfidenceForDisplay: options?.minConfidenceForDisplay ?? 0.4,
      maxDriftForAutoUse: options?.maxDriftForAutoUse ?? 0.2,
      maxDriftForCitizenUI: options?.maxDriftForCitizenUI ?? 0.6
    });

    this.anchoringService = new AnchoringService({
      bostrom: {
        rpcUrl: options?.bostromRpcUrl ?? 'https://lcd.bostrom.cybernode.ai',
        fromAddress: options?.bostromFromAddress ??
          'bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7'
      },
      evm: {
        enabled: !!options?.evmEnabled,
        rpcUrl: options?.evmRpcUrl ?? null,
        contractAddress: options?.evmContractAddress ?? null,
        fromAddress: options?.evmFromAddress ??
          '0x519fC0eB4111323Cac44b70e1aE31c30e405802D'
      },
      did: {
        enabled: !!options?.didEnabled,
        didController: options?.didController ?? null,
        ionEndpoint: options?.ionEndpoint ?? null
      }
    });

    this.environment = {
      javaspectreVersion: options?.javaspectreVersion ?? '0.2.0',
      nodeVersion: process.version
    };
  }

  /**
   * Main entrypoint for a research-style chat turn.
   *
   * @param {Object} params
   * @param {string} params.intent - Natural language description of the research task.
   * @param {string} params.mode   - 'json' | 'dom' | 'trace' | 'mixed'.
   * @param {any}    params.input  - Raw data (JSON object, DOM snapshot, trace log, etc.).
   * @param {Object} params.userContext - { did, role, device, consentScope }
   * @param {Object} params.alnContext  - { planId, modelId, assumptions }
   * @returns {Promise<Object>} ResearchResult
   */
  async runResearchTurn(params) {
    const {
      intent,
      mode,
      input,
      userContext,
      alnContext
    } = params;

    if (!intent || typeof intent !== 'string') {
      throw new Error('AlnResearchKernel.runResearchTurn requires an intent string.');
    }
    if (!mode) {
      throw new Error('AlnResearchKernel.runResearchTurn requires a mode.');
    }

    const runId = this._generateRunId(intent, mode);
    const sessionId = `${mode}:${runId}`;
    const session = this.sessionManager.startSession(sessionId, {
      mode,
      intent,
      userDid: userContext?.did ?? null,
      userRole: userContext?.role ?? 'citizen',
      device: userContext?.device ?? 'unknown',
      consentScope: userContext?.consentScope ?? 'unspecified'
    });

    // 1. Shallow pass for low-cost overview.
    const shallowResult = this._buildExcavationResult(mode, input);
    const shallowStats = this._statsFromExcavation(shallowResult);
    this.safetyProfile.enforceBudgets(shallowStats); // hard caps.[file:19]
    const shallowSnapshot = this.sessionManager.addSnapshot(
      session.id,
      shallowResult,
      'shallow'
    );

    // 2. Heuristic: decide if deep pass is allowed by safety profile.
    const allowDeep = this.safetyProfile.shouldEnterDeepPass({
      nodeCount: shallowStats.nodeCount,
      virtualObjectCount: shallowResult.virtualObjects.length,
      mode
    });

    let deepSnapshot = null;
    let scores = [];

    if (allowDeep) {
      const deepResult = this._buildExcavationResult(mode, input);
      const deepStats = this._statsFromExcavation(deepResult);
      this.safetyProfile.enforceBudgets(deepStats);
      deepSnapshot = this.sessionManager.addSnapshot(
        session.id,
        deepResult,
        'deep'
      );
      scores = this.scoreEngine.scoreSnapshot(deepSnapshot); // stability/novelty/reuse.[file:20]
    }

    const summary = this.sessionManager.getSessionSummary(session.id);
    const metrics = this._buildMetrics(shallowSnapshot, deepSnapshot);
    const outputsSummary = this._buildOutputsSummary(deepSnapshot ?? shallowSnapshot, scores);

    // 3. Build TransparencyEnvelope.[file:19]
    const envelope = createTransparencyEnvelope({
      runId,
      intent,
      mode,
      safetyProfile: this.safetyProfile.toJSON(),
      inputsSummary: {
        origin: mode,
        hints: {
          sourceKind: typeof input,
          userRole: userContext?.role ?? 'citizen'
        }
      },
      metrics,
      outputsSummary,
      environment: this.environment,
      notes: [
        'Generated from Javaspectre ALN research kernel.',
        deepSnapshot ? 'Deep pass executed.' : 'Deep pass skipped by safety policy.'
      ]
    });

    // 4. Multi-ledger anchoring: AnchorManifest + adapters.[file:19]
    const deviceContext = {
      kind: userContext?.device ?? 'unknown',
      region: userContext?.region ?? null
    };
    const nanoMetrics = this._estimateNanoMetrics(summary, metrics);
    const manifest = this.anchoringService.createManifest(
      { runId, did: userContext?.did ?? null },
      envelope,
      this.safetyProfile,
      deviceContext,
      alnContext ?? null,
      nanoMetrics
    );
    const anchoredManifest = await this.anchoringService.anchorManifest(manifest);

    // 5. Build research summary for the chat model.
    const researchSummary = this._buildResearchSummary({
      runId,
      intent,
      mode,
      summary,
      scores,
      outputsSummary,
      envelope,
      anchorManifest: anchoredManifest
    });

    return {
      runId,
      mode,
      summary,
      scores,
      envelope,
      anchorManifest: anchoredManifest,
      researchSummary
    };
  }

  _buildExcavationResult(mode, input) {
    if (mode === 'json') {
      return this.excavator.excavate({ value: input, domRoot: null });
    }
    if (mode === 'dom') {
      // Expect input to be a DOM-like snapshot structure compatible with VirtualObjectExcavator.[file:20]
      return this.excavator.excavate({ value: null, domRoot: input });
    }
    if (mode === 'trace') {
      // For traces, we treat the trace log as the value and may extend with PhantomDetector later.[file:20]
      return this.excavator.excavate({ value: input, domRoot: null });
    }
    if (mode === 'mixed') {
      // Minimal mixed-mode: excavate JSON part now; DOM/trace can be layered later.
      return this.excavator.excavate({ value: input, domRoot: null });
    }
    throw new Error(`Unsupported research mode: ${mode}`);
  }

  _statsFromExcavation(result) {
    const nodeCount = Array.isArray(result.domSheets)
      ? result.domSheets.reduce((acc, sheet) => acc + (sheet.totalNodes ?? 0), 0)
      : 0;
    return {
      nodeCount,
      traceSpanCount: Array.isArray(result.traceSpans)
        ? result.traceSpans.length
        : 0,
      deepPassObjects: Array.isArray(result.virtualObjects)
        ? result.virtualObjects.length
        : 0
    };
  }

  _buildMetrics(shallowSnapshot, deepSnapshot) {
    const base = {
      nodesProcessed: shallowSnapshot.metrics?.domSheets ?? 0,
      virtualObjectsShallow: shallowSnapshot.metrics?.virtualObjects ?? 0,
      relationshipsShallow: shallowSnapshot.metrics?.relationships ?? 0,
      deepObjects: 0,
      deepRelationships: 0,
      runtimeSeconds: null
    };

    if (deepSnapshot) {
      base.deepObjects = deepSnapshot.metrics?.virtualObjects ?? 0;
      base.deepRelationships = deepSnapshot.metrics?.relationships ?? 0;
    }

    return base;
  }

  _buildOutputsSummary(snapshot, scores) {
    const totalVirtualObjects = snapshot.metrics?.virtualObjects ?? 0;
    const byCategory = {};
    const highConfidence = [];
    const quarantined = [];

    for (const s of scores) {
      const category = s.category ?? 'unknown';
      byCategory[category] = (byCategory[category] ?? 0) + 1;

      const autoUse = this.safetyProfile.classifyObject({
        confidence: s.stability,
        drift: 1 - s.novelty
      }); // reuses profile thresholds.[file:19]

      if (autoUse.tier === 'auto-use') {
        highConfidence.push({
          id: s.id,
          category,
          stability: s.stability,
          novelty: s.novelty,
          reuseHint: s.reuseHint
        });
      } else if (autoUse.tier === 'quarantine') {
        quarantined.push({
          id: s.id,
          category,
          stability: s.stability,
          novelty: s.novelty
        });
      }
    }

    return {
      totalVirtualObjects,
      byCategory,
      highConfidence,
      quarantined
    };
  }

  _estimateNanoMetrics(summary, metrics) {
    // Lightweight NanoData-style approximation based on virtual object counts.[file:20]
    const totalVO = summary.summary?.totalVirtualObjects ?? summary.summary.totalVirtualObjects;
    const totalRel = summary.summary?.totalRelationships ?? summary.summary.totalRelationships;
    const domSheets = summary.summary?.domSheets ?? summary.summary.domSheets;

    return {
      virtualObjectCount: totalVO,
      relationshipCount: totalRel,
      domSheetCount: domSheets,
      approxNanoVolume: totalVO * 64 + totalRel * 32 + domSheets * 128
    };
  }

  _buildResearchSummary(payload) {
    const {
      runId,
      intent,
      mode,
      summary,
      scores,
      outputsSummary,
      envelope,
      anchorManifest
    } = payload;

    // This is the compact object your chat layer can feed to the LLM.
    return {
      runId,
      intent,
      mode,
      stats: {
        totalVirtualObjects: summary.summary.totalVirtualObjects,
        totalRelationships: summary.summary.totalRelationships,
        domSheets: summary.summary.domSheets
      },
      objects: {
        highConfidence: outputsSummary.highConfidence.slice(0, 32),
        quarantined: outputsSummary.quarantined.slice(0, 32)
      },
      safety: {
        profileName: this.safetyProfile.profileName,
        autoUseThresholds: {
          minConfidence: this.safetyProfile.minConfidenceForAutoUse,
          maxDrift: this.safetyProfile.maxDriftForAutoUse
        }
      },
      transparency: {
        envelopeHash: envelope.contentHash,
        createdAt: envelope.timestamp,
        policyProfile: envelope.safetyProfile?.profileName ?? null
      },
      anchoring: {
        manifestId: anchorManifest.manifestId,
        commitments: anchorManifest.commitments
      }
    };
  }

  _generateRunId(intent, mode) {
    const h = crypto.createHash('sha256');
    h.update(`${Date.now()}:${mode}:${intent.slice(0, 128)}`);
    return h.digest('hex').slice(0, 32);
  }
}

export default AlnResearchKernel;
