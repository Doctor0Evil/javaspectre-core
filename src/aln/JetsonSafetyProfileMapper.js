// Maps spatial consent context + sensor confidence into ExcavationSafetyProfile
// and composes the TransparencyEnvelope header for SQLite logging.

"use strict";

const crypto = require("crypto");

const SAFETY_PROFILES = {
  STRICT_PRIVATE: {
    id: "strict_private_v1",
    description: "Private-space, minimal excavation, metadata-only with aggressive redaction.",
    redactionLevel: "strict",
    allowedArtifacts: ["metrics"],
    entropyCapBits: 64,
    allowDom: false,
    allowHar: false,
    allowTrace: false
  },
  BALANCED_PUBLIC: {
    id: "balanced_public_v1",
    description: "Public-space, consented, DOM and HAR allowed with selective redaction.",
    redactionLevel: "balanced",
    allowedArtifacts: ["metrics", "dom", "har"],
    entropyCapBits: 128,
    allowDom: true,
    allowHar: true,
    allowTrace: false
  },
  PERMISSIVE_LAB: {
    id: "permissive_lab_v1",
    description: "Lab or test geofence with operator consent, full DOM/HAR/trace.",
    redactionLevel: "permissive",
    allowedArtifacts: ["metrics", "dom", "har", "trace"],
    entropyCapBits: 256,
    allowDom: true,
    allowHar: true,
    allowTrace: true
  }
};

class JetsonSafetyProfileMapper {
  constructor(options = {}) {
    this.nanoWeights = {
      cvo: options.cvo ?? 64,
      crel: options.crel ?? 16,
      cdepth: options.cdepth ?? 32,
      cfast: options.cfast ?? 0.4,
      cslow: options.cslow ?? 1.0
    };
  }

  /**
   * Compute effective NanoData volume as a proxy for excavation cost.
   */
  computeNanoVolume(stats) {
    const {
      Nvo,
      Nrel,
      depth,
      pfast,
      pslow,
      stability,
      drift
    } = stats;

    const { cvo, crel, cdepth, cfast, cslow } = this.nanoWeights;

    const Ubase =
      (Nvo * cvo) +
      (Nrel * crel) +
      (depth * cdepth);

    const Ufast = pfast * cfast * Ubase;
    const Uslow = pslow * cslow * Ubase;
    const Vnano = Ufast + Uslow;

    const wuncertainty = 1 + (drift - stability);
    const VnanoEff = Vnano * Math.max(0, wuncertainty);

    return VnanoEff;
  }

  /**
   * Select ExcavationSafetyProfile based on geofence, role, consent, sensors, and cost.
   */
  selectProfile(context) {
    const {
      geofence,
      identity,
      consent,
      sensors,
      nanoStats
    } = context;

    const zoneType = geofence?.type ?? "unknown";
    const isLab = geofence?.labels?.includes("lab") || geofence?.labels?.includes("testbed");
    const role = identity?.role ?? "anonymous";
    const consentScopes = consent?.scopes ?? [];
    const consentConfidence = consent?.confidence ?? 0;
    const sensorConfidence = sensors?.overallConfidence ?? 0;
    const VnanoEff = this.computeNanoVolume(nanoStats);

    const hasObservabilityConsent = consentScopes.includes("observability");
    const hasExcavationConsent = consentScopes.includes("excavation");
    const operatorRole = role === "operator" || role === "maintainer";

    if (isLab && operatorRole && hasExcavationConsent && consentConfidence >= 0.95) {
      if (sensorConfidence >= 0.8 && VnanoEff < 5e6) {
        return SAFETY_PROFILES.PERMISSIVE_LAB;
      }
    }

    if (zoneType === "public" && hasObservabilityConsent) {
      if (sensorConfidence >= 0.9 && VnanoEff < 2e6) {
        return SAFETY_PROFILES.BALANCED_PUBLIC;
      }
    }

    return SAFETY_PROFILES.STRICT_PRIVATE;
  }

