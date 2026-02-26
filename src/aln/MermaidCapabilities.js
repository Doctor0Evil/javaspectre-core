import { MermaidAstEngine } from "../mermaid/MermaidAstEngine.js";

export function isGraphValid(ast, budgets) {
  const engine = new MermaidAstEngine(budgets);
  engine.graph = ast;
  const { ok } = engine.validate();
  return ok;
}

export function getGraphTrustTier(ast, budgets) {
  const engine = new MermaidAstEngine(budgets);
  engine.graph = ast;
  const result = engine.validate();

  const b = result.budget;
  const budgetAdherence =
    (1 - Math.max(b.nodeUtilization, b.edgeUtilization)) || 0;

  if (!result.ok) {
    return {
      tier: "prohibited",
      budgetAdherence,
      validationErrors: result.errors,
      validationWarnings: result.warnings
    };
  }

  if (b.nodeUtilization > 0.8 || b.edgeUtilization > 0.8) {
    return {
      tier: "review-required",
      budgetAdherence,
      validationErrors: [],
      validationWarnings: result.warnings
    };
  }

  return {
    tier: "auto-use",
    budgetAdherence,
    validationErrors: [],
    validationWarnings: result.warnings
  };
}
