/**
 * ArProjectionEngine
 *
 * Maps Javaspectre's virtual-object excavation outputs and score metrics
 * into augmented-reality oriented virtual objects:
 *   - ARSurfaceAnchor: stable DOM/visual anchors for overlays.
 *   - ARFlowObject: inferred state/flow objects derived from motifs/traces.
 *   - ARMotif: cross-site semantic patterns (login, checkout, consent, etc.).
 *   - CitizenARObject: AR objects decorated with citizen profile & safety tiers.
 *
 * This module is intentionally self-contained and free of external dependencies.
 */

/**
 * Simple heuristic classifier to tag high-level motif types based on
 * virtual-object signatures, selectors, or names. This is a starting point;
 * you can replace or extend this with a learned ALN-driven classifier.
 */
function inferMotifType(virtualObject) {
  const sig = [
    virtualObject.signature || "",
    virtualObject.selector || "",
    virtualObject.id || "",
    virtualObject.ctor || "",
    (virtualObject.category || "")
  ]
    .join(" ")
    .toLowerCase();

  if (sig.includes("login") || sig.includes("signin") || sig.includes("sign-in")) {
    return "login";
  }

  if (
    sig.includes("checkout") ||
    sig.includes("cart") ||
    sig.includes("payment") ||
    sig.includes("order-summary")
  ) {
    return "checkout";
  }

  if (sig.includes("profile") || sig.includes("account") || sig.includes("settings")) {
    return "profile";
  }

  if (sig.includes("consent") || sig.includes("cookie") || sig.includes("gdpr")) {
    return "consent-banner";
  }

  if (sig.includes("search") || sig.includes("filter") || sig.includes("query")) {
    return "search";
  }

  if (sig.includes("nav") || sig.includes("navbar") || sig.includes("sidebar")) {
    return "navigation";
  }

  return "generic";
}

/**
 * Utility to normalize a selector-like field from a DOM virtual-object,
 * falling back to a synthetic ID when none is provided.
 */
function deriveSelector(vo, index) {
  if (typeof vo.selector === "string" && vo.selector.trim().length > 0) {
    return vo.selector.trim();
  }

  if (vo.category === "dom-tag" && typeof vo.tag === "string") {
    return vo.tag.toLowerCase();
  }

  if (vo.category === "dom-class" && typeof vo.selector === "string") {
    return vo.selector.trim();
  }

  return `vo-${vo.category || "unknown"}-${vo.id || index}`;
}

/**
 * ARSurfaceAnchor
 * Represents a stable visual/DOM anchor suitable for AR attachment.
 */
class ARSurfaceAnchor {
  constructor({
    id,
    selector,
    role,
    stabilityScore,
    driftScore,
    pageContext,
    attributesExample,
    sourceVirtualObjectId
  }) {
    this.id = id;
    this.selector = selector;
    this.role = role;
    this.stabilityScore = stabilityScore;
    this.driftScore = driftScore;
    this.pageContext = pageContext;
    this.attributesExample = attributesExample || {};
    this.sourceVirtualObjectId = sourceVirtualObjectId;
    this.createdAt = Date.now();
  }
}

/**
 * ARFlowObject
 * Encapsulates a state/flow structure suitable for AR timelines or guides.
 * For now, this is derived from motif clusters and relationships;
 * you can later wire this into a dedicated PhantomDetector/state-machine module.
 */
class ARFlowObject {
  constructor({
    flowId,
    motifType,
    states,
    transitions,
    entryPoints,
    stabilityScore,
    driftScore,
    relatedVirtualObjectIds
  }) {
    this.flowId = flowId;
    this.motifType = motifType;
    this.states = states || [];
    this.transitions = transitions || [];
    this.entryPoints = entryPoints || [];
    this.stabilityScore = stabilityScore;
    this.driftScore = driftScore;
    this.relatedVirtualObjectIds = relatedVirtualObjectIds || [];
    this.createdAt = Date.now();
  }
}

/**
 * ARMotif
 * Semantic motif representing a pattern like login, checkout, or consent banner.
 */
