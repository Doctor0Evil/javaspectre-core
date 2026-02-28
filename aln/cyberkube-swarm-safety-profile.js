// ALN-driven safety policy profile for CyberKube-enabled medical swarms.

export const CyberKubeSwarmSafetyProfile = {
  profileName: "cyberkube-medical-v1",
  version: "1.0.0",
  context: {
    domain: "medical-cybernetics",
    audience: "clinician",
    neurorightsBaseline: [
      "mental-privacy",
      "cognitive-liberty",
      "identity-continuity",
      "fair-access"
    ]
  },
  identity: {
    requiredRoles: ["citizen", "clinician", "governance-board"],
    roleScopes: {
      citizen: ["consent.manage", "override.local-emergency"],
      clinician: ["session.start", "session.stop", "parameter.adjust-bounded"],
      "governance-board": ["behavior.approve", "policy.update"]
    }
  },
  consentPolicy: {
    requireExplicit: true,
    maxValidityHours: 24,
    requireAnchorOnBostrom: true,
    revokeOnContextChange: ["location", "device-class", "network-trust"]
  },
  rustSafetyCaps: {
    maxForceNewtons: 5.0,
    maxSpeedMps: 0.2,
    maxTorqueNm: 0.5,
    maxControlRateHz: 50,
    maxNeighborsPerNode: 8
  },
  swarmBudgets: {
    maxRobotsPerSession: 32,
    maxMessagesPerRobotPerSecond: 50,
    maxSessionSeconds: 3600,
    maxTopologyReconfigPerMinute: 4
  },
  telemetryRedaction: {
    enable: true,
    fields: [
      "raw-eeg",
      "full-video-frame",
      "voice-audio",
      "implant-serial-number"
    ],
    strategy: "on-device-aggregate",
    exportOnly: ["risk-score", "outcome-summary", "safety-metrics"]
  },
  trustTiers: {
    autoUse: {
      minConfidence: 0.9,
      maxDrift: 0.1
    },
    showWithWarning: {
      minConfidence: 0.6,
      maxDrift: 0.3
    },
    quarantine: {
      maxConfidence: 0.6,
      maxDrift: 1.0
    }
  },
  anchoring: {
    homeChain: "bostrom",
    enabledLedgers: ["bostrom", "evm", "did"],
    requireMultiSig: true,
    minSigners: 3,
    roles: ["clinician", "safety-engineer", "ethics-rep"]
  },
  evaluationCriteria: {
    medicalSafety: [
      "no-violation-of-force-speed-limits",
      "fails-safe-on-communication-loss",
      "local-override-always-available"
    ],
    socialDisruption: [
      "no-remote-override-without-local-consent",
      "no-economic-incentive-to-extend-session",
      "transparent-session-logs-anchored"
    ],
    infiltrationResistance: [
      "all-policies-versioned-and-anchored",
      "behavior-drift-bounded-and-monitored",
      "no-unsigned-model-or-policy-loads"
    ]
  }
};

export function getRustGuardParams() {
  const { rustSafetyCaps, swarmBudgets } = CyberKubeSwarmSafetyProfile;
  return { rustSafetyCaps, swarmBudgets };
}

export function getAnchoringPolicy() {
  return CyberKubeSwarmSafetyProfile.anchoring;
}
