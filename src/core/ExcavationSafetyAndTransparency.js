// Policy-aware controller that applies ExcavationSafetyProfile and emits TransparencyEnvelopes.

import crypto from 'node:crypto';
import os from 'node:os';
import Persistence from './Persistence.js';
import ExcavationSessionManager from './ExcavationSessionManager.js';
import VirtualObjectScoreEngine from './VirtualObjectScoreEngine.js';
import VirtualObjectExcavator from './VirtualObjectExcavator.js';
import logger from './Logger.js';

// --------- Safety profile selection (ALN-governed) ---------

/**
 * Static catalog of safety profiles.
 * In production, this can be sourced from an ALN policy graph or config file.
 */
const SAFETY_PROFILES = {
  'edge-conservative': {
    id: 'edge-conservative',
    description: 'Strict profile for Jetson/mobile edge devices in public or unknown spaces.',
    maxDepth: 4,
    maxSnapshots: 4,
    maxArraySample: 4,
    redaction: {
      piiPatterns: ['email', 'ssn', 'phone', 'address'],
      aggressiveDomRedaction: true,
      keepOnlySemanticDomRoles: true
    },
    metricsBudget: {
      maxVirtualObjects: 2000,
      maxDomNodes: 5000,
      maxTraceSpans: 10000
    },
    confidenceThresholds: {
      noveltyMin: 0.4,
      stabilityMin: 0.5
    }
  },
  'citizen-default': {
    id: 'citizen-default',
    description: 'Balanced profile for augmented citizens in private or semi-private contexts.',
    maxDepth: 6,
    maxSnapshots: 10,
    maxArraySample: 8,
    redaction: {
      piiPatterns: ['email', 'ssn', 'phone'],
      aggressiveDomRedaction: false,
      keepOnlySemanticDomRoles: false
    },
    metricsBudget: {
      maxVirtualObjects: 5000,
      maxDomNodes: 15000,
      maxTraceSpans: 50000
    },
    confidenceThresholds: {
      noveltyMin: 0.3,
      stabilityMin: 0.4
    }
  },
  'analyst-expanded': {
    id: 'analyst-expanded',
    description: 'Profile for vetted operators and auditors in controlled environments.',
    maxDepth: 8,
    maxSnapshots: 20,
    maxArraySample: 16,
    redaction: {
      piiPatterns: ['ssn'],
      aggressiveDomRedaction: false,
      keepOnlySemanticDomRoles: false
    },
    metricsBudget: {
      maxVirtualObjects: 15000,
      maxDomNodes: 50000,
      maxTraceSpans: 200000
    },
    confidenceThresholds: {
      noveltyMin: 0.2,
      stabilityMin: 0.2
    }
  }
};

/**
 * Simple device-class heuristic. In production, ALN rules should resolve this.
 */
function detectDeviceClass() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'linux' && arch === 'arm64') {
    return 'jetson-edge';
  }
  if (platform === 'android') {
    return 'mobile';
  }
  if (platform === 'darwin' || platform === 'win32') {
    return 'desktop';
  }
  return 'cloud-node';
}

/**
 * Resolve a safety profile based on ALN-style context.
 * For now, uses simple rules; later, this can call into ALNKernel.
 */