class ARMotif {
  constructor({
    motifId,
    motifType,
    virtualObjectIds,
    canonicalSchema,
    commonSelectors,
    confidenceScore,
    driftScore
  }) {
    this.motifId = motifId;
    this.motifType = motifType;
    this.virtualObjectIds = virtualObjectIds || [];
    this.canonicalSchema = canonicalSchema || {};
    this.commonSelectors = commonSelectors || [];
    this.confidenceScore = confidenceScore;
    this.driftScore = driftScore;
    this.createdAt = Date.now();
  }
}

/**
 * CitizenARObject
 * Wraps any AR object with citizen-facing policy and safety metadata.
 */
class CitizenARObject {
  constructor({
    id,
    baseArObject,
    tier,
    rationale,
    flags,
    citizenProfileId,
    consentLevel,
    allowedActions
  }) {
    this.id = id;
    this.baseType = baseArObject ? baseArObject.constructor.name : "Unknown";
    this.base = baseArObject || null;
    this.tier = tier; // "auto-use" | "show-with-warning" | "quarantine"
    this.rationale = rationale || {};
    this.flags = flags || [];
    this.citizenProfileId = citizenProfileId || "unknown";
    this.consentLevel = consentLevel || "minimal";
    this.allowedActions = allowedActions || [];
    this.createdAt = Date.now();
  }
}

/**
 * ArProjectionEngine
 *
 * Core class that orchestrates projection from:
 *   { excavationResult, scoreResult, safetyProfile, citizenProfile, pageContext }
 * to:
 *   { surfaceAnchors, flowObjects, motifs, citizenObjects }
 */
class ArProjectionEngine {
  constructor({ safetyProfile, citizenProfile }) {
    this.safetyProfile = safetyProfile || null;
    this.citizenProfile = citizenProfile || null;
  }

  /**
   * Main entry point.
   *
   * @param {Object} params
   *  - excavationResult: output from VirtualObjectExcavator.
   *  - scoreResult: output from VirtualObjectScoreEngine (per-object scores).
   *  - pageContext: arbitrary metadata describing the current page/view.
   *
   * @returns {Object} {
   *   surfaceAnchors: ARSurfaceAnchor[],
   *   flowObjects: ARFlowObject[],
   *   motifs: ARMotif[],
   *   citizenObjects: CitizenARObject[]
   * }
   */
  project(params) {
    const excavationResult = params.excavationResult || { virtualObjects: [] };
    const scoreResult = params.scoreResult || { objects: [] };
    const pageContext = params.pageContext || {};

    const scoreIndex = this._buildScoreIndex(scoreResult);
    const motifBuckets = new Map();

    const surfaceAnchors = [];
    const motifs = [];

    // 1. Build ARSurfaceAnchors and motif buckets from virtual objects.
    excavationResult.virtualObjects.forEach((vo, index) => {
      const score = scoreIndex.get(vo.id) || {
        confidence: 0.0,
        drift: 1.0
      };

      const selector = deriveSelector(vo, index);
      const motifType = inferMotifType(vo);
      const role = this._inferAnchorRole(vo, motifType);

      // Construct anchor only for DOM-centric categories.
      if (vo.category === "dom-tag" || vo.category === "dom-class") {
        const anchorId = `anchor-${vo.id || index}`;
        const anchor = new ARSurfaceAnchor({
          id: anchorId,
          selector,
          role,
          stabilityScore: score.confidence,
          driftScore: score.drift,
          pageContext,
          attributesExample: vo.attributesExample || vo.fields || {},
          sourceVirtualObjectId: vo.id
        });

        surfaceAnchors.push(anchor);
      }

      // Bucket virtual objects by motifType for ARMotifs.
      const bucketKey = motifType;
      if (!motifBuckets.has(bucketKey)) {
        motifBuckets.set(bucketKey, []);
      }
      motifBuckets.get(bucketKey).push({
        vo,
        score
      });
    });

    // 2. Reduce motif buckets into ARMotifs.
    let motifCounter = 0;
    motifBuckets.forEach((entries, motifType) => {
      if (!entries.length) return;

      const ids = entries.map((e) => e.vo.id);
      const selectors = entries
        .map((e, idx) => deriveSelector(e.vo, idx))
        .filter((s) => typeof s === "string" && s.length > 0);

      const avgConfidence =
        entries.reduce((sum, e) => sum + (e.score.confidence || 0), 0) /
        entries.length;
      const avgDrift =
        entries.reduce((sum, e) => sum + (e.score.drift || 0), 0) /
        entries.length;

      const canonicalSchema = this._deriveCanonicalSchema(entries);

      const motif = new ARMotif({
        motifId: `motif-${motifType}-${motifCounter++}`,
        motifType,
        virtualObjectIds: ids,
        canonicalSchema,
        commonSelectors: Array.from(new Set(selectors)),
        confidenceScore: avgConfidence,
        driftScore: avgDrift
      });

      motifs.push(motif);
    });

    // 3. Construct simple ARFlowObjects from motifs (placeholder for deeper FSM).
    const flowObjects = motifs.map((motif, idx) => {
      const states = [
        {
          id: `${motif.motifId}-state-initial`,
          label: "initial"
        },
        {
          id: `${motif.motifId}-state-active`,
          label: "active"
        },
        {
          id: `${motif.motifId}-state-complete`,
          label: "complete"
        }
      ];

      const transitions = [
        {
          from: states[0].id,
          to: states[1].id,
          event: "enter"
        },
        {
          from: states[1].id,
          to: states[2].id,
          event: "complete"
        }
      ];

      const entryPoints = [
        {
          selector: motif.commonSelectors[0] || "",
          description: `Entry for motif ${motif.motifType}`
        }
      ];

      return new ARFlowObject({
        flowId: `flow-${motif.motifType}-${idx}`,
        motifType: motif.motifType,
        states,
        transitions,
        entryPoints,
        stabilityScore: motif.confidenceScore,
        driftScore: motif.driftScore,
        relatedVirtualObjectIds: motif.virtualObjectIds
      });
    });

    // 4. Wrap AR objects into CitizenARObjects if a safety profile or citizen profile is present.
    const citizenObjects = this._decorateWithCitizenContext({
      surfaceAnchors,
      flowObjects,
      motifs
    });

    return {
      surfaceAnchors,
      flowObjects,
      motifs,
      citizenObjects
    };
  }

