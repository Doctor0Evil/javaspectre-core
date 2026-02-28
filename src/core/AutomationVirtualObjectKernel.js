// AutomationVirtualObjectKernel: unifies OTel spans, DOM sheets, JSON schemas,
// and Mermaid ASTs into a governed ClusterEnvelope with safety, drift, and anchoring.
//
// External dependencies are limited to Node stdlib; domain-specific engines
// (MermaidSafetyKernel, VirtualObjectExcavator, etc.) are injected.

import crypto from 'node:crypto';

export class AutomationVirtualObjectKernel {
  /**
   * @param {Object} options
   * @param {Object} options.persistence - SQLite-backed persistence adapter
   * @param {Function} options.spanIngestFn - async (runId, spansJson) => { spans, fsmVirtualObjects, drift }
   * @param {Function} options.domIngestFn - async (runId, domSnapshotJson) => { domSheets, drift }
   * @param {Function} options.schemaIngestFn - async (runId, harOrJsonArray) => { jsonSchemas, drift }
   * @param {Object} options.mermaidKernel - MermaidSafetyKernel instance
   * @param {Object} options.graphSafetyProfile - GraphSafetyProfile instance
   * @param {Object} options.excavationSafetyProfile - ExcavationSafetyProfile instance
   * @param {Object} options.anchorAdapters - { bostrom, evm, did }
   * @param {Object} options.logger - logger with info/warn/error
   */
  constructor(options) {
    this.persistence = options.persistence;
    this.spanIngestFn = options.spanIngestFn;
    this.domIngestFn = options.domIngestFn;
    this.schemaIngestFn = options.schemaIngestFn;
    this.mermaidKernel = options.mermaidKernel;
    this.graphSafetyProfile = options.graphSafetyProfile;
    this.excavationSafetyProfile = options.excavationSafetyProfile;
    this.anchorAdapters = options.anchorAdapters;
    this.logger = options.logger || console;

    // Drift thresholds for governed objects
    this.maxDriftAutoUse = 0.2;
    this.maxDriftWarn    = 0.3;
  }

