// Bootstrap module for wiring Javaspectre chat stack with ALN research kernel.
// Provides production-ready instantiation and configuration for research-mode chat turns.

import AlnResearchKernel from '../core/AlnResearchKernel.js';
import HaloBridgeIndexKernel from '../nanoswarm/HaloBridgeIndexKernel.js';
import { createLawfulWorkflowProfile, createGovernanceRecord } from '../governance/AlnGovernanceObjects.js';

/**
 * Research kernel singleton instance.
 * Initialized once per worker process.
 */
export let researchKernel = null;

/**
 * Halo bridge index kernel singleton instance.
 * Connects NanoData to nanoswarm_indexes for ALN queries.
 */
export let haloBridgeKernel = null;

/**
 * Default lawful workflow profile for SourzeWizard space.
 */
export let defaultWorkflowProfile = null;

/**
 * Initialize the research stack with configuration.
 * @param {Object} config - Initialization configuration
 * @returns {Object} Initialized stack components
 */
export function initializeResearchStack(config) {
  if (researchKernel) {
    console.warn('Research stack already initialized. Returning existing instance.');
    return {
      researchKernel,
      haloBridgeKernel,
      defaultWorkflowProfile
    };
  }

  // Initialize ALN Research Kernel
  researchKernel = new AlnResearchKernel({
    javaspectreVersion: config?.javaspectreVersion ?? '0.2.0',
    maxDepth: config?.maxDepth ?? 6,
    maxArraySample: config?.maxArraySample ?? 8,
    includeDom: config?.includeDom ?? true,
    safetyProfileName: config?.safetyProfileName ?? 'chat-research-default',
    nodeBudget: config?.nodeBudget ?? 20000,
    traceSpanBudget: config?.traceSpanBudget ?? 50000,
    deepPassBudget: config?.deepPassBudget ?? 2000,
    maxRunSeconds: config?.maxRunSeconds ?? 15,
    minConfidenceForAutoUse: config?.minConfidenceForAutoUse ?? 0.85,
    minConfidenceForDisplay: config?.minConfidenceForDisplay ?? 0.4,
    maxDriftForAutoUse: config?.maxDriftForAutoUse ?? 0.2,
    maxDriftForCitizenUI: config?.maxDriftForCitizenUI ?? 0.6,
    bostromRpcUrl: config?.bostromRpcUrl ?? 'https://lcd.bostrom.cybernode.ai',
    bostromFromAddress: config?.bostromFromAddress ?? 'bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7',
    evmEnabled: config?.evmEnabled ?? true,
    evmRpcUrl: config?.evmRpcUrl ?? null,
    evmContractAddress: config?.evmContractAddress ?? null,
    evmFromAddress: config?.evmFromAddress ?? '0x519fC0eB4111323Cac44b70e1aE31c30e405802D',
    didEnabled: config?.didEnabled ?? true,
    didController: config?.didController ?? 'did:example:aln-node-01',
    ionEndpoint: config?.ionEndpoint ?? null
  });

  // Initialize Halo Bridge Index Kernel
  haloBridgeKernel = new HaloBridgeIndexKernel({
    profileName: config?.haloProfileName ?? 'nanoswarm-default',
    nodeBudget: config?.nodeBudget ?? 20000,
    traceSpanBudget: config?.traceSpanBudget ?? 50000,
    deepPassBudget: config?.deepPassBudget ?? 2000,
    maxRunSeconds: config?.maxRunSeconds ?? 15,
    role: config?.role ?? 'citizen',
    deviceClass: config?.deviceClass ?? 'edge-unknown',
    networkTrust: config?.networkTrust ?? 'verified',
    consentLevel: config?.consentLevel ?? 'full',
    locationHint: config?.locationHint ?? null
  });

  // Create default lawful workflow profile
  defaultWorkflowProfile = createLawfulWorkflowProfile({
    koPurpose: 'Default governed workflow for SourzeWizard Javaspectre research interactions'
  });

  // Validate profile on initialization
  const validation = defaultWorkflowProfile.validate();
  if (!validation.valid) {
    throw new Error(`Workflow profile validation failed: ${validation.violations.join('; ')}`);
  }

  console.log('Javaspectre ALN research stack initialized successfully.');
  console.log(`Workflow Profile: ${defaultWorkflowProfile.profileId}`);
  console.log(`Sovereignty Compliant: ${validation.valid}`);

  return {
    researchKernel,
    haloBridgeKernel,
    defaultWorkflowProfile
  };
}

/**
 * Process a research-mode chat turn.
 * @param {Object} params - Chat turn parameters
 * @returns {Promise<Object>} Research result with governance record
 */
