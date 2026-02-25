/**
 * QuantifiedNeuroConsentFeatures
 *
 * Maps EEG/BCI events plus consent scope and predicate flags into
 * compact, ML-ready feature objects. This module assumes an upstream
 * microspace observer (or equivalent) has already produced PredicateFlags
 * like CALMSTABLE, OVERLOADED, RECOVERY, UNFAIRDRAIN and that a
 * TransparencyEnvelope-like run summary exists for each session.
 *
 * It does not perform any actuation. It only computes observer-side
 * features suitable for training and evaluation.
 */

export class QuantifiedNeuroConsentFeatures {
  constructor(options = {}) {
    this.version = "1.0.0";
    this.defaultEpochSeconds = options.defaultEpochSeconds ?? 30;
  }

  /**
   * Build ML-ready features for a single neuro-consent run.
   *
   * @param {Object} params
   * @param {Object} params.envelope Transparency-style run envelope
   * @param {Array}  params.events   Array of EEG/BCI events
   * @param {Array}  params.predicates Array of predicate snapshots:
   *                    { timestamp, flags: { calmstable, overloaded, recovery, unfairdrain } }
   * @param {Object} params.consentScope Consent metadata:
   *                    { scopeId, mode, channel, dataTypes[], durationSec, hasRevocationPath, jurisdiction }
   * @param {Object} params.reputation Optional reputation vector:
   *                    { privacy, compliance, ecoalign, clintrust, mpscore }
   * @returns {Object} ML feature object
   */
  toNeuroConsentRunFeatures(params) {
    const {
      envelope,
      events,
      predicates,
      consentScope,
      reputation
    } = params;

    if (!envelope || !envelope.runId) {
      throw new Error("QuantifiedNeuroConsentFeatures.toNeuroConsentRunFeatures requires a run envelope with runId");
    }
    if (!Array.isArray(events)) {
      throw new Error("QuantifiedNeuroConsentFeatures.toNeuroConsentRunFeatures requires events[]");
    }

    const metrics = envelope.metrics || {};
    const runMeta = envelope.runMeta || {};
    const safety = envelope.safetyProfile || {};
    const scope = consentScope || {};

    const stats = this._computeEventStats(events);
    const predStats = this._computePredicateStats(predicates || []);
    const epochStats = this._computeEpochStats(events, envelope.timestamp);

    const rep = reputation || {
      privacy: null,
      compliance: null,
      ecoalign: null,
      clintrust: null,
      mpscore: null
    };

    return {
      schemaVersion: this.version,
      runId: envelope.runId,
      timestamp: envelope.timestamp,
      mode: runMeta.mode ?? "neuro-consent",
      intent: runMeta.intent ?? "unspecified",

      consent: {
        scopeId: scope.scopeId ?? null,
        mode: scope.mode ?? null, // e.g., "sleep-study", "bci-clinical", "bci-consumer"
        channel: scope.channel ?? null, // "EEG", "BCI", "EEG+BCI"
        dataTypes: Array.isArray(scope.dataTypes) ? scope.dataTypes.slice(0, 16) : null,
        durationSec: scope.durationSec ?? null,
        hasRevocationPath: !!scope.hasRevocationPath,
        jurisdiction: scope.jurisdiction ?? null
      },

      safety: {
        profileName: safety.profileName ?? null,
        nodeBudget: safety.nodeBudget ?? null,
        traceSpanBudget: safety.traceSpanBudget ?? null,
        deepPassBudget: safety.deepPassBudget ?? null,
        maxRunSeconds: safety.maxRunSeconds ?? null,
        minConfidenceForAutoUse: safety.minConfidenceForAutoUse ?? null,
        minConfidenceForDisplay: safety.minConfidenceForDisplay ?? null,
        maxDriftForAutoUse: safety.maxDriftForAutoUse ?? null,
        maxDriftForCitizenUI: safety.maxDriftForCitizenUI ?? null,
        role: safety.context?.role ?? null,
        deviceClass: safety.context?.deviceClass ?? null,
        networkTrust: safety.context?.networkTrust ?? null,
        consentLevel: safety.context?.consentLevel ?? null
      },

      workload: {
        nodesProcessed: metrics.nodesProcessed ?? 0,
        spansProcessed: metrics.spansProcessed ?? 0,
        deepPassObjects: metrics.deepPassObjects ?? 0,
        runSeconds: metrics.runSeconds ?? 0,
        eventsTotal: stats.totalEvents,
        eegEvents: stats.eegEvents,
        bciEvents: stats.bciEvents,
        artifactEvents: stats.artifactEvents
      },

      neuroSignal: {
        meanAmplitude: stats.meanAmplitude,
        maxAmplitude: stats.maxAmplitude,
        artifactFraction: this._safeFraction(stats.artifactEvents, stats.totalEvents),
        epochCount: epochStats.epochCount,
        meanEpochSNR: epochStats.meanSNR,
        highMotionEpochFraction: epochStats.highMotionEpochFraction
      },

      predicates: {
        calmstableFraction: predStats.calmstableFraction,
        overloadedFraction: predStats.overloadedFraction,
        recoveryFraction: predStats.recoveryFraction,
        unfairdrainFraction: predStats.unfairdrainFraction,
        calmstableRuns: predStats.calmstableRuns,
        overloadEpisodes: predStats.overloadEpisodes
      },

      reputation: {
        privacy: rep.privacy,
        compliance: rep.compliance,
        ecoalign: rep.ecoalign,
        clintrust: rep.clintrust,
        mpscore: rep.mpscore
      }
    };
  }