  /**
   * Core entrypoint: ingests all modalities for a run, validates cross-modal
   * fidelity, enforces safety budgets, and optionally anchors results.
   *
   * @param {Object} params
   * @param {string} params.runId
   * @param {string} params.trustTier - 'T0' | 'T1' | 'T2'
   * @param {string} params.correlationId
   * @param {Array<Object>} params.spansJson
   * @param {Object|null} params.domSnapshotJson
   * @param {Array<Object>|null} params.harOrJsonArray
   * @param {string|null} params.mermaidSource
   * @param {Object} params.context - deviceClass, audience, consent, etc.
   * @returns {Promise<Object>} ClusterEnvelope with safety verdict and optional AnchorManifest
   */
  async processRun(params) {
    const {
      runId,
      trustTier,
      correlationId,
      spansJson,
      domSnapshotJson,
      harOrJsonArray,
      mermaidSource,
      context
    } = params;

    if (!runId) throw new Error('AutomationVirtualObjectKernel.processRun requires runId');
    if (!correlationId) throw new Error('AutomationVirtualObjectKernel.processRun requires correlationId');

    this.logger.info('avok.start', { runId, trustTier, correlationId });

    // 1. Ingest OpenTelemetry spans (authoritative source)
    const spanIngest = await this.spanIngestFn(runId, spansJson);
    const { spans, fsmVirtualObjects, drift: traceDrift } = spanIngest;

    if (!spans || spans.length === 0) {
      throw this._hardFail('no-spans', 'No spans ingested; T1/T2 cannot proceed without traces.', { runId });
    }

    // 2. Ingest DOM snapshot (optional but recommended for citizen-facing flows)
    let domIngest = { domSheets: [], drift: null };
    if (domSnapshotJson) {
      domIngest = await this.domIngestFn(runId, domSnapshotJson);
    }

    // 3. Ingest HAR / JSON for schema inference
    let schemaIngest = { jsonSchemas: [], drift: null };
    if (harOrJsonArray && harOrJsonArray.length > 0) {
      schemaIngest = await this.schemaIngestFn(runId, harOrJsonArray);
    }

    // 4. Mermaid policy / topology diagram (optional for T0, mandatory for T1/T2)
    let diagramResult = null;
    if (mermaidSource && mermaidSource.trim()) {
      diagramResult = await this.mermaidKernel.validateAndSealDiagram(runId, mermaidSource, {
        correlationId,
        trustTier,
        context
      });
      // diagramResult: { ast, summary, envelope } per MermaidSafetyKernel design
    }

    // 5. Build unified ClusterEnvelope
    const cluster = this._buildClusterEnvelope({
      runId,
      correlationId,
      trustTier,
      spans,
      fsmVirtualObjects,
      traceDrift,
      domSheets: domIngest.domSheets,
      domDrift: domIngest.drift,
      jsonSchemas: schemaIngest.jsonSchemas,
      schemaDrift: schemaIngest.drift,
      diagramAst: diagramResult ? diagramResult.ast : null,
      diagramSummary: diagramResult ? diagramResult.summary : null
    });

    // 6. Enforce cross-modal fidelity + drift thresholds
    const driftVerdict = this._evaluateDrift(cluster);
    if (driftVerdict.level === 'hard-fail') {
      throw this._hardFail('drift-exceeded', driftVerdict.reason, { runId, driftVerdict });
    }

    // 7. Enforce Structural budgets on the diagram AST (if present)
    const graphVerdict = this._evaluateGraphBudgets(cluster);
    if (!graphVerdict.ok) {
      if (trustTier === 'T0') {
        this.logger.warn('avok.graph-budgets-violated', { runId, violations: graphVerdict.violations });
      } else {
        throw this._hardFail('graph-budgets-violated', 'GraphSafetyProfile budgets violated.', {
          runId,
          violations: graphVerdict.violations
        });
      }
    }

    // 8. Check required motifs (safety, transparency, anchoring) in the diagram
    if (trustTier === 'T1' || trustTier === 'T2') {
      this._enforceCriticalMotifs(cluster);
    }

    // 9. Build ExcavationSafetyProfile snapshot + TransparencyEnvelope
    const safetySnapshot = this._snapshotExcavationSafetyProfile(context);
    const transparencyEnvelope = this._buildTransparencyEnvelope({
      runId,
      trustTier,
      cluster,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      diagramEnvelope: diagramResult ? diagramResult.envelope : null
    });

    // 10. For T1/T2, build and optionally publish AnchorManifest (multi-ledger)
    let anchorManifest = null;
    if (trustTier === 'T1' || trustTier === 'T2') {
      anchorManifest = await this._anchorTransparencyEnvelope(transparencyEnvelope, trustTier, context);
    }

    // 11. Persist everything into SQLite catalog
    await this._persistCluster({
      cluster,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      transparencyEnvelope,
      anchorManifest
    });

    const verdict = {
      runId,
      correlationId,
      trustTier,
      driftLevel: driftVerdict.level,
      graphTrustClass: graphVerdict.trustClass,
      anchored: !!anchorManifest,
      anchorManifestId: anchorManifest ? anchorManifest.manifestId : null
    };

    this.logger.info('avok.complete', verdict);

    return {
      ...cluster,
      safetySnapshot,
      transparencyEnvelope,
      anchorManifest,
      verdict
    };
  }

  // ---------------------------
  // Cluster construction
  // ---------------------------

  _buildClusterEnvelope(input) {
    const {
      runId,
      correlationId,
      trustTier,
      spans,
      fsmVirtualObjects,
      traceDrift,
      domSheets,
      domDrift,
      jsonSchemas,
      schemaDrift,
      diagramAst,
      diagramSummary
    } = input;

    const drift = {
      trace: traceDrift || null,
      dom: domDrift || null,
      json: schemaDrift || null,
      diagram: diagramSummary?.drift ?? null
    };

    const clusterId = `${runId}:${correlationId}`;

    return {
      clusterId,
      runId,
      correlationId,
      trustTier,
      spans,
      fsmVirtualObjects,
      domSheets,
      jsonSchemas,
      diagramAst,
      diagramSummary,
      drift
    };
  }

  // ---------------------------
  // Drift and safety thresholds
  // ---------------------------

  _evaluateDrift(cluster) {
    const { drift, trustTier } = cluster;
    const violations = [];

    const check = (name, value) => {
      if (value == null) return;
      if (value > this.maxDriftWarn) {
        violations.push({ modality: name, level: 'hard-fail', value });
      } else if (value > this.maxDriftAutoUse) {
        violations.push({ modality: name, level: 'warn', value });
      }
    };

    check('trace', drift.trace);
    check('dom', drift.dom);
    check('json', drift.json);
    check('diagram', drift.diagram);

    if (violations.length === 0) {
      return { level: 'ok', reason: 'All drift within auto-use thresholds.', violations: [] };
    }

    const hard = violations.filter(v => v.level === 'hard-fail');
    if (hard.length > 0 && (trustTier === 'T1' || trustTier === 'T2')) {
      return {
        level: 'hard-fail',
        reason: 'One or more governed modalities exceeded max drift.',
        violations
      };
    }

    return {
      level: 'warn',
      reason: 'Some modalities exceeded auto-use drift but are within soft limits.',
      violations
    };
  }

