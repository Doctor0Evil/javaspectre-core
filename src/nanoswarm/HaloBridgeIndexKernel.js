// Connects NanoData (NanoVolume + stability/drift) through a safety halo
// into nanoswarm_indexes suitable for ALN queries and anchoring.

import ExcavationSafetyProfile from '../coreSafetyAndTransparencyKernel.js'; // file:19

export class HaloBridgeIndexKernel {
  constructor(options) {
    this.profile = new ExcavationSafetyProfile({
      profileName: options?.profileName ?? 'nanoswarm-default',
      nodeBudget: options?.nodeBudget ?? 20000,
      traceSpanBudget: options?.traceSpanBudget ?? 50000,
      deepPassBudget: options?.deepPassBudget ?? 2000,
      maxRunSeconds: options?.maxRunSeconds ?? 15,
      context: {
        role: options?.role ?? 'citizen',
        deviceClass: options?.deviceClass ?? 'edge-unknown',
        networkTrust: options?.networkTrust ?? 'unknown',
        consentLevel: options?.consentLevel ?? 'minimal',
        locationHint: options?.locationHint ?? null
      }
    });
  }

  /**
   * Accept raw nanoswarm metrics for a window and emit indexable entries.
   *
   * @param {Object} windowMetrics
   *  {
   *    runId,
   *    windowId,
   *    nanoVolume,        // Vnano,window from NanoScript [file:20]
   *    dom: { stability, drift, nodeCount },
   *    json: { stability, drift },
   *    trace: { stability, drift },
   *    motifs: [ { id, category, stability, novelty, reuseHint } ]
   *  }
   * @returns {Object} { indexEntries, violations }
   */
  bridgeToIndex(windowMetrics) {
    const stats = {
      nodesProcessed: windowMetrics.dom?.nodeCount ?? 0,
      spansProcessed: windowMetrics.trace?.spanCount ?? 0,
      deepPassObjects: windowMetrics.motifs?.length ?? 0
    };

    // Enforce global Nano budgets before indexing. [file:19]
    this.profile.enforceBudgets(stats);

    const indexEntries = [];
    const violations = [];

    for (const motif of windowMetrics.motifs ?? []) {
      const confidence = motif.stability;          // reuse stability as confidence proxy [file:20]
      const drift = 1 - motif.novelty;             // invert novelty ~ drift [file:20]
      const trust = this.profile.classifyObject({
        id: motif.id,
        confidence,
        drift,
        kind: motif.category
      });

      // Only index auto-use and show-with-warning; quarantine stays local. [file:19]
      if (trust.tier === 'quarantine') {
        violations.push({
          motifId: motif.id,
          reason: 'quarantined-by-halo-bridge',
          confidence,
          drift
        });
        continue;
      }

      indexEntries.push({
        indexKey: motif.id,
        category: motif.category,
        trustTier: trust.tier,
        nanoVolume: windowMetrics.nanoVolume,
        stability: motif.stability,
        novelty: motif.novelty,
        reuseHint: motif.reuseHint,
        domStability: windowMetrics.dom?.stability ?? null,
        jsonStability: windowMetrics.json?.stability ?? null,
        traceStability: windowMetrics.trace?.stability ?? null,
        runId: windowMetrics.runId,
        windowId: windowMetrics.windowId,
        profileName: this.profile.profileName,
        context: this.profile.context
      });
    }

    return { indexEntries, violations };
  }
}

export default HaloBridgeIndexKernel;
