// Cross-modal, NanoVolume-aware virtual object definition and helpers.

import crypto from "crypto";

/**
 * CrossModalVirtualObject
 * A single, named virtual-object that unifies:
 * - DOM sheet metrics
 * - JSON schema metrics
 * - OpenTelemetry span/tree metrics
 * for a given temporal window, with stability/novelty/drift and NanoVolume.
 */
export class CrossModalVirtualObject {
  constructor({
    id,
    name,
    windowId,
    domMetrics,
    jsonMetrics,
    traceMetrics,
    stabilityScores,
    driftScores,
    nanoConfig,
    tags,
    provenance
  }) {
    if (!id || typeof id !== "string") {
      throw new Error("CrossModalVirtualObject requires a string id.");
    }
    if (!name || typeof name !== "string") {
      throw new Error("CrossModalVirtualObject requires a string name.");
    }
    if (!windowId || typeof windowId !== "string") {
      throw new Error("CrossModalVirtualObject requires a string windowId.");
    }

    this.id = id;
    this.name = name;
    this.windowId = windowId;
    this.domMetrics = this.#normalizeDomMetrics(domMetrics);
    this.jsonMetrics = this.#normalizeJsonMetrics(jsonMetrics);
    this.traceMetrics = this.#normalizeTraceMetrics(traceMetrics);
    this.stability = this.#normalizeStability(stabilityScores);
    this.drift = this.#normalizeDrift(driftScores);
    this.nanoConfig = this.#normalizeNanoConfig(nanoConfig);
    this.tags = Array.isArray(tags) ? tags.slice(0, 64) : [];
    this.provenance = this.#normalizeProvenance(provenance);
    this.nanoVolume = this.#computeNanoVolume();
    this.contentHash = this.#computeContentHash();
    this.createdAt = new Date().toISOString();
  }