  // ---------------------------
  // Graph safety / structural budgets
  // ---------------------------

  _evaluateGraphBudgets(cluster) {
    const { diagramAst } = cluster;
    if (!diagramAst) {
      return {
        ok: true,
        trustClass: 'no-diagram',
        violations: []
      };
    }

    // graphSafetyProfile.enforceBudgets expects an AST summary; we reuse diagramSummary if present.
    const summary = cluster.diagramSummary || this._computeAstSummary(diagramAst);
    try {
      this.graphSafetyProfile.enforceBudgets(summary);
      return {
        ok: true,
        trustClass: summary.trustClass || 'auto-use',
        violations: []
      };
    } catch (err) {
      return {
        ok: false,
        trustClass: 'quarantine',
        violations: err.violations || [{ kind: 'graph-budget-error', message: String(err.message) }]
      };
    }
  }

  _computeAstSummary(ast) {
    // Fallback summary if MermaidSafetyKernel did not provide one.
    const nodes = ast.nodes || [];
    const edges = ast.edges || [];
    const subgraphs = ast.subgraphs || [];
    const N = nodes.length;
    const E = edges.length;
    const density = N > 1 ? (2 * E) / (N * (N - 1)) : 0;

    return {
      nodeCount: N,
      edgeCount: E,
      subgraphCount: subgraphs.length,
      edgeDensity: density,
      maxDepthObserved: ast.maxDepthObserved ?? null,
      trustClass: 'unknown'
    };
    // GraphSafetyProfile will apply actual limits.
  }

  // ---------------------------
  // Critical motif enforcement
  // ---------------------------

  _enforceCriticalMotifs(cluster) {
    const { diagramAst, trustTier } = cluster;
    if (!diagramAst) {
      throw this._hardFail('diagram-missing', 'T1/T2 runs require a Mermaid policy diagram.', { trustTier });
    }

    const nodes = diagramAst.nodes || [];
    const edges = diagramAst.edges || [];

    const hasKind = (predicate) => nodes.some(predicate);

    const hasSafetyProfile = hasKind(n => (n.meta?.policyKind === 'ExcavationSafetyProfile'));
    const hasTransparencyEnvelope = hasKind(n => (n.meta?.voKind === 'TransparencyEnvelope' || n.meta?.kind === 'envelope'));
    const hasAnchorManifest = hasKind(n => (n.meta?.voKind === 'AnchorManifest' || n.meta?.kind === 'anchor'));

    if (!hasSafetyProfile) {
      throw this._hardFail('motif-missing', 'Diagram lacks ExcavationSafetyProfile node required for governed runs.', {});
    }
    if (!hasTransparencyEnvelope) {
      throw this._hardFail('motif-missing', 'Diagram lacks TransparencyEnvelope node required for governed runs.', {});
    }
    if (!hasAnchorManifest) {
      throw this._hardFail('motif-missing', 'Diagram lacks AnchorManifest node required for multi-ledger anchoring.', {});
    }

    // Verify there is at least one path env -> anchor
    const envelopeIds = nodes
      .filter(n => (n.meta?.voKind === 'TransparencyEnvelope' || n.meta?.kind === 'envelope'))
      .map(n => n.id);

    const anchorIds = nodes
      .filter(n => (n.meta?.voKind === 'AnchorManifest' || n.meta?.kind === 'anchor'))
      .map(n => n.id);

    const adjacency = new Map();
    for (const e of edges) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      adjacency.get(e.from).push(e.to);
    }

    const reachableAnchor = (startIds) => {
      const seen = new Set();
      const stack = [...startIds];
      while (stack.length) {
        const cur = stack.pop();
        if (anchorIds.includes(cur)) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        const next = adjacency.get(cur) || [];
        next.forEach(n => stack.push(n));
      }
      return false;
    };

