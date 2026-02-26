// Bridge between Mermaid diagrams, ALN-style policy grammar, and Javaspectre's safety/transparency core.

import crypto from "node:crypto";
import { parse as parseMermaid } from "mermaid"; // Assumes mermaid v10+ bundled, or replace with @mermaid-js/ast wrapper.
import { ExcavationSafetyProfile } from "../core/SafetyAndTransparencyKernel.js";
import { createTransparencyEnvelope } from "../core/SafetyAndTransparencyKernel.js";

/**
 * Parse Mermaid text into a normalized AST shape.
 * This avoids leaking internal Mermaid structures into the rest of the system.
 */
export async function parseMermaidToAst(diagramText, opts = {}) {
  if (typeof diagramText !== "string" || !diagramText.trim()) {
    throw new Error("parseMermaidToAst requires non-empty diagram text.");
  }

  const id = opts.id || `mmd-${crypto.randomUUID()}`;
  const type = detectDiagramType(diagramText);

  // mermaid.parse returns an object with a graph model; wrap into our canonical form.
  // Note: in some builds you may need `await parseMermaid(diagramText)` or a different entrypoint.
  const raw = parseMermaid(diagramText);

  const nodes = [];
  const edges = [];
  const meta = {
    id,
    type,
    title: extractTitleComment(diagramText),
    rawDirectives: extractDirectiveComments(diagramText),
  };

  // Very conservative extraction; you can refine per diagram type.
  if (raw && raw.db && typeof raw.db.getVertices === "function") {
    const verts = raw.db.getVertices();
    for (const [key, v] of Object.entries(verts)) {
      nodes.push({
        id: key,
        text: v.text || v.id || key,
        type: v.type || "node",
      });
    }
  }

  if (raw && raw.db && typeof raw.db.getEdges === "function") {
    const es = raw.db.getEdges();
    for (const e of es) {
      edges.push({
        id: `${e.start}-${e.end}-${e.stroke || "edge"}`,
        from: e.start,
        to: e.end,
        kind: e.stroke || "link",
        text: e.text || "",
      });
    }
  }

  return { id, type, nodes, edges, meta };
}

/**
 * Detects the Mermaid diagram type in a cheap, non-eval way.
 */
function detectDiagramType(text) {
  const src = text.toLowerCase();
  if (src.includes("stateDiagram-v2".toLowerCase()) || src.includes("statediagram-v2")) {
    return "stateDiagram-v2";
  }
  if (src.includes("sequenceDiagram".toLowerCase()) || src.includes("sequencediagram")) {
    return "sequenceDiagram";
  }
  if (src.includes("classDiagram".toLowerCase()) || src.includes("classdiagram")) {
    return "classDiagram";
  }
  if (src.includes("erDiagram".toLowerCase()) || src.includes("erdiagram")) {
    return "erDiagram";
  }
  if (src.includes("gitGraph".toLowerCase()) || src.includes("gitgraph")) {
    return "gitGraph";
  }
  if (src.includes("journey".toLowerCase())) {
    return "journey";
  }
  if (src.includes("pie".toLowerCase())) {
    return "pie";
  }
  // Default most policy diagrams to generic graph.
  return "graph";
}

/**
 * Extract first-line title-style comment, e.g., "%% title: Ledger Safety Graph".
 */
function extractTitleComment(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%%")) {
      const rest = trimmed.slice(2).trim();
      if (rest.toLowerCase().startsWith("title:")) {
        return rest.slice("title:".length).trim();
      }
    }
  }
  return null;
}

/**
 * Extracts directive-style comments as a simple key-value map, e.g.:
 * %% safety: tier-2
 * %% audience: auditor
 */
function extractDirectiveComments(text) {
  const directives = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%%")) continue;
    const rest = trimmed.slice(2).trim();
    const idx = rest.indexOf(":");
    if (idx === -1) continue;
    const key = rest.slice(0, idx).trim().toLowerCase();
    const value = rest.slice(idx + 1).trim();
    if (!key) continue;
    directives[key] = value;
  }
  return directives;
}

