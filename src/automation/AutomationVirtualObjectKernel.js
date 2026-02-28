// Kernel for compiling cross-stack automation graphs (Mermaid-style AST)
// into typed virtual-objects, with safety coverage and audit metadata.

export class AutomationVirtualObjectKernel {
  constructor(options) {
    this.defaultDomain = options?.defaultDomain || "generic-automation";
    this.requireSafety = options?.requireSafety ?? true;
    this.allowedAutomationKinds = new Set([
      "job",
      "workflow",
      "tunnel",
      "service",
      "policy",
      "envelope",
      "anchor"
    ]);
  }

  compile(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error("AutomationVirtualObjectKernel.compile: invalid graph input");
    }

    const instances = [];
    const definitions = [];
    const policies = [];
    const envelopes = [];
    const anchors = [];
    const workflows = [];
    const tunnels = [];
    const services = [];
    const errors = [];

    const nodeIndex = new Map();
    for (const node of graph.nodes) {
      if (!node.id) {
        errors.push({ kind: "node-missing-id", node });
        continue;
      }
      nodeIndex.set(node.id, node);
      const classified = this.classifyNode(node);
      if (classified.kind === "error") {
        errors.push({ kind: "node-unsupported-kind", node, info: classified.info });
        continue;
      }
      switch (classified.kind) {
        case "instance": instances.push(classified); break;
        case "definition": definitions.push(classified); break;
        case "policy": policies.push(classified); break;
        case "envelope": envelopes.push(classified); break;
        case "anchor": anchors.push(classified); break;
        case "workflow": workflows.push(classified); break;
        case "tunnel": tunnels.push(classified); break;
        case "service": services.push(classified); break;
        case "ignore": default: break;
      }
    }

    const typedEdges = this.classifyEdges(graph.edges, nodeIndex, errors);
    const safetyCoverage = this.analyzeSafetyCoverage(
      instances,
      workflows,
      policies,
      tunnels,
      typedEdges
    );

    if (this.requireSafety && !safetyCoverage.ok) {
      errors.push({
        kind: "safety-coverage-failed",
        message: safetyCoverage.message,
        violations: safetyCoverage.violations
      });
    }

    const compiled = {
      domain: this.defaultDomain,
      instances,
      definitions,
      policies,
      envelopes,
      anchors,
      workflows,
      tunnels,
      services,
      edges: typedEdges,
      subgraphs: graph.subgraphs || [],
      safetyCoverage,
      errors
    };