  _computeEventStats(events) {
    let total = 0;
    let eeg = 0;
    let bci = 0;
    let artifact = 0;
    let ampSum = 0;
    let ampMax = 0;

    for (const ev of events) {
      total += 1;
      const kind = ev.kind || ev.type || "unknown";
      if (kind === "EEG") eeg += 1;
      if (kind === "BCI") bci += 1;
      if (ev.artifact === true || ev.isArtifact === true) artifact += 1;

      const amp = typeof ev.amplitude === "number" ? ev.amplitude : null;
      if (amp !== null) {
        ampSum += amp;
        if (amp > ampMax) ampMax = amp;
      }
    }

    return {
      totalEvents: total,
      eegEvents: eeg,
      bciEvents: bci,
      artifactEvents: artifact,
      meanAmplitude: total > 0 ? ampSum / total : null,
      maxAmplitude: total > 0 ? ampMax : null
    };
  }

  _computePredicateStats(predicates) {
    if (!Array.isArray(predicates) || predicates.length === 0) {
      return {
        calmstableFraction: null,
        overloadedFraction: null,
        recoveryFraction: null,
        unfairdrainFraction: null,
        calmstableRuns: 0,
        overloadEpisodes: 0
      };
    }

    let calm = 0;
    let over = 0;
    let rec = 0;
    let unfair = 0;

    let calmRuns = 0;
    let overloadEpisodes = 0;
    let prevOverloaded = false;

    for (const p of predicates) {
      const f = p.flags || {};
      if (f.calmstable) calm += 1;
      if (f.overloaded) over += 1;
      if (f.recovery) rec += 1;
      if (f.unfairdrain) unfair += 1;

      if (f.calmstable) calmRuns += 1;
      if (f.overloaded && !prevOverloaded) {
        overloadEpisodes += 1;
      }
      prevOverloaded = !!f.overloaded;
    }

    const n = predicates.length;

    return {
      calmstableFraction: calm / n,
      overloadedFraction: over / n,
      recoveryFraction: rec / n,
      unfairdrainFraction: unfair / n,
      calmstableRuns: calmRuns,
      overloadEpisodes
    };
  }

  _computeEpochStats(events, runStartIso) {
    if (!Array.isArray(events) || events.length === 0) {
      return {
        epochCount: 0,
        meanSNR: null,
        highMotionEpochFraction: null
      };
    }

    const startTs = runStartIso ? Date.parse(runStartIso) : null;
    const epochSec = this.defaultEpochSeconds;
    const buckets = new Map();

    for (const ev of events) {
      const ts = typeof ev.timestamp === "number"
        ? ev.timestamp
        : (typeof ev.timestamp === "string" ? Date.parse(ev.timestamp) : null);

      if (!Number.isFinite(ts)) continue;

      const base = startTs ?? ts;
      const offsetSec = Math.max(0, (ts - base) / 1000);
      const epochIndex = Math.floor(offsetSec / epochSec);

      if (!buckets.has(epochIndex)) {
        buckets.set(epochIndex, {
          signalSum: 0,
          signalSqSum: 0,
          motionSum: 0,
          count: 0
        });
      }

      const b = buckets.get(epochIndex);
      const amp = typeof ev.amplitude === "number" ? ev.amplitude : 0;
      const motion = typeof ev.motion === "number" ? ev.motion : 0;

      b.signalSum += amp;
      b.signalSqSum += amp * amp;
      b.motionSum += motion;
      b.count += 1;
    }

    let epochCount = 0;
    let snrSum = 0;
    let highMotionEpochs = 0;

    for (const [, b] of buckets) {
      if (b.count === 0) continue;
      epochCount += 1;

      const mean = b.signalSum / b.count;
      const meanSq = b.signalSqSum / b.count;
      const variance = Math.max(0, meanSq - mean * mean);
      const std = Math.sqrt(variance);
      const snr = std > 0 ? Math.abs(mean) / std : null;

      if (snr !== null) {
        snrSum += snr;
      }

      const meanMotion = b.motionSum / b.count;
      if (meanMotion > 0.6) {
        highMotionEpochs += 1;
      }
    }

    return {
      epochCount,
      meanSNR: epochCount > 0 && snrSum > 0 ? snrSum / epochCount : null,
      highMotionEpochFraction: epochCount > 0
        ? highMotionEpochs / epochCount
        : null
    };
  }

  _safeFraction(num, den) {
    if (!den || den <= 0) return null;
    return num / den;
  }
}

export default QuantifiedNeuroConsentFeatures;