  #normalizeDomMetrics(input = {}) {
    const safe = {
      nNode: Number.isFinite(input.nNode) ? input.nNode : 0,
      nAttr: Number.isFinite(input.nAttr) ? input.nAttr : 0,
      nSnap: Number.isFinite(input.nSnap) ? input.nSnap : 0,
      stability: this.#clamp01(input.stability),
      drift: this.#clamp01(input.drift)
    };
    return safe;
  }

  #normalizeJsonMetrics(input = {}) {
    const safe = {
      nFields: Number.isFinite(input.nFields) ? input.nFields : 0,
      nTypes: Number.isFinite(input.nTypes) ? input.nTypes : 0,
      nSamples: Number.isFinite(input.nSamples) ? input.nSamples : 0,
      stability: this.#clamp01(input.stability),
      drift: this.#clamp01(input.drift)
    };
    return safe;
  }

  #normalizeTraceMetrics(input = {}) {
    const safe = {
      nSpans: Number.isFinite(input.nSpans) ? input.nSpans : 0,
      nEdges: Number.isFinite(input.nEdges) ? input.nEdges : 0,
      nTraces: Number.isFinite(input.nTraces) ? input.nTraces : 0,
      stability: this.#clamp01(input.stability),
      drift: this.#clamp01(input.drift)
    };
    return safe;
  }

  #normalizeStability(input = {}) {
    return {
      dom: this.#clamp01(input.dom ?? this.domMetrics.stability),
      json: this.#clamp01(input.json ?? this.jsonMetrics.stability),
      trace: this.#clamp01(input.trace ?? this.traceMetrics.stability)
    };
  }

  #normalizeDrift(input = {}) {
    return {
      dom: this.#clamp01(input.dom ?? this.domMetrics.drift),
      json: this.#clamp01(input.json ?? this.jsonMetrics.drift),
      trace: this.#clamp01(input.trace ?? this.traceMetrics.drift)
    };
  }

  #normalizeNanoConfig(input = {}) {
    const defaults = {
      cNode: 0.5,   // nanobytes per DOM node
      cAttr: 0.2,   // nanobytes per attribute
      cSnap: 0.8,   // nanobytes per DOM snapshot
      cField: 0.4,  // nanobytes per JSON field
      cSpan: 0.6    // nanobytes per span
    };
    const cfg = { ...defaults, ...input };
    for (const key of Object.keys(cfg)) {
      if (!Number.isFinite(cfg[key]) || cfg[key] < 0) {
        throw new Error(`nanoConfig.${key} must be a non-negative number.`);
      }
    }
    return cfg;
  }

  #normalizeProvenance(input = {}) {
    return {
      sessionId: input.sessionId || null,
      runId: input.runId || null,
      traceId: input.traceId || null,
      domSource: input.domSource || null,
      jsonSource: input.jsonSource || null,
      createdBy: input.createdBy || "javaspectre-core"
    };
  }

  #clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  #computeNanoVolume() {
    const { cNode, cAttr, cSnap, cField, cSpan } = this.nanoConfig;

    const Udom =
      this.domMetrics.nNode * cNode +
      this.domMetrics.nAttr * cAttr +
      this.domMetrics.nSnap * cSnap;

    const Ujson =
      this.jsonMetrics.nFields * cField +
      this.jsonMetrics.nTypes * Math.max(cField * 0.5, 0.1) +
      this.jsonMetrics.nSamples * Math.max(cField * 0.1, 0.05);

    const Utrace =
      this.traceMetrics.nSpans * cSpan +
      this.traceMetrics.nEdges * Math.max(cSpan * 0.3, 0.05) +
      this.traceMetrics.nTraces * Math.max(cSpan * 0.5, 0.1);

    const wDom = 1 - this.drift.dom - this.stability.dom;
    const wJson = 1 - this.drift.json - this.stability.json;
    const wTrace = 1 - this.drift.trace - this.stability.trace;

    const clampedWDom = Math.max(0, wDom);
    const clampedWJson = Math.max(0, wJson);
    const clampedWTrace = Math.max(0, wTrace);

    const v =
      Udom * clampedWDom +
      Ujson * clampedWJson +
      Utrace * clampedWTrace;

    return Math.max(0, v);
  }

  #computeContentHash() {
    const payload = {
      id: this.id,
      windowId: this.windowId,
      domMetrics: this.domMetrics,
      jsonMetrics: this.jsonMetrics,
      traceMetrics: this.traceMetrics,
      stability: this.stability,
      drift: this.drift,
      nanoVolume: this.nanoVolume,
      tags: this.tags,
      provenance: this.provenance
    };
    const serialized = JSON.stringify(payload);
    return crypto
      .createHash("sha256")
      .update(serialized)
      .digest("hex");
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      windowId: this.windowId,
      domMetrics: this.domMetrics,
      jsonMetrics: this.jsonMetrics,
      traceMetrics: this.traceMetrics,
      stability: this.stability,
      drift: this.drift,
      nanoConfig: this.nanoConfig,
      nanoVolume: this.nanoVolume,
      tags: this.tags,
      provenance: this.provenance,
      contentHash: this.contentHash,
      createdAt: this.createdAt
    };
  }

  static fromSnapshotCluster({
    windowId,
    baseName,
    domSnapshot,
    jsonSchema,
    traceCluster,
    nanoConfig,
    tags,
    provenance
  }) {
    const domMetrics = {
      nNode: domSnapshot?.metrics?.nNode ?? 0,
      nAttr: domSnapshot?.metrics?.nAttr ?? 0,
      nSnap: domSnapshot?.metrics?.nSnap ?? 0,
      stability: domSnapshot?.metrics?.stability ?? 0.0,
      drift: domSnapshot?.metrics?.drift ?? 0.0
    };

    const jsonMetrics = {
      nFields: jsonSchema?.metrics?.nFields ?? 0,
      nTypes: jsonSchema?.metrics?.nTypes ?? 0,
      nSamples: jsonSchema?.metrics?.nSamples ?? 0,
      stability: jsonSchema?.metrics?.stability ?? 0.0,
      drift: jsonSchema?.metrics?.drift ?? 0.0
    };

    const traceMetrics = {
      nSpans: traceCluster?.metrics?.nSpans ?? 0,
      nEdges: traceCluster?.metrics?.nEdges ?? 0,
      nTraces: traceCluster?.metrics?.nTraces ?? 0,
      stability: traceCluster?.metrics?.stability ?? 0.0,
      drift: traceCluster?.metrics?.drift ?? 0.0
    };

    const seed = JSON.stringify({
      windowId,
      baseName,
      dom: domMetrics,
      json: jsonMetrics,
      trace: traceMetrics
    });

    const id = crypto
      .createHash("sha256")
      .update(seed)
      .digest("hex")
      .slice(0, 24);

    const name = `${baseName || "cross-modal-object"}-${windowId}`;

    return new CrossModalVirtualObject({
      id,
      name,
      windowId,
      domMetrics,
      jsonMetrics,
      traceMetrics,
      stabilityScores: {
        dom: domMetrics.stability,
        json: jsonMetrics.stability,
        trace: traceMetrics.stability
      },
      driftScores: {
        dom: domMetrics.drift,
        json: jsonMetrics.drift,
        trace: traceMetrics.drift
      },
      nanoConfig,
      tags,
      provenance
    });
  }
}

export default CrossModalVirtualObject;
