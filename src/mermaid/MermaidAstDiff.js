import crypto from "node:crypto";

export function computeAstHash(ast) {
  const stable = JSON.stringify(ast, Object.keys(ast).sort());
  return crypto.createHash("sha256").update(stable).digest("hex");
}

export function diffAst(oldAst, newAst) {
  const oldNodes = oldAst.nodes ?? {};
  const newNodes = newAst.nodes ?? {};
  const oldEdges = oldAst.edges ?? [];
  const newEdges = newAst.edges ?? [];

  const addedNodes = Object.keys(newNodes).filter(id => !oldNodes[id]);
  const removedNodes = Object.keys(oldNodes).filter(id => !newNodes[id]);

  const edgeKey = e => `${e.from}->${e.to}:${e.label ?? ""}`;
  const oldEdgeSet = new Set(oldEdges.map(edgeKey));
  const newEdgeSet = new Set(newEdges.map(edgeKey));

  const addedEdges = newEdges.filter(e => !oldEdgeSet.has(edgeKey(e)));
  const removedEdges = oldEdges.filter(e => !newEdgeSet.has(edgeKey(e)));

  const driftMagnitude =
    addedNodes.length +
    removedNodes.length +
    addedEdges.length +
    removedEdges.length;

  return {
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    driftMagnitude
  };
}