    if (!reachableAnchor(envelopeIds)) {
      throw this._hardFail(
        'motif-disconnected',
        'No path from TransparencyEnvelope to AnchorManifest in diagram; anchoring topology is invalid.',
        {}
      );
    }
  }

  // ---------------------------
  // Safety profile snapshot
  // ---------------------------

  _snapshotExcavationSafetyProfile(context) {
    const profile = this.excavationSafetyProfile;
    const snapshot = {
      name: profile.profileName || 'default',
      budgets: {
        nodeBudget: profile.nodeBudget,
        traceSpanBudget: profile.traceSpanBudget,
        deepPassBudget: profile.deepPassBudget,
        maxRunSeconds: profile.maxRunSeconds
      },
      trust: {
        minConfidenceForAutoUse: profile.minConfidenceForAutoUse,
        minConfidenceForDisplay: profile.minConfidenceForDisplay,
        maxDriftForAutoUse: profile.maxDriftForAutoUse,
        maxDriftForCitizenUI: profile.maxDriftForCitizenUI
      },
      redaction: profile.redaction || { redactPatterns: [] },
      context: {
        role: context.role || 'citizen',
        deviceClass: context.deviceClass || 'edge-unknown',
        networkTrust: context.networkTrust || 'unknown',
        consentLevel: context.consentLevel || 'minimal',
        locationHint: context.locationHint || null
      },
      capturedAtIso: new Date().toISOString()
    };
    return snapshot;
  }

  // ---------------------------
  // TransparencyEnvelope builder
  // ---------------------------

  _buildTransparencyEnvelope(params) {
    const {
      runId,
      trustTier,
      cluster,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      diagramEnvelope
    } = params;

    const content = {
      runId,
      trustTier,
      clusterId: cluster.clusterId,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      modalities: {
        spansCount: cluster.spans.length,
        fsmCount: cluster.fsmVirtualObjects.length,
        domSheetsCount: cluster.domSheets.length,
        jsonSchemasCount: cluster.jsonSchemas.length,
        hasDiagram: !!cluster.diagramAst
      },
      diagramEnvelope: diagramEnvelope || null
    };

    const contentJson = JSON.stringify(content);
    const contentHash = crypto.createHash('sha256').update(contentJson).digest('hex');

    return {
      kind: 'TransparencyEnvelope',
      runId,
      trustTier,
      clusterId: cluster.clusterId,
      contentHash,
      payload: content,
      createdAtIso: new Date().toISOString()
    };
  }

  // ---------------------------
  // AnchorManifest builder + multi-ledger anchoring
  // ---------------------------

  async _anchorTransparencyEnvelope(envelope, trustTier, context) {
    const manifestId = crypto.randomUUID();
    const commitments = [];

    // Bostrom is home chain
    if (this.anchorAdapters.bostrom) {
      const tx = await this.anchorAdapters.bostrom.anchorHash(envelope.contentHash, {
        manifestId,
        trustTier,
        context
      });
      commitments.push({
        chain: 'bostrom',
        txId: tx.txId,
        height: tx.height
      });
    }

    // EVM
    if (this.anchorAdapters.evm) {
      const tx = await this.anchorAdapters.evm.anchorHash(envelope.contentHash, {
        manifestId,
        trustTier,
        context
      });
      commitments.push({
        chain: 'evm',
        txId: tx.txId,
        blockNumber: tx.blockNumber
      });
    }

    // DID or other identity-oriented ledger
    if (this.anchorAdapters.did) {
      const tx = await this.anchorAdapters.did.anchorHash(envelope.contentHash, {
        manifestId,
        trustTier,
        context
      });
      commitments.push({
        chain: 'did',
        docId: tx.docId,
        version: tx.version
      });
    }

    if (commitments.length === 0) {
      throw this._hardFail('anchoring-unavailable', 'No anchor adapters configured for T1/T2 run.', {});
    }

    const manifest = {
      kind: 'AnchorManifest',
      manifestId,
      contentHash: envelope.contentHash,
      runId: envelope.runId,
      homeChain: 'bostrom',
      did: context.did || null,
      trustTier,
      commitments,
      createdAtIso: new Date().toISOString()
    };

    return manifest;
  }

  // ---------------------------
  // Persistence
  // ---------------------------

  async _persistCluster(payload) {
    const {
      cluster,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      transparencyEnvelope,
      anchorManifest
    } = payload;

    // Assumes Persistence exposes suitable methods; you can map directly
    // to your existing spans / domsheets / jsonschemas / snapshotsv1 tables.[file:3]
    const db = this.persistence;

    await db.saveRunCluster({
      runId: cluster.runId,
      correlationId: cluster.correlationId,
      trustTier: cluster.trustTier,
      clusterJson: cluster,
      driftVerdict,
      graphVerdict,
      safetySnapshot,
      transparencyEnvelope,
      anchorManifest
    });
  }

  // ---------------------------
  // Error helper
  // ---------------------------

  _hardFail(code, message, extra) {
    const err = new Error(message);
    err.code = code;
    err.extra = extra;
    return err;
  }
}

export default AutomationVirtualObjectKernel;