  /**
   * Build an index of scores keyed by virtual-object id.
   */
  _buildScoreIndex(scoreResult) {
    const index = new Map();
    const list = Array.isArray(scoreResult.objects) ? scoreResult.objects : [];

    list.forEach((obj) => {
      if (!obj || typeof obj.id === "undefined") return;
      index.set(obj.id, {
        confidence:
          typeof obj.confidence === "number" ? obj.confidence : 0.0,
        drift: typeof obj.drift === "number" ? obj.drift : 1.0,
        meta: obj.meta || {}
      });
    });

    return index;
  }

  /**
   * Infer a rough anchor role from virtual object and motif type.
   */
  _inferAnchorRole(vo, motifType) {
    if (motifType === "navigation") return "nav";
    if (motifType === "login") return "entry";
    if (motifType === "checkout") return "transaction-summary";
    if (motifType === "consent-banner") return "consent";
    if (motifType === "search") return "search";

    if ((vo.category || "").includes("dom-tag")) {
      return "component";
    }

    return "generic";
  }

  /**
   * Derive a simple canonical schema for a group of virtual objects,
   * merging visible fields and their inferred kinds.
   */
  _deriveCanonicalSchema(entries) {
    const fieldMap = new Map();

    entries.forEach((entry) => {
      const vo = entry.vo;
      if (!vo || typeof vo.fields !== "object") return;

      Object.keys(vo.fields).forEach((fieldName) => {
        const fieldInfo = vo.fields[fieldName] || {};
        const key = fieldName;
        const existing = fieldMap.get(key) || {
          kinds: new Set(),
          valueTypes: new Set(),
          examples: []
        };

        if (fieldInfo.kind) {
          existing.kinds.add(fieldInfo.kind);
        }
        if (fieldInfo.valueType) {
          existing.valueTypes.add(fieldInfo.valueType);
        }
        if (typeof fieldInfo.example !== "undefined") {
          if (existing.examples.length < 5) {
            existing.examples.push(fieldInfo.example);
          }
        }

        fieldMap.set(key, existing);
      });
    });

    const schema = {};
    fieldMap.forEach((value, key) => {
      schema[key] = {
        kinds: Array.from(value.kinds),
        valueTypes: Array.from(value.valueTypes),
        examples: value.examples
      };
    });

    return schema;
  }

