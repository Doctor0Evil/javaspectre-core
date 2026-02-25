export class QuantifiedVirtualObjectMapper {
  constructor(options = {}) {
    this.version = "1.0.0";
    this.defaultWindow = options.defaultWindow ?? 10;
  }

  /**
   * Map a TransparencyEnvelope + classified virtual objects into
   * a compact, ML-ready "QuantifiedVirtualObjectRun" feature object.
   */
  toRunFeatures(envelope, objects, reputationVector = null) {
    if (!envelope || !envelope.metrics || !Array.isArray(objects)) {
      throw new Error("QuantifiedVirtualObjectMapper.toRunFeatures requires envelope.metrics and objects[]");
    }

    const { metrics, safetyProfile, runMeta, outputsSummary } = envelope;
    const safeProfile = safetyProfile || {};
    const out = outputsSummary || {};

    const trustCounts = this._countTrustTiers(objects);
    const modalityFlags = this._inferModalityFlags(runMeta?.mode);

    const rep = reputationVector || {
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
      mode: runMeta?.mode ?? "unknown",
      intent: runMeta?.intent ?? "unspecified",

      // Safety profile knobs as explicit ML features
      safety: {
        profileName: safeProfile.profileName ?? "unknown",
        nodeBudget: safeProfile.nodeBudget ?? null,
        traceSpanBudget: safeProfile.traceSpanBudget ?? null,
        deepPassBudget: safeProfile.deepPassBudget ?? null,
        maxRunSeconds: safeProfile.maxRunSeconds ?? null,
        minConfidenceForAutoUse: safeProfile.minConfidenceForAutoUse ?? null,
        minConfidenceForDisplay: safeProfile.minConfidenceForDisplay ?? null,
        maxDriftForAutoUse: safeProfile.maxDriftForAutoUse ?? null,
        maxDriftForCitizenUI: safeProfile.maxDriftForCitizenUI ?? null,
        role: safeProfile.context?.role ?? null,
        deviceClass: safeProfile.context?.deviceClass ?? null,
        networkTrust: safeProfile.context?.networkTrust ?? null,
        consentLevel: safeProfile.context?.consentLevel ?? null
      },

      // Execution-level metrics (input scale, effort, etc.)
      metrics: {
        nodesProcessed: metrics.nodesProcessed ?? 0,
        spansProcessed: metrics.spansProcessed ?? 0,
        deepPassObjects: metrics.deepPassObjects ?? 0,
        runSeconds: metrics.runSeconds ?? 0,
        virtualObjectsTotal: out.total ?? out.virtualObjects ?? objects.length,
        virtualObjectsAutoUse: out.autoUse ?? out.highConfidenceStable ?? trustCounts.autoUse,
        virtualObjectsQuarantined: out.quarantined ?? trustCounts.quarantine
      },

      // Aggregate trust geometry for the run
      trust: {
        autoUseCount: trustCounts.autoUse,
        warnCount: trustCounts.warn,
        quarantineCount: trustCounts.quarantine,
        autoUseFraction: this._safeFraction(trustCounts.autoUse, objects.length),
        quarantineFraction: this._safeFraction(trustCounts.quarantine, objects.length),
        avgConfidence: this._average(objects, o => o.rationale?.confidence ?? o.confidence ?? null),
        avgDrift: this._average(objects, o => o.rationale?.drift ?? o.drift ?? null)
      },

      // High-level modality flags for cross-domain ML
      modality: modalityFlags,

      // Optional reputation vector (observer-only)
      reputation: {
        privacy: rep.privacy,
        compliance: rep.compliance,
        ecoalign: rep.ecoalign,
        clintrust: rep.clintrust,
        mpscore: rep.mpscore
      }
    };
  }

  /**
   * Map individual classified virtual objects into per-object feature rows.
   * Intended as tabular input for ML models.
   */
  toObjectFeatures(runId, objects, extraContext = {}) {
    if (!Array.isArray(objects)) {
      throw new Error("QuantifiedVirtualObjectMapper.toObjectFeatures requires objects[]");
    }

    const { mode = "unknown", role = null, deviceClass = null } = extraContext;

    return objects.map((obj) => {
      const r = obj.rationale || {};
      const flags = Array.isArray(obj.flags) ? obj.flags : [];
      const kind = obj.kind ?? obj.category ?? "unknown";

      return {
        runId,
        objectId: obj.id ?? null,
        kind,
        tier: obj.tier ?? null, // auto-use | show-with-warning | quarantine
        confidence: r.confidence ?? obj.confidence ?? null,
        drift: r.drift ?? obj.drift ?? null,
        evidenceCount: obj.evidenceCount ?? null,

        // Boolean flag unpacking
        isHighConfidence: flags.includes("high-confidence"),
        isLowConfidence: flags.includes("low-confidence"),
        isLowDrift: flags.includes("low-drift"),
        isMediumDrift: flags.includes("medium-drift"),
        isHighDrift: flags.includes("high-drift"),

        // Context hooks for citizen / edge analysis
        mode,
        role,
        deviceClass
      };
    });
  }

  _countTrustTiers(objects) {
    let autoUse = 0;
    let warn = 0;
    let quarantine = 0;

    for (const obj of objects) {
      if (obj.tier === "auto-use") autoUse += 1;
      else if (obj.tier === "show-with-warning") warn += 1;
      else quarantine += 1;
    }
    return { autoUse, warn, quarantine };
  }

  _safeFraction(num, denom) {
    if (!denom || denom <= 0) return 0;
    return num / denom;
  }

  _average(items, getter) {
    let sum = 0;
    let count = 0;
    for (const it of items) {
      const v = getter(it);
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    return count ? sum / count : null;
  }

  _inferModalityFlags(mode) {
    const m = (mode || "").toLowerCase();
    return {
      isDom: m === "dom",
      isTrace: m === "trace",
      isHar: m === "har",
      isJson: m === "json",
      isNeuro: m === "neuro" || m === "eeg" || m === "bci"
    };
  }
}

export default QuantifiedVirtualObjectMapper;