    return compiled;
  }

  classifyNode(node) {
    const id = String(node.id);
    const label = typeof node.label === "string" ? node.label : null;
    const meta = typeof node.meta === "object" && node.meta !== null ? node.meta : {};
    const typeHint = meta.type || this.inferTypeFromId(id);
    const automationKind = meta.automationKind || this.inferAutomationKindFromMeta(meta);

    if (automationKind && !this.allowedAutomationKinds.has(automationKind)) {
      return { kind: "error", info: `Unsupported automationKind '${automationKind}'` };
    }

    if (typeHint === "ignore") {
      return { kind: "ignore", id, label, meta, automationKind };
    }

    if (typeHint === "instance") {
      return this.toInstance(id, label, meta, automationKind);
    }
    if (typeHint === "definition") {
      return this.toDefinition(id, label, meta, automationKind);
    }
    if (typeHint === "policy") {
      return this.toPolicy(id, label, meta);
    }
    if (typeHint === "envelope") {
      return this.toEnvelope(id, label, meta);
    }
    if (typeHint === "anchor") {
      return this.toAnchor(id, label, meta);
    }
    if (typeHint === "workflow") {
      return this.toWorkflow(id, label, meta);
    }
    if (typeHint === "tunnel") {
      return this.toTunnel(id, label, meta);
    }
    if (typeHint === "service") {
      return this.toService(id, label, meta);
    }

    return { kind: "ignore", id, label, meta, automationKind };
  }

  inferTypeFromId(id) {
    if (id.startsWith("inst")) return "instance";
    if (id.startsWith("def")) return "definition";
    if (id.startsWith("pol")) return "policy";
    if (id.startsWith("env")) return "envelope";
    if (id.startsWith("anc")) return "anchor";
    if (id.startsWith("wf")) return "workflow";
    if (id.startsWith("tun")) return "tunnel";
    if (id.startsWith("svc")) return "service";
    return "unknown";
  }

  inferAutomationKindFromMeta(meta) {
    if (typeof meta.automationKind === "string") return meta.automationKind;
    if (typeof meta.kind === "string") {
      const k = meta.kind.toLowerCase();
      if (k.includes("workflow")) return "workflow";
      if (k.includes("job")) return "job";
      if (k.includes("tunnel")) return "tunnel";
      if (k.includes("service")) return "service";
      if (k.includes("policy")) return "policy";
      if (k.includes("anchor")) return "anchor";
      if (k.includes("envelope")) return "envelope";
    }
    return null;
  }

  toInstance(id, label, meta, automationKind) {
    const voKind = meta.voKind || meta.kind || "automation-instance";
    const domain = meta.domain || this.defaultDomain;
    const runtime = meta.runtime || "node";
    const stack = meta.stack || ["github", "cli"];
    const crate = meta.crate || null;
    const repo = meta.repo || null;
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];
    const tunnelProfile = meta.tunnelProfile || null;

    return {
      kind: "instance",
      id,
      label,
      voKind,
      automationKind: automationKind || "job",
      domain,
      runtime,
      stack,
      crate,
      repo,
      policyTags,
      tunnelProfile,
      meta
    };
  }

  toDefinition(id, label, meta, automationKind) {
    const defKind = meta.defKind || meta.kind || "automation-definition";
    const version = meta.version || "1.0.0";
    const schema = meta.validationSchema || meta.schema || null;
    const trigger = meta.trigger || "manual";
    const stack = meta.stack || ["github"];
    const repo = meta.repo || null;
    const tunnelAllowed = meta.tunnelAllowed ?? false;
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];

    return {
      kind: "definition",
      id,
      label,
      defKind,
      automationKind: automationKind || "workflow",
      version,
      schema,
      trigger,
      stack,
      repo,
      tunnelAllowed,
      policyTags,
      meta
    };
  }

  toPolicy(id, label, meta) {
    const policyKind = meta.policyKind || "AutomationSafetyProfile";
    const profileName = meta.profileName || label || id;
    const budgets = meta.budgets || {
      maxJobs: 64,
      maxDepth: 8,
      maxFanOutPerJob: 8,
      maxConcurrentTunnels: 2
    };
    const trust = meta.trust || {
      minConfidenceForAutoUse: 0.85,
      maxDriftForAutoUse: 0.2
    };
    const tunnel = meta.tunnel || {
      allowChatAttached: true,
      requireAuditAnchor: true
    };

    return {
      kind: "policy",
      id,
      label,
      policyKind,
      profileName,
      budgets,
      trust,
      tunnel,
      meta
    };
  }

  toEnvelope(id, label, meta) {
    const runId = meta.runId || id;
    const mode = meta.mode || "automation-run";
    const intent = meta.intent || "unspecified";
    const safetyProfile = meta.safetyProfile || null;
    const metrics = meta.metrics || {};
    const contentHash = meta.contentHash || null;
    const repo = meta.repo || null;
    const branch = meta.branch || null;

    return {
      kind: "envelope",
      id,
      label,
      runId,
      mode,
      intent,
      safetyProfile,
      metrics,
      contentHash,
      repo,
      branch,
      meta
    };
  }

  toAnchor(id, label, meta) {
    const manifestId = meta.manifestId || id;
    const contentHash = meta.contentHash || null;
    const did = meta.did || null;
    const homeChain = meta.homeChain || "bostrom";
    const commitments = Array.isArray(meta.commitments) ? meta.commitments.slice() : [];
    const ledgers = meta.ledgers || ["bostrom", "evm", "did"];

    return {
      kind: "anchor",
      id,
      label,
      manifestId,
      contentHash,
      did,
      homeChain,
      commitments,
      ledgers,
      meta
    };
  }

  toWorkflow(id, label, meta) {
    const pipeline = Array.isArray(meta.pipeline) ? meta.pipeline.slice() : [];
    const entryJobs = Array.isArray(meta.entryJobs) ? meta.entryJobs.slice() : [];
    const stack = meta.stack || ["github", "cli"];
    const repo = meta.repo || null;

    return {
      kind: "workflow",
      id,
      label,
      pipeline,
      entryJobs,
      stack,
      repo,
      meta
    };
  }

  toTunnel(id, label, meta) {
    const provider = meta.provider || "perplexity";
    const mode = meta.mode || "dev-assist";
    const attachedWorkflows = Array.isArray(meta.attachedWorkflows)
      ? meta.attachedWorkflows.slice()
      : [];
    const requiresPolicy = meta.requiresPolicy ?? true;

    return {
      kind: "tunnel",
      id,
      label,
      provider,
      mode,
      attachedWorkflows,
      requiresPolicy,
      meta
    };
  }

  toService(id, label, meta) {
    const language = meta.language || "rust";
    const crate = meta.crate || null;
    const endpoint = meta.endpoint || null;
    const scaling = meta.scaling || { min: 1, max: 8 };

    return {
      kind: "service",
      id,
      label,
      language,
      crate,
      endpoint,
      scaling,
      meta
    };
  }

  classifyEdges(edges, nodeIndex, errors) {
    const typed = [];
    for (const edge of edges) {
      if (!edge.from || !edge.to) {
        errors.push({ kind: "edge-missing-endpoints", edge });
        continue;
      }
      const fromNode = nodeIndex.get(edge.from);
      const toNode = nodeIndex.get(edge.to);
      if (!fromNode || !toNode) {
        errors.push({ kind: "edge-orphan", edge });
        continue;
      }
      const relation = this.inferRelation(edge, fromNode.id, toNode.id);
      const meta = typeof edge.meta === "object" && edge.meta !== null ? edge.meta : {};
      const typedEdge = { from: edge.from, to: edge.to, relation, meta };
      if (!this.isAllowedRelation(relation, fromNode.id, toNode.id)) {
        errors.push({
          kind: "edge-invalid-relation",
          edge,
          typedEdge,
          message: `Relation '${relation}' not allowed between '${fromNode.id}' and '${toNode.id}'`
        });
      } else {
        typed.push(typedEdge);
      }
    }
    return typed;
  }

  inferRelation(edge, fromId, toId) {
    const label = typeof edge.label === "string" ? edge.label.toLowerCase() : "";
    if (label.includes("governs") || label.includes("governed")) return "governedBy";
    if (label.includes("anchors") || label.includes("anchored")) return "anchoredOn";
    if (label.includes("triggers")) return "triggers";
    if (label.includes("runs") || label.includes("executes")) return "runs";
    if (label.includes("tunnel") || label.includes("chat")) return "viaTunnel";
    if (fromId.startsWith("inst") && toId.startsWith("def")) return "instanceOf";
    if (fromId.startsWith("def") && toId.startsWith("pol")) return "governedBy";
    if (fromId.startsWith("env") && toId.startsWith("anc")) return "anchoredOn";
    return "flowsTo";
  }

  isAllowedRelation(relation, fromId, toId) {
    if (relation === "instanceOf") {
      return fromId.startsWith("inst") && toId.startsWith("def");
    }
    if (relation === "governedBy") {
      return (fromId.startsWith("def") || fromId.startsWith("inst")) && toId.startsWith("pol");
    }
    if (relation === "anchoredOn") {
      return fromId.startsWith("env") && toId.startsWith("anc");
    }
    if (relation === "viaTunnel") {
      return fromId.startsWith("wf") && toId.startsWith("tun");
    }
    return true;
  }

  analyzeSafetyCoverage(instances, workflows, policies, tunnels, edges) {
    const violations = [];

    const highRiskInstances = instances.filter(inst => {
      return Array.isArray(inst.policyTags) && inst.policyTags.includes("requires-governance");
    });

    const governedTargets = new Set(
      edges.filter(e => e.relation === "governedBy").map(e => e.from)
    );

    for (const inst of highRiskInstances) {
      if (!governedTargets.has(inst.id)) {
        violations.push({
          kind: "unguarded-high-risk-instance",
          id: inst.id,
          message: `High-risk instance '${inst.id}' lacks governedBy edge to a policy node`
        });
      }
    }

    const tunnelEdges = edges.filter(e => e.relation === "viaTunnel");
    const workflowsWithTunnel = new Set(tunnelEdges.map(e => e.from));

    for (const wf of workflows) {
      if (workflowsWithTunnel.has(wf.id)) {
        const wfHasPolicy = edges.some(
          e => e.relation === "governedBy" && e.from === wf.id
        );
        if (!wfHasPolicy) {
          violations.push({
            kind: "tunnel-workflow-without-policy",
            id: wf.id,
            message: `Workflow '${wf.id}' uses a dev-tunnel but has no governing policy`
          });
        }
      }
    }

    const tunnelCount = tunnels.length;
    const maxConcurrent = Math.max(
      1,
      ...policies.map(p => p.tunnel?.maxConcurrentTunnels || 2)
    );
    if (tunnelCount > maxConcurrent) {
      violations.push({
        kind: "tunnel-budget-exceeded",
        count: tunnelCount,
        maxAllowed: maxConcurrent,
        message: `Concurrent tunnel count ${tunnelCount} exceeds allowed ${maxConcurrent}`
      });
    }

    return {
      ok: violations.length === 0,
      violations,
      message: violations.length === 0
        ? "Automation safety coverage OK"
        : "Automation safety coverage violations detected"
    };
  }
}

export default AutomationVirtualObjectKernel;
