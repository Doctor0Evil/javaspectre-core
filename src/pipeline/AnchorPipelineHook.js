// Helper to be called from inspect-safe / core pipeline after envelope persistence.

import AnchoringService from "../anchoring/AnchoringService.js";

export async function anchorEnvelopeMultiLedger({
  runMeta,
  envelope,
  safetyProfile,
  nanoMetrics,
  deviceContext,
  alnContext,
  anchoringConfig
}) {
  const service = new AnchoringService(anchoringConfig);
  const manifest = service.createManifest({
    runMeta,
    envelope,
    safetyProfile,
    deviceContext,
    alnContext,
    nanoMetrics
  });

  const { manifest: anchoredManifest, commitments } =
    await service.anchorManifest(manifest);

  return { manifest: anchoredManifest, commitments };
}

export default anchorEnvelopeMultiLedger;