export function selectSafetyProfile({ userRole, environment, deviceClass } = {}) {
  const resolvedDeviceClass = deviceClass || detectDeviceClass();
  const resolvedUserRole = userRole || 'citizen';
  const resolvedEnvironment = environment || 'unknown';

  // Edge/mobile always default to conservative.
  if (resolvedDeviceClass === 'jetson-edge' || resolvedDeviceClass === 'mobile') {
    return {
      profile: SAFETY_PROFILES['edge-conservative'],
      policyVersion: 'aln-policy-v1',
      policyPath: 'aln://policies/javaspectre/v1#edge',
      decisions: [
        {
          type: 'profile-selection',
          ruleId: 'device-edge-default',
          reason: 'Edge/mobile device => edge-conservative profile',
          timestamp: new Date().toISOString(),
          inputs: { userRole: resolvedUserRole, environment: resolvedEnvironment, deviceClass: resolvedDeviceClass }
        }
      ]
    };
  }

  // Private or controlled lab => analyst-expanded if role is operator/auditor.
  if (resolvedEnvironment === 'lab' || resolvedEnvironment === 'private-home') {
    if (resolvedUserRole === 'operator' || resolvedUserRole === 'auditor' || resolvedUserRole === 'developer') {
      return {
        profile: SAFETY_PROFILES['analyst-expanded'],
        policyVersion: 'aln-policy-v1',
        policyPath: 'aln://policies/javaspectre/v1#analyst',
        decisions: [
          {
            type: 'profile-selection',
            ruleId: 'role-analyst-lab',
            reason: 'Analyst/developer in lab/private context => analyst-expanded profile',
            timestamp: new Date().toISOString(),
            inputs: { userRole: resolvedUserRole, environment: resolvedEnvironment, deviceClass: resolvedDeviceClass }
          }
        ]
      };
    }
  }

  // Default citizen profile.
  return {
    profile: SAFETY_PROFILES['citizen-default'],
    policyVersion: 'aln-policy-v1',
    policyPath: 'aln://policies/javaspectre/v1#citizen',
    decisions: [
      {
        type: 'profile-selection',
        ruleId: 'default-citizen',
        reason: 'Fallback to citizen-default profile',
        timestamp: new Date().toISOString(),
        inputs: { userRole: resolvedUserRole, environment: resolvedEnvironment, deviceClass: resolvedDeviceClass }
      }
    ]
  };
}

// --------- Multihash + DID helpers ---------

/**
 * Compute a BLAKE3-256 hash of a JSON string.
 * In production, use a native BLAKE3 binding. Here we fall back to SHA-256 if BLAKE3 is unavailable.
 */
function computeContentHash(payloadString) {
  // Placeholder for a real BLAKE3 path. Using SHA-256 here for portability; label explains.
  const hash = crypto.createHash('sha256').update(payloadString).digest('hex');
  return {
    hashHex: hash,
    algorithm: 'sha2-256'
  };
}

/**
 * Very small multihash/multibase encoder for sha2-256.
 * multihash format: <varint code><varint length><digest>.
 * code for sha2-256 is 0x12, length 32 bytes. Then prefix with "f" (base16) for multibase.
 */
function toMultihashSha256(hashHex) {
  const prefix = '12'; // sha2-256 code
  const length = '20'; // 32 bytes in hex
  const mhHex = prefix + length + hashHex;
  return 'f' + mhHex; // base16 multibase
}

/**
 * Build a DID URI fragment bound to the hash, suitable for ION/Bostrom/etc.
 */
function buildDidFragment(hashHex, algorithm) {
  if (algorithm === 'sha2-256') {
    return `#sha256-${hashHex}`;
  }
  return `#${algorithm}-${hashHex}`;
}

// --------- TransparencyEnvelope construction ---------

/**
 * Build a TransparencyEnvelope JSON object from execution context and metrics.
 */
function buildTransparencyEnvelope({
  session,
  snapshot,
  safetyProfile,
  policyVersion,
  policyPath,
  deviceClass,
  environment,
  userRole,
  userConsentScope,
  provenanceChain,
  anchoringStatus,
  decisions,
  didUri
}) {
  const now = new Date().toISOString();
  const envelopeId = crypto.randomUUID();

  const safetyProfileJson = {
    id: safetyProfile.id,
    description: safetyProfile.description,
    limits: {
      maxDepth: safetyProfile.maxDepth,
      maxSnapshots: safetyProfile.maxSnapshots,
      maxArraySample: safetyProfile.maxArraySample,
      metricsBudget: safetyProfile.metricsBudget,
      confidenceThresholds: safetyProfile.confidenceThresholds
    },
    redaction: safetyProfile.redaction
  };

  const metricsJson = {
    sessionSummary: session.summary,
    snapshotLabel: snapshot.label,
    virtualObjects: snapshot.metrics.virtualObjects,
    relationships: snapshot.metrics.relationships,
    domSheets: snapshot.metrics.domSheets,
    deviceClass,
    environment,
    userRole,
    createdAtIso: now
  };

  const envelopeCore = {
    envelopeId,
    sessionId: session.id,
    snapshotId: snapshot.id,
    createdAtIso: now,
    safetyProfileId: safetyProfile.id,
    safetyProfile: safetyProfileJson,
    policyVersion,
    policyPath,
    deviceClass,
    environment,
    userRole,
    userConsentScope,
    metrics: metricsJson,
    provenanceChain,
    anchoringStatus,
    didUri,
    decisions
  };

  const payloadString = JSON.stringify(envelopeCore);
  const { hashHex, algorithm } = computeContentHash(payloadString);
  const multihash = toMultihashSha256(hashHex);
  const didFragment = buildDidFragment(hashHex, algorithm);

  return {
    envelopeId,
    sessionId: session.id,
    snapshotId: snapshot.id,
    createdAtIso: now,
    safetyProfileId: safetyProfile.id,
    safetyProfileJson,
    policyVersion,
    policyPath,
    deviceClass,
    environment,
    userRole,
    userConsentScope,
    contentHashHex: hashHex,
    hashAlgorithm: algorithm,
    contentMultihash: multihash,
    didUri,
    didFragment,
    provenanceChain,
    anchoringStatus,
    metricsJson,
    decisionsJson: decisions,
    notes: ''
  };
}