  /**
   * Wrap AR objects into CitizenARObjects using safetyProfile.classifyObject
   * and citizenProfile metadata, if available. If not, returns an empty array.
   */
  _decorateWithCitizenContext({ surfaceAnchors, flowObjects, motifs }) {
    if (!this.safetyProfile && !this.citizenProfile) {
      return [];
    }

    const citizenProfileId =
      this.citizenProfile && this.citizenProfile.id
        ? this.citizenProfile.id
        : "anonymous";

    const consentLevel =
      this.citizenProfile && this.citizenProfile.consentLevel
        ? this.citizenProfile.consentLevel
        : "minimal";

    const results = [];

    const classify = (id, confidence, drift, kind) => {
      if (!this.safetyProfile || typeof this.safetyProfile.classifyObject !== "function") {
        return {
          tier: "show-with-warning",
          rationale: {
            confidence,
            drift
          },
          flags: []
        };
      }

      const classification = this.safetyProfile.classifyObject({
        id,
        confidence,
        drift,
        kind
      });

      return {
        tier: classification.tier,
        rationale: classification.rationale,
        flags: classification.flags || []
      };
    };

    surfaceAnchors.forEach((anchor) => {
      const confidence = anchor.stabilityScore;
      const drift = anchor.driftScore;
      const kind = "surface-anchor";

      const { tier, rationale, flags } = classify(anchor.id, confidence, drift, kind);
      const allowedActions = this._deriveAllowedActions(tier, consentLevel, kind);

      results.push(
        new CitizenARObject({
          id: `citizen-${anchor.id}`,
          baseArObject: anchor,
          tier,
          rationale,
          flags,
          citizenProfileId,
          consentLevel,
          allowedActions
        })
      );
    });

    flowObjects.forEach((flow) => {
      const confidence = flow.stabilityScore;
      const drift = flow.driftScore;
      const kind = "flow-object";

      const { tier, rationale, flags } = classify(flow.flowId, confidence, drift, kind);
      const allowedActions = this._deriveAllowedActions(tier, consentLevel, kind);

      results.push(
        new CitizenARObject({
          id: `citizen-${flow.flowId}`,
          baseArObject: flow,
          tier,
          rationale,
          flags,
          citizenProfileId,
          consentLevel,
          allowedActions
        })
      );
    });

    motifs.forEach((motif) => {
      const confidence = motif.confidenceScore;
      const drift = motif.driftScore;
      const kind = `motif-${motif.motifType}`;

      const { tier, rationale, flags } = classify(motif.motifId, confidence, drift, kind);
      const allowedActions = this._deriveAllowedActions(tier, consentLevel, "motif");

      results.push(
        new CitizenARObject({
          id: `citizen-${motif.motifId}`,
          baseArObject: motif,
          tier,
          rationale,
          flags,
          citizenProfileId,
          consentLevel,
          allowedActions
        })
      );
    });

    return results;
  }

  /**
   * Derive allowed actions on an AR object based on safety tier and consent level.
   * This is a conservative default; you can tune it with ALN policy.
   */
  _deriveAllowedActions(tier, consentLevel, kind) {
    const actions = [];

    if (tier === "quarantine") {
      // Only safe action: inspect or ignore.
      actions.push("inspect-metadata");
      return actions;
    }

    // For "show-with-warning" and "auto-use", vary by consent and type.
    if (kind === "surface-anchor") {
      actions.push("show-overlay");
      if (tier === "auto-use" && consentLevel !== "minimal") {
        actions.push("auto-highlight");
      }
    }

    if (kind === "flow-object") {
      actions.push("show-timeline");
      if (tier === "auto-use" && consentLevel === "broad") {
        actions.push("auto-guide");
      }
    }

    if (kind === "motif") {
      actions.push("show-motif-hint");
      if (tier === "auto-use" && consentLevel !== "minimal") {
        actions.push("auto-annotate");
      }
    }

    actions.push("inspect-metadata");
    return actions;
  }
}

export {
  ARSurfaceAnchor,
  ARFlowObject,
  ARMotif,
  CitizenARObject,
  ArProjectionEngine
};
