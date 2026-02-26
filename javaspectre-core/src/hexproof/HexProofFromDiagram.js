export function buildHexProofFromDiagram(envelope) {
  const { ast, contentHash, runId, intent } = envelope;

  const nodeById = new Map(ast.nodes.map(n => [n.id, n]));

  const instanceNode = nodeById.get("HPI");
  const definitionNode = nodeById.get("HPD");

  if (!instanceNode || !definitionNode) {
    throw new Error("HexProofFromDiagram: missing HPI or HPD node in AST.");
  }

  const hexProofDefinition = {
    kind: "HexProofDefinition",
    definitionId: `hexdef-${runId}`,
    diagramContentHash: contentHash,
    label: definitionNode.label,
    graphKind: ast.kind,
    tiers: envelope.summary.tiers,
    budgets: {
      maxNodes: envelope.safetyProfile.maxNodes,
      maxEdges: envelope.safetyProfile.maxEdges,
      maxSubgraphs: envelope.safetyProfile.maxSubgraphs,
      maxDepth: envelope.safetyProfile.maxDepth
    },
    intent,
    createdAt: envelope.timestamp
  };

  const hexProofInstance = {
    kind: "HexProofInstance",
    instanceId: `hexinst-${runId}`,
    definitionId: hexProofDefinition.definitionId,
    diagramRunId: runId,
    diagramContentHash: contentHash,
    entryNodeId: instanceNode.id,
    anchorHintNodeId: "AM",
    createdAt: envelope.timestamp
  };

  return { hexProofDefinition, hexProofInstance };
}