// --------- Persistence adapter extensions ---------

/**
 * Extend Persistence with envelope and DID persistence helpers.
 * This function mutates the Persistence prototype once at startup.
 */
export function extendPersistenceWithTransparency(persistenceInstance) {
  const db = persistenceInstance.db;

  // Prepare statements once.
  const insertDidStmt = db.prepare(`
    INSERT OR IGNORE INTO did_registry (
      did_uri, did_method, controller, created_at_iso, metadata_json
    ) VALUES (@did_uri, @did_method, @controller, @created_at_iso, @metadata_json)
  `);

  const insertEnvelopeStmt = db.prepare(`
    INSERT INTO transparency_envelopes (
      envelope_id, session_id, snapshot_id, created_at_iso,
      safety_profile_id, safety_profile_json, policy_version, policy_path,
      device_class, environment, user_role, user_consent_scope,
      content_hash_hex, hash_algorithm, content_multihash,
      did_uri, did_fragment,
      provenance_chain, anchoring_status,
      metrics_json, decisions_json, notes
    ) VALUES (
      @envelope_id, @session_id, @snapshot_id, @created_at_iso,
      @safety_profile_id, @safety_profile_json, @policy_version, @policy_path,
      @device_class, @environment, @user_role, @user_consent_scope,
      @content_hash_hex, @hash_algorithm, @content_multihash,
      @did_uri, @did_fragment,
      @provenance_chain, @anchoring_status,
      @metrics_json, @decisions_json, @notes
    )
  `);

  persistenceInstance.saveDidDocument = function saveDidDocument({
    didUri,
    didMethod,
    controller,
    metadata
  }) {
    const payload = {
      did_uri: didUri,
      did_method: didMethod,
      controller: controller || null,
      created_at_iso: new Date().toISOString(),
      metadata_json: JSON.stringify(metadata || {})
    };
    insertDidStmt.run(payload);
  };

  persistenceInstance.saveTransparencyEnvelope = function saveTransparencyEnvelope(envelope) {
    const payload = {
      envelope_id: envelope.envelopeId,
      session_id: envelope.sessionId,
      snapshot_id: envelope.snapshotId,
      created_at_iso: envelope.createdAtIso,
      safety_profile_id: envelope.safetyProfileId,
      safety_profile_json: JSON.stringify(envelope.safetyProfileJson),
      policy_version: envelope.policyVersion,
      policy_path: envelope.policyPath,
      device_class: envelope.deviceClass,
      environment: envelope.environment,
      user_role: envelope.userRole,
      user_consent_scope: envelope.userConsentScope,
      content_hash_hex: envelope.contentHashHex,
      hash_algorithm: envelope.hashAlgorithm,
      content_multihash: envelope.contentMultihash,
      did_uri: envelope.didUri,
      did_fragment: envelope.didFragment,
      provenance_chain: JSON.stringify(envelope.provenanceChain || []),
      anchoring_status: JSON.stringify(envelope.anchoringStatus || {}),
      metrics_json: JSON.stringify(envelope.metricsJson),
      decisions_json: JSON.stringify(envelope.decisionsJson),
      notes: envelope.notes || ''
    };
    insertEnvelopeStmt.run(payload);
  };

  logger.info('transparency-persistence-extended', { scope: 'persistence' });
}

