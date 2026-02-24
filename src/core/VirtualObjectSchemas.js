// Canonical schema and descriptor layer for sovereign, motif, DOM, and XR virtual-objects.

import crypto from "node:crypto";

function sha256Hex(payload) {
  const buf = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * SovereignExcavationProfile
 */
export function makeSovereignExcavationProfile(input) {
  const now = new Date().toISOString();

  const profile = {
    sovereign_id: input.sovereign_id,
    did: input.did ?? null,
    bostrom_address: input.bostrom_address ?? null,
    evm_address: input.evm_address ?? null,
    run_id: input.run_id,
    safety_profile_id: input.safety_profile_id,
    transparency_envelope_hash: input.transparency_envelope_hash,
    content_hash: input.content_hash,
    mode: input.mode,
    intent: input.intent ?? "unspecified",
    created_at: input.created_at ?? now,
    spectral_tags: input.spectral_tags ?? [],
  };

  if (!profile.sovereign_id || !profile.run_id || !profile.content_hash) {
    throw new Error("SovereignExcavationProfile missing required fields");
  }

  profile.primary_index = `${profile.sovereign_id}::${profile.run_id}`;
  profile.secondary_indexes = {
    bostrom_address: profile.bostrom_address,
    evm_address: profile.evm_address,
    mode: profile.mode,
    created_at: profile.created_at,
  };

  return profile;
}

/**
 * TransparencyAnchorManifest
 */
export function makeTransparencyAnchorManifest(input) {
  if (!input.run_id || !input.content_hash) {
    throw new Error("TransparencyAnchorManifest requires run_id and content_hash");
  }

  const manifestId = sha256Hex(`${input.run_id}:${input.content_hash}`).slice(0, 32);
  const now = new Date().toISOString();

  const manifest = {
    manifest_id: manifestId,
    run_id: input.run_id,
    content_hash: input.content_hash,
    envelope_timestamp: input.envelope_timestamp ?? now,
    home_chain: input.home_chain ?? "bostrom",
    did: input.did ?? null,
    bostrom_tx: input.bostrom_tx ?? null,
    evm_tx: input.evm_tx ?? null,
    did_anchor_ref: input.did_anchor_ref ?? null,
    created_at: now,
  };

  manifest.primary_index = `${manifest.run_id}::${manifest.content_hash}`;
  manifest.secondary_indexes = {
    manifest_id: manifest.manifest_id,
    home_chain: manifest.home_chain,
    bostrom_tx: manifest.bostrom_tx,
    evm_tx: manifest.evm_tx,
  };

  return manifest;
}

/**
 * AugmentedIdentityBinding
 */
export function makeAugmentedIdentityBinding(input) {
  const binding = {
    sovereign_id: input.sovereign_id,
    did: input.did ?? null,
    bostrom_address: input.bostrom_address ?? null,
    evm_address: input.evm_address ?? null,
    role: input.role ?? "citizen",
    device_class: input.device_class ?? "edge-unknown",
    network_trust: input.network_trust ?? "unknown",
    consent_level: input.consent_level ?? "minimal",
    location_hint: input.location_hint ?? null,
  };

  if (!binding.sovereign_id) {
    throw new Error("AugmentedIdentityBinding requires sovereign_id");
  }

  binding.primary_index = binding.sovereign_id;
  binding.secondary_indexes = {
    did: binding.did,
    bostrom_address: binding.bostrom_address,
    role: binding.role,
    device_class: binding.device_class,
  };

  return binding;
}

/**
 * MotifSignature
 */
export function makeMotifSignature(input) {
  const core = {
    language: input.language,
    motif_type: input.motif_type,
    scope: input.scope ?? "module",
    structural_fingerprint: input.structural_fingerprint,
    source_anchor: input.source_anchor,
  };

  if (!core.language || !core.motif_type || !core.structural_fingerprint) {
    throw new Error("MotifSignature missing required fields");
  }

  const motifId = input.motif_id ?? sha256Hex(core).slice(0, 32);

  const signature = {
    motif_id: motifId,
    language: core.language,
    motif_type: core.motif_type,
    scope: core.scope,
    structural_fingerprint: core.structural_fingerprint,
    source_anchor: core.source_anchor ?? null,
    ast_height: input.ast_height ?? null,
    node_count: input.node_count ?? null,
    isomorphism_canonical_form: input.isomorphism_canonical_form ?? null,
  };

  signature.primary_index = `${signature.structural_fingerprint}::${signature.language}`;
  signature.secondary_indexes = {
    motif_type: signature.motif_type,
    source_anchor: signature.source_anchor,
  };

  return signature;
}

/**
 * MotifStabilityRecord
 */
export function makeMotifStabilityRecord(input) {
  const record = {
    motif_id: input.motif_id,
    version_id: input.version_id,
    isomorphism_distance: input.isomorphism_distance,
    edit_script_length: input.edit_script_length,
    normalized_edit_length: input.normalized_edit_length,
    signature_persistence_ratio: input.signature_persistence_ratio,
    stability_score: input.stability_score,
    observed_at: input.observed_at ?? new Date().toISOString(),
  };

  if (!record.motif_id || !record.version_id) {
    throw new Error("MotifStabilityRecord requires motif_id and version_id");
  }

  record.primary_index = `${record.motif_id}::${record.version_id}`;
  record.secondary_indexes = {
    stability_score: record.stability_score,
    observed_at: record.observed_at,
  };

  return record;
}

/**
 * MotifInstance
 */
export function makeMotifInstance(input) {
  const instanceId = input.motif_instance_id ?? sha256Hex({
    motif_id: input.motif_id,
    run_id: input.run_id,
    source_context: input.source_context,
  }).slice(0, 32);

  const instance = {
    motif_instance_id: instanceId,
    motif_id: input.motif_id,
    run_id: input.run_id,
    source_context: input.source_context ?? null,
    stability_score_at_run: input.stability_score_at_run ?? null,
    novelty_score: input.novelty_score ?? null,
  };

  if (!instance.motif_id || !instance.run_id) {
    throw new Error("MotifInstance requires motif_id and run_id");
  }

  instance.primary_index = instance.motif_instance_id;
  instance.secondary_indexes = {
    motif_id: instance.motif_id,
    run_id: instance.run_id,
    source_context: instance.source_context,
  };

  return instance;
}

/**
 * DOMStabilitySignature
 */
export function makeDOMStabilitySignature(input) {
  const core = {
    target_selector: input.target_selector,
    dom_tree_fingerprint: input.dom_tree_fingerprint,
  };

  if (!core.target_selector || !core.dom_tree_fingerprint) {
    throw new Error("DOMStabilitySignature requires target_selector and dom_tree_fingerprint");
  }

  const domSignatureId =
    input.dom_signature_id ?? sha256Hex(core).slice(0, 32);

  const sig = {
    dom_signature_id: domSignatureId,
    target_selector: core.target_selector,
    dom_tree_fingerprint: core.dom_tree_fingerprint,
    dom_stability_score: input.dom_stability_score ?? 0,
    dynamic_id_ratio: input.dynamic_id_ratio ?? 0,
    hydration_artifact_ratio: input.hydration_artifact_ratio ?? 0,
    snapshot_id: input.snapshot_id,
    run_id: input.run_id,
    observed_at: input.observed_at ?? new Date().toISOString(),
  };

  if (!sig.snapshot_id || !sig.run_id) {
    throw new Error("DOMStabilitySignature requires snapshot_id and run_id");
  }

  sig.primary_index = `${sig.dom_signature_id}::${sig.snapshot_id}`;
  sig.secondary_indexes = {
    target_selector: sig.target_selector,
    dom_tree_fingerprint: sig.dom_tree_fingerprint,
    dom_stability_score: sig.dom_stability_score,
  };

  return sig;
}

/**
 * DOMMotifLink
 */
export function makeDOMMotifLink(input) {
  const link = {
    dom_signature_id: input.dom_signature_id,
    motif_id: input.motif_id,
    link_type: input.link_type ?? "unspecified",
  };

  if (!link.dom_signature_id || !link.motif_id) {
    throw new Error("DOMMotifLink requires dom_signature_id and motif_id");
  }

  link.primary_index = `${link.dom_signature_id}::${link.motif_id}`;
  return link;
}

/**
 * EdgeZoneCognitiveOverlay
 */
export function makeEdgeZoneCognitiveOverlay(input) {
  const overlay = {
    edge_zone_id: input.edge_zone_id,
    location: input.location,
    jetson_family: input.jetson_family,
    power_budget_watts: input.power_budget_watts,
    yolo_stream_capacity: input.yolo_stream_capacity,
    ambient_profile: input.ambient_profile,
    overlay_modes: input.overlay_modes ?? ["ambience"],
    sustainability_class: input.sustainability_class ?? "grid",
    active_policies: input.active_policies ?? [],
  };

  if (!overlay.edge_zone_id || !overlay.jetson_family || !overlay.location) {
    throw new Error("EdgeZoneCognitiveOverlay requires edge_zone_id, jetson_family, location");
  }

  overlay.primary_index = overlay.edge_zone_id;
  overlay.secondary_indexes = {
    jetson_family: overlay.jetson_family,
    sustainability_class: overlay.sustainability_class,
    location: overlay.location,
  };

  return overlay;
}

/**
 * EdgeZoneEventProfile
 */
export function makeEdgeZoneEventProfile(input) {
  const profile = {
    edge_zone_id: input.edge_zone_id,
    time_bucket: input.time_bucket,
    crowd_index: input.crowd_index ?? null,
    noise_class: input.noise_class ?? null,
    overlay_mode: input.overlay_mode ?? null,
    energy_used_wh: input.energy_used_wh ?? null,
  };

  if (!profile.edge_zone_id || !profile.time_bucket) {
    throw new Error("EdgeZoneEventProfile requires edge_zone_id and time_bucket");
  }

  profile.primary_index = `${profile.edge_zone_id}::${profile.time_bucket}`;
  return profile;
}