/**
 * Simple ALN-style policy grammar compiler.
 * Accepts a small DSL and produces a JSON policy object applicable to our AST.
 */
export function compileMermaidPolicy(policyText) {
  if (typeof policyText !== "string" || !policyText.trim()) {
    return {
      budgets: {},
      edgeBudgets: {},
      trustTiers: [],
      audience: null,
    };
  }

  const budgets = {};
  const edgeBudgets = {};
  const trustTiers = [];
  let audience = null;

  const lines = policyText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    // budget.nodes <= 18
    if (line.startsWith("budget.nodes")) {
      const match = line.match(/budget\.nodes\s*<=\s*(\d+)/);
      if (match) budgets.maxNodes = Number(match[1]);
      continue;
    }

    // budget.edge_density <= 0.67
    if (line.startsWith("budget.edge_density")) {
      const match = line.match(/budget\.edge_density\s*<=\s*([0-9.]+)/i);
      if (match) budgets.maxEdgeDensity = Number(match[1]);
      continue;
    }

    // safety.max_outgoing kind=policy <= 5
    if (line.startsWith("safety.max_outgoing")) {
      const kindMatch = line.match(/kind\s*=\s*([a-zA-Z0-9_-]+)/);
      const numMatch = line.match(/<=\s*(\d+)/);
      if (kindMatch && numMatch) {
        const kind = kindMatch[1];
        const limit = Number(numMatch[1]);
        edgeBudgets[kind] = limit;
      }
      continue;
    }

    // trust.node kind=policy tier=1 color=red
    if (line.startsWith("trust.node")) {
      const kindMatch = line.match(/kind\s*=\s*([a-zA-Z0-9_-]+)/);
      const tierMatch = line.match(/tier\s*=\s*([0-9]+)/);
      const colorMatch = line.match(/color\s*=\s*([a-zA-Z0-9_-]+)/);
      trustTiers.push({
        kind: kindMatch ? kindMatch[1] : "node",
        tier: tierMatch ? Number(tierMatch[1]) : 3,
        color: colorMatch ? colorMatch[1] : "green",
      });
      continue;
    }

    // audience: auditor|citizen|operator
    if (line.toLowerCase().startsWith("audience")) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        audience = line.slice(idx + 1).trim();
      }
    }
  }

  return { budgets, edgeBudgets, trustTiers, audience };
}

/**
 * Validate a Mermaid AST against a compiled policy.
 * Returns { ok, violations[], metrics }.
 */
export function validateMermaidAst(ast, policy) {
  const nodes = ast.nodes || [];
  const edges = ast.edges || [];
  const n = nodes.length;
  const e = edges.length;

  const violations = [];

  // Node and edge budgets.
  if (policy.budgets && typeof policy.budgets.maxNodes === "number") {
    if (n > policy.budgets.maxNodes) {
      violations.push(
        `Node budget exceeded: ${n} > ${policy.budgets.maxNodes}`
      );
    }
  }

  if (policy.budgets && typeof policy.budgets.maxEdgeDensity === "number" && n > 1) {
    const density = (2 * e) / (n * (n - 1));
    if (density > policy.budgets.maxEdgeDensity) {
      violations.push(
        `Edge density exceeded: ${density.toFixed(2)} > ${policy.budgets.maxEdgeDensity}`
      );
    }
  }

  // Per-kind outgoing edge budgets.
  if (policy.edgeBudgets && Object.keys(policy.edgeBudgets).length > 0) {
    const outgoingByNodeKind = new Map(); // key: nodeId|kind, value: count
    for (const edge of edges) {
      const key = `${edge.from}|${edge.kind || "link"}`;
      const prev = outgoingByNodeKind.get(key) || 0;
      outgoingByNodeKind.set(key, prev + 1);
    }

    for (const [key, count] of outgoingByNodeKind.entries()) {
      const [nodeId, kind] = key.split("|");
      const limit = policy.edgeBudgets[kind];
      if (typeof limit === "number" && count > limit) {
        violations.push(
          `Outgoing edge budget exceeded for node ${nodeId}, kind=${kind}: ${count} > ${limit}`
        );
      }
    }
  }

  const ok = violations.length === 0;
  const metrics = {
    nodes: n,
    edges: e,
    edgeDensity: n > 1 ? (2 * e) / (n * (n - 1)) : 0,
  };

  return { ok, violations, metrics };
}