export async function processResearchChatTurn(params) {
  if (!researchKernel) {
    throw new Error('Research stack not initialized. Call initializeResearchStack first.');
  }

  const {
    intent,
    mode,
    input,
    userContext,
    alnContext
  } = params;

  // Run research turn through kernel
  const researchResult = await researchKernel.runResearchTurn({
    intent,
    mode,
    input,
    userContext,
    alnContext: {
      ...alnContext,
      workflowProfileId: defaultWorkflowProfile.profileId
    }
  });

  // Create governance record from research result
  const governanceRecord = createGovernanceRecord({
    workflowProfileId: defaultWorkflowProfile.profileId,
    runId: researchResult.runId,
    problemHypothesis: intent,
    assumptionsAndConstraints: alnContext?.assumptions ?? [],
    workflowGraph: {
      stages: ['sensing', 'ingestion', 'transformation', 'reasoning', 'decision', 'actuation', 'feedback'],
      trustBoundaries: ['user-device', 'edge-processing', 'ledger-anchoring'],
      dataFlow: mode
    },
    stressTestScenarios: researchResult.scores?.map(s => ({
      objectId: s.id,
      scenario: `stability-${s.stability.toFixed(2)}-drift-${(1 - s.novelty).toFixed(2)}`,
      outcome: s.confidence >= 0.85 ? 'pass' : 'review-required'
    })) ?? [],
    alternateArchitectures: [
      { name: 'centralized-orchestrator', description: 'Single AI model with policy gates' },
      { name: 'distributed-swarm', description: 'Multiple specialized agents with consensus' }
    ],
    openResearchQuestions: [
      'How can neuromorphic consent gates improve sovereignty enforcement?',
      'What cryptographic proofs validate intent in cyber-physical systems?',
      'How do bio-ecological feedback loops influence computational resource allocation?'
    ],
    suggestedExperiments: [
      {
        name: 'consent-gate-prototype',
        description: 'Toy neuromorphic circuit implementing consent verification',
        metrics: ['latency', 'accuracy', 'user-trust-score']
      },
      {
        name: 'swarm-consensus-test',
        description: 'Multi-agent consensus under contradictory governance signals',
        metrics: ['convergence-time', 'agreement-rate', 'energy-consumption']
      }
    ],
    envelopeHash: researchResult.envelope?.contentHash ?? null,
    manifestId: researchResult.anchorManifest?.manifestId ?? null,
    commitments: researchResult.anchorManifest?.commitments ?? []
  });

  // Validate governance record against workflow profile
  const recordValidation = governanceRecord.validateAgainstProfile(defaultWorkflowProfile);
  if (!recordValidation.valid) {
    console.warn('Governance record validation warnings:', recordValidation.violations);
  }

  return {
    researchResult,
    governanceRecord,
    workflowProfile: defaultWorkflowProfile,
    validation: recordValidation,
    sovereigntyCompliant: recordValidation.valid && defaultWorkflowProfile.validate().valid
  };
}

/**
 * Get stack status and health metrics.
 * @returns {Object} Stack status
 */
export function getStackStatus() {
  return {
    initialized: !!researchKernel,
    researchKernel: researchKernel ? {
      version: researchKernel.environment.javaspectreVersion,
      nodeVersion: researchKernel.environment.nodeVersion
    } : null,
    haloBridgeKernel: !!haloBridgeKernel,
    workflowProfile: defaultWorkflowProfile ? defaultWorkflowProfile.getSummary() : null,
    sovereigntyCompliant: defaultWorkflowProfile?.validate().valid ?? false,
    timestamp: Date.now()
  };
}

/**
 * Export stack components for external use.
 * @returns {Object} Exportable stack
 */
export function exportStack() {
  return {
    researchKernel: researchKernel ? researchKernel.toJSON() : null,
    haloBridgeKernel: haloBridgeKernel ? haloBridgeKernel.toJSON() : null,
    workflowProfile: defaultWorkflowProfile ? defaultWorkflowProfile.toJSON() : null,
    exportedAt: Date.now()
  };
}

export default {
  initializeResearchStack,
  processResearchChatTurn,
  getStackStatus,
  exportStack
};
export const researchKernel = new AlnResearchKernel({
  javaspectreVersion: '0.2.0',
  bostromRpcUrl: 'https://lcd.bostrom.cybernode.ai',
  bostromFromAddress: 'bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7',
  evmEnabled: true,
  evmRpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
  evmContractAddress: '0x0000000000000000000000000000000000000000',
  didEnabled: true,
  didController: 'did:example:aln-node-01'
});
