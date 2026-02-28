// Bridges TransparencyEnvelope → AnchorManifest → Bostrom/EVM/DID,
// and lifts ExcavationSafetyProfile trust tiers into explicit T1/T2 labels.

import AnchoringService from "../anchoring/AnchoringService.js";
import AnchorManifest from "../anchoring/AnchorManifest.js";

/**
 * Derive a coarse safety level (T1/T2/T3) from an envelope's outputsSummary.
 * Assumes outputsSummary contains counts for autoUse and quarantined objects,
 * and that the underlying ScoreEngine/SafetyProfile already enforce drift caps.
 */
function deriveSafetyLevel(outputsSummary) {
  if (!outputsSummary) {
    return "T3";
  }

  const total = outputsSummary.totalObjects ?? 0;
  const autoUse = outputsSummary.autoUse ?? outputsSummary.highConfidenceStable ?? 0;
  const quarantined = outputsSummary.quarantined ?? 0;

  if (total === 0) {
    return "T3";
  }

  const autoUseRatio = autoUse / total;
  const quarantineRatio = quarantined / total;

  // T1: majority auto-use, low quarantine, meant for safety-critical kernels.
  if (autoUseRatio >= 0.6 && quarantineRatio <= 0.1) {
    return "T1";
  }

  // T2: significant auto-use or show-with-warning, but not as clean as T1.
  if (autoUseRatio >= 0.25 && quarantineRatio <= 0.3) {
    return "T2";
  }

  // Everything else: informational / exploratory only.
  return "T3";
}

/**
 * Build a runMeta object from a TransparencyEnvelope suitable for anchoring.
 */
function buildRunMetaFromEnvelope(envelope, did) {
  const { runId, timestamp, runMeta, safetyProfile } = envelope;

  return {
    runId,
    timestamp,
    mode: runMeta?.mode ?? "unknown",
    intent: runMeta?.intent ?? "unspecified",
    did: did ?? null,
    javaspectreVersion: runMeta?.environment?.javaspectreVersion ?? null,
    nodeVersion: runMeta?.environment?.nodeVersion ?? null,
    safetyProfileName: safetyProfile?.profileName ?? null
  };
}

/**
 * Build nanoMetrics payload capturing T1/T2 mix and basic drift / stability hints.
 * This is designed to be small but enough for external auditors.
 */
function buildNanoMetrics(envelope) {
  const metrics = envelope.metrics ?? {};
  const outputs = envelope.outputsSummary ?? {};

  const total = outputs.totalObjects ?? 0;
  const autoUse = outputs.autoUse ?? outputs.highConfidenceStable ?? 0;
  const quarantined = outputs.quarantined ?? 0;

  return {
    totalObjects: total,
    autoUseCount: autoUse,
    quarantinedCount: quarantined,
    autoUseRatio: total ? autoUse / total : 0,
    quarantinedRatio: total ? quarantined / total : 0,
    nodesProcessed: metrics.nodesProcessed ?? metrics.nodeCount ?? null,
    spansProcessed: metrics.spansProcessed ?? metrics.traceSpanCount ?? null,
    deepPassObjects: metrics.deepPassObjects ?? null,
    runSeconds: metrics.runSeconds ?? null
  };
}

/**
 * Anchors a single TransparencyEnvelope to all configured ledgers, deriving
 * an explicit T1/T2 safety level and embedding ALN/device context.
 *
 * @param {object} envelope  - TransparencyEnvelope JSON from TransparencyStore.
 * @param {object} options   - {
 *   did: string | null,
 *   deviceContext: object,
 *   alnContext: object,
 *   anchoringConfig: object
 * }
 * @returns {Promise<{manifest: object, commitments: Array}>}
 */
export async function anchorEnvelopeWithSafety(envelope, options = {}) {
  if (!envelope || !envelope.contentHash || !envelope.runId) {
    throw new Error("anchorEnvelopeWithSafety requires an envelope with runId and contentHash.");
  }

  const {
    did = null,
    deviceContext = {},
    alnContext = {},
    anchoringConfig = {}
  } = options;

  const safetyLevel = deriveSafetyLevel(envelope.outputsSummary);
  const nanoMetrics = buildNanoMetrics(envelope);
  const runMeta = buildRunMetaFromEnvelope(envelope, did);

  // Enrich ALN context with a coarse safety label.
  const enrichedAlnContext = {
    ...alnContext,
    safetyLevel,
    envelopeMode: runMeta.mode,
    envelopeIntent: runMeta.intent
  };

  const safetyProfile = envelope.safetyProfile ?? null;

  const manifest = new AnchorManifest(
    runMeta.runId,
    envelope,
    did,
    safetyProfile,
    deviceContext,
    enrichedAlnContext,
    nanoMetrics
  );

  const service = new AnchoringService(anchoringConfig);
  const anchoredManifest = await service.anchorManifest(manifest);

  return {
    manifest: anchoredManifest,
    commitments: anchoredManifest.commitments
  };
}

/**
 * Convenience helper to be called directly from the main introspection pipeline
 * (e.g., inspect-safe.js) after you save the TransparencyEnvelope into SQLite.
 *
 * @param {object} envelope           - TransparencyEnvelope JSON.
 * @param {object} pipelineContext    - {
 *   did?: string,
 *   deviceContext?: object,
 *   alnContext?: object,
 *   anchoringConfig?: object,
 *   logger?: Console-like
 * }
 */
export async function anchorEnvelopeIfConfigured(envelope, pipelineContext = {}) {
  const {
    did,
    deviceContext,
    alnContext,
    anchoringConfig,
    logger = console
  } = pipelineContext;

  if (!anchoringConfig) {
    logger.warn?.("MultiLedgerSafetyAnchor: anchoringConfig missing, skipping anchoring.");
    return null;
  }

  try {
    const { manifest, commitments } = await anchorEnvelopeWithSafety(envelope, {
      did,
      deviceContext,
      alnContext,
      anchoringConfig
    });

    logger.info?.(
      "MultiLedgerSafetyAnchor: anchored TransparencyEnvelope",
      {
        runId: manifest.runId,
        manifestId: manifest.manifestId,
        safetyLevel: manifest.alnContext?.safetyLevel ?? null,
        commitments
      }
    );

    return { manifest, commitments };
  } catch (err) {
    logger.error?.(
      "MultiLedgerSafetyAnchor: anchoring failed",
      { runId: envelope.runId, error: String(err) }
    );
    throw err;
  }
}

export default {
  anchorEnvelopeWithSafety,
  anchorEnvelopeIfConfigured
};