/**
 * Map policy trust tiers into node annotations that downstream renderers can turn into classDef styles.
 */
export function decorateAstWithTrust(ast, policy) {
  const nodes = ast.nodes.map((node) => {
    const tierRule = findTierForNode(node, policy.trustTiers || []);
    if (!tierRule) return node;
    return {
      ...node,
      trustTier: tierRule.tier,
      colorHint: tierRule.color,
    };
  });

  return { ...ast, nodes };
}

function findTierForNode(node, rules) {
  if (!rules || rules.length === 0) return null;
  // Simple heuristic: match by node.type as "kind" when available.
  for (const rule of rules) {
    if (!rule.kind) continue;
    if ((node.type || "node").toLowerCase() === rule.kind.toLowerCase()) {
      return rule;
    }
  }
  return null;
}

/**
 * Full pipeline:
 *  - Parse Mermaid text to AST
 *  - Compile ALN-style policy
 *  - Validate and decorate AST
 *  - Produce a TransparencyEnvelope-compatible summary
 */
export async function analyzeMermaidDiagram({
  runId,
  intent,
  mode = "mermaid",
  diagramText,
  policyText,
  safetyProfileConfig,
  env,
}) {
  if (!runId) throw new Error("analyzeMermaidDiagram requires a runId.");
  if (!diagramText) throw new Error("analyzeMermaidDiagram requires diagramText.");

  const safetyProfile = new ExcavationSafetyProfile(
    safetyProfileConfig || { profileName: "mermaid-default" }
  );

  const ast = await parseMermaidToAst(diagramText);
  const policy = compileMermaidPolicy(policyText || "");
  const validation = validateMermaidAst(ast, policy);
  const decoratedAst = decorateAstWithTrust(ast, policy);

  // Use node count as a proxy for "nodesProcessed" budget.
  const stats = {
    nodesProcessed: ast.nodes.length,
    spansProcessed: 0,
    deepPassObjects: 0,
    runSeconds: 0, // caller can fill real runtime if desired.
  };

  // Enforce ExcavationSafetyProfile budgets (nodeBudget, etc.).
  const budgetResult = safetyProfile.enforceBudgets(stats);
  if (!budgetResult.ok) {
    // Intentionally let this throw; caller can catch & surface as policy violation.
    throw new Error(
      `Mermaid diagram exceeded ExcavationSafetyProfile budgets: ${budgetResult.violations.join(
        "; "
      )}`
    );
  }

  const inputsSummary = {
    sourceType: "mermaid",
    diagramType: ast.type,
    diagramId: ast.id,
    title: ast.meta.title,
  };

  const outputsSummary = {
    virtualObjects: 1,
    nodes: ast.nodes.length,
    edges: ast.edges.length,
    validationOk: validation.ok,
    violationCount: validation.violations.length,
  };

  const metrics = {
    nodesProcessed: stats.nodesProcessed,
    spansProcessed: stats.spansProcessed,
    deepPassObjects: stats.deepPassObjects,
    runSeconds: stats.runSeconds,
    edgeDensity: validation.metrics.edgeDensity,
  };

  // TransparencyEnvelope records that this run was governed by both ExcavationSafetyProfile and diagram policy.
  const envelope = createTransparencyEnvelope(
    runId,
    intent || `Analyze Mermaid diagram ${ast.id}`,
    mode,
    safetyProfile,
    inputsSummary,
    metrics,
    outputsSummary,
    validation.violations,
    [`policyAudience=${policy.audience || "unspecified"}`],
    [`diagramType=${ast.type}`],
    env || { javaspectreVersion: "edge-mermaid-0.1.0" }
  );

  return {
    ast: decoratedAst,
    policy,
    validation,
    envelope,
  };
}