// --------- High-level orchestrator ---------

/**
 * Run a safety-governed excavation (JSON/DOM/HAR/trace) and emit a TransparencyEnvelope.
 *
 * This is designed to be called by CLI entrypoints instead of wiring SessionManager and
 * ScoreEngine manually. It keeps the safety + transparency cycle unified.
 */
export async function runSafeExcavation({
  inputLabel,
  inputValue,
  inputType,       // "json-file", "har-file", "dom-snapshot", "otel-spans", etc.
  domRoot = null,
  userRole = 'citizen',
  environment = 'unknown',
  userConsentScope = 'unspecified',
  didUri = 'did:bostrom:transparency-root'
}) {
  const deviceClass = detectDeviceClass();
  const { profile, policyVersion, policyPath, decisions } = selectSafetyProfile({
    userRole,
    environment,
    deviceClass
  });

  const persistence = new Persistence({ ensureSchema: true });
  extendPersistenceWithTransparency(persistence);

  const sessionManager = new ExcavationSessionManager({
    maxDepth: profile.maxDepth,
    maxSnapshots: profile.maxSnapshots,
    persistence
  });

  const scorer = new VirtualObjectScoreEngine({ historyWindow: 20 });
  const excavator = new VirtualObjectExcavator({
    maxDepth: profile.maxDepth,
    maxArraySample: profile.maxArraySample,
    includeDom: Boolean(domRoot)
  });

  const session = sessionManager.startSession(inputLabel, {
    sourceType: inputType,
    deviceClass,
    environment,
    userRole,
    userConsentScope
  });

  // Single deep pass by default; callers can still layer shallow/deep via MultiPassEngine.
  const excavationResult = excavator.excavate({ value: inputValue, domRoot });
  const snapshot = sessionManager.addSnapshot(session.id, excavationResult, `deep-${inputType}`);

  const scores = scorer.scoreSnapshot(snapshot);
  persistence.saveScores(snapshot.id, scores);

  // Truncate metrics according to budget for safety.
  const budgetedSnapshotMetrics = {
    ...snapshot.metrics,
    virtualObjects: Math.min(snapshot.metrics.virtualObjects, profile.metricsBudget.maxVirtualObjects),
    domSheets: Math.min(snapshot.metrics.domSheets, profile.metricsBudget.maxDomNodes)
  };

  const enrichedSession = {
    ...session,
    summary: {
      ...session.summary,
      virtualObjects: budgetedSnapshotMetrics.virtualObjects,
      domSheets: budgetedSnapshotMetrics.domSheets
    }
  };

  const envelope = buildTransparencyEnvelope({
    session: enrichedSession,
    snapshot: { ...snapshot, metrics: budgetedSnapshotMetrics },
    safetyProfile: profile,
    policyVersion,
    policyPath,
    deviceClass,
    environment,
    userRole,
    userConsentScope,
    provenanceChain: [],
    anchoringStatus: {
      bostrom: 'not_scheduled',
      ethereum: 'not_scheduled',
      ion: 'not_scheduled',
      aln: 'not_scheduled'
    },
    decisions,
    didUri
  });

  // Ensure DID registry entry exists and persist envelope.
  persistence.saveDidDocument({
    didUri: envelope.didUri,
    didMethod: envelope.didUri.split(':')[1] || 'unknown',
    controller: null,
    metadata: { purpose: 'javaspectre-transparency-root' }
  });

  persistence.saveTransparencyEnvelope(envelope);
  persistence.close();

  logger.info('safe-excavation-complete', {
    sessionId: session.id,
    envelopeId: envelope.envelopeId,
    safetyProfileId: profile.id
  });

  return {
    sessionId: session.id,
    snapshotId: snapshot.id,
    envelopeId: envelope.envelopeId,
    safetyProfileId: profile.id,
    scores
  };
}

export default {
  runSafeExcavation,
  selectSafetyProfile,
  extendPersistenceWithTransparency
};