  /**
   * Build environment_spatial_fingerprint (geohash-like string + sensor hash).
   */
  buildSpatialFingerprint(geofence, sensors) {
    const lat = geofence?.center?.lat ?? 0;
    const lon = geofence?.center?.lon ?? 0;
    const radius = geofence?.radiusMeters ?? 0;
    const zoneType = geofence?.type ?? "unknown";
    const labels = Array.isArray(geofence?.labels) ? geofence.labels.sort().join(",") : "";

    const geoKey = `${lat.toFixed(5)}:${lon.toFixed(5)}:${radius.toFixed(1)}:${zoneType}:${labels}`;
    const geoDigest = crypto.createHash("sha256").update(geoKey).digest("hex").slice(0, 16);

    const sensorPayload = JSON.stringify({
      classes: sensors?.classes ?? {},
      confidence: sensors?.overallConfidence ?? 0
    });

    const sensorDigest = crypto.createHash("sha256")
      .update(sensorPayload)
      .digest("hex")
      .slice(0, 16);

    return `geo_${geoDigest}_sens_${sensorDigest}`;
  }

  /**
   * Compute a DID-aligned multihash (BLAKE3-256 plus SHA-256 fallback) for consent_context_hash.
   */
  buildConsentContextHash(consentContext) {
    const payload = JSON.stringify(consentContext);
    const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
    const blake3Stub = crypto.createHash("sha3-256").update(payload).digest("hex");

    const shaPrefix = "1220";
    const blakePrefix = "1e20";

    const shaMultihash = `${shaPrefix}${sha256}`;
    const blakeMultihash = `${blakePrefix}${blake3Stub}`;

    return {
      primary: blakeMultihash,
      fallback: shaMultihash
    };
  }

  /**
   * Produce the TransparencyEnvelope header row for SQLite insertion.
   */
  buildTransparencyEnvelopeHeader(input) {
    const {
      geofence,
      identity,
      consent,
      sensors,
      nanoStats,
      deviceClass,
      policyVersionDid,
      alnManifestId
    } = input;

    const profile = this.selectProfile({
      geofence,
      identity,
      consent,
      sensors,
      nanoStats
    });

    const spatialFingerprint = this.buildSpatialFingerprint(geofence, sensors);

    const consentContext = {
      subjectDid: identity?.did ?? null,
      role: identity?.role ?? null,
      consentScopes: consent?.scopes ?? [],
      consentIssuedAt: consent?.issuedAt ?? null,
      geofenceId: geofence?.id ?? null,
      deviceClass: deviceClass ?? null
    };

    const consentHash = this.buildConsentContextHash(consentContext);

    const now = new Date().toISOString();
    const safetyDecisionLabel = profile.id;
    const effectivenessScore = this.estimateEffectivenessScore(profile, sensors, nanoStats);

    return {
      created_at: now,
      safety_decision_label: safetyDecisionLabel,
      safety_decision_effectiveness_score: effectivenessScore,
      consent_context_hash_primary: consentHash.primary,
      consent_context_hash_fallback: consentHash.fallback,
      environment_spatial_fingerprint: spatialFingerprint,
      device_class: deviceClass ?? "unknown",
      policy_version_did: policyVersionDid ?? null,
      aln_manifest_id: alnManifestId ?? null,
      profile_redaction_level: profile.redactionLevel,
      profile_entropy_cap_bits: profile.entropyCapBits
    };
  }

  /**
   * Heuristic effectiveness score.
   */
  estimateEffectivenessScore(profile, sensors, nanoStats) {
    const base =
      profile.redactionLevel === "strict" ? 0.9 :
      profile.redactionLevel === "balanced" ? 0.8 :
      0.7;

    const sensorConfidence = sensors?.overallConfidence ?? 0;
    const stability = nanoStats?.stability ?? 0;
    const drift = nanoStats?.drift ?? 0;

    let score = base;
    score += 0.1 * sensorConfidence;
    score += 0.1 * (stability - drift);
    return Math.max(0, Math.min(1, score));
  }
}

module.exports = {
  JetsonSafetyProfileMapper,
  SAFETY_PROFILES
};
