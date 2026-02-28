// AutomationInstanceProver: ties Mermaid AST, virtual-object model, and
// multi-language automation targets into a single, provable spec.

export class AutomationInstanceProver {
  constructor(options = {}) {
    this.defaultDomain = options.defaultDomain || "generic";
    this.requireSafety = options.requireSafety ?? true;
    this.allowedLanguages = new Set(options.allowedLanguages || [
      "javascript",
      "rust",
      "lua",
      "mermaid"
    ]);
  }

  /**
   * Prove that a Mermaid-style graph plus target languages form
   * a safe, automation-ready instance binding that cannot drift
   * away from primary workflows.
   *
   * @param {Object} params
   *   - graph: { nodes, edges, subgraphs? }
   *   - targets: { languages: string[], crates?: Object, packages?: Object }
   *   - context: { repo, pipeline, alnIntent?, mode? }
   * @returns {Object} provableSpec
   */
  prove(params) {
    const { graph, targets, context } = params || {};
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error("AutomationInstanceProver.prove: invalid or missing graph.");
    }
    if (!targets || !Array.isArray(targets.languages) || targets.languages.length === 0) {
      throw new Error("AutomationInstanceProver.prove: at least one language target is required.");
    }

    const langSet = new Set();
    for (const lang of targets.languages) {
      const key = String(lang || "").toLowerCase();
      if (!this.allowedLanguages.has(key)) {
        throw new Error(`AutomationInstanceProver.prove: language '${lang}' is not in allowedLanguages.`);
      }
      langSet.add(key);
    }

    const classification = this.classifyGraph(graph);
    const { instances, definitions, policies, envelopes, anchors, edges, errors } = classification;

    const safetyCoverage = this.analyzeSafetyCoverage(instances, policies, edges);
    if (this.requireSafety && !safetyCoverage.ok) {
      errors.push({
        kind: "safety-coverage-failed",
        message: safetyCoverage.message,
        violations: safetyCoverage.violations
      });
    }

    const binding = this.buildLanguageBinding({
      instances,
      definitions,
      policies,
      envelopes,
      anchors,
      edges,
      targets: { languages: Array.from(langSet), crates: targets.crates || {}, packages: targets.packages || {} },
      context: context || {}
    });

    const ok = errors.length === 0 && safetyCoverage.ok;
    const proofSummary = {
      domain: this.defaultDomain,
      repo: context?.repo || null,
      pipeline: context?.pipeline || null,
      alnIntent: context?.alnIntent || null,
      ok,
      errorCount: errors.length,
      safetyCoverage,
      languages: Array.from(langSet),
      mode: context?.mode || "unknown"
    };

    return {
      summary: proofSummary,
      classification,
      binding,
      errors
    };
  }

  // ---------------- Graph classification ----------------

  classifyGraph(graph) {
    const instances = [];
    const definitions = [];
    const policies = [];
    const envelopes = [];
    const anchors = [];
    const errors = [];
    const nodeIndex = new Map();

    for (const node of graph.nodes) {
      if (!node || !node.id) {
        errors.push({ kind: "node-missing-id", node });
        continue;
      }
      nodeIndex.set(node.id, node);
      const classified = this.classifyNode(node);
      switch (classified.kind) {
        case "instance":
          instances.push(classified);
          break;
        case "definition":
          definitions.push(classified);
          break;
        case "policy":
          policies.push(classified);
          break;
        case "envelope":
          envelopes.push(classified);
          break;
        case "anchor":
          anchors.push(classified);
          break;
        case "ignore":
          break;
        default:
          errors.push({ kind: "node-unknown-kind", node, info: classified });
          break;
      }
    }

    const typedEdges = this.classifyEdges(graph.edges, nodeIndex, errors);

    return {
      instances,
      definitions,
      policies,
      envelopes,
      anchors,
      edges: typedEdges,
      errors
    };
  }

  classifyNode(node) {
    const id = String(node.id);
    const label = typeof node.label === "string" ? node.label : null;
    const meta = typeof node.meta === "object" && node.meta !== null ? node.meta : {};
    const typeHint = meta.type || this.inferTypeFromId(id);

    if (typeHint === "ignore") {
      return { kind: "ignore", id, label, meta };
    }
    if (typeHint === "instance") {
      return this.toInstance(id, label, meta);
    }
    if (typeHint === "definition") {
      return this.toDefinition(id, label, meta);
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
    return { kind: "unknown", id, label, meta };
  }

  inferTypeFromId(id) {
    if (id.startsWith("inst")) return "instance";
    if (id.startsWith("def")) return "definition";
    if (id.startsWith("pol")) return "policy";
    if (id.startsWith("env")) return "envelope";
    if (id.startsWith("anc")) return "anchor";
    return "unknown";
  }

  toInstance(id, label, meta) {
    const voKind = meta.voKind || meta.kind || "VirtualObject";
    const lifecycle = meta.lifecycle || "runtime";
    const domain = meta.domain || this.defaultDomain;
    const attributes = meta.attributes || meta.fields || {};
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];
    const origin = meta.origin || null;

    return {
      kind: "instance",
      id,
      label,
      voKind,
      lifecycle,
      domain,
      attributes,
      policyTags,
      origin
    };
  }

  toDefinition(id, label, meta) {
    const defKind = meta.defKind || meta.kind || "VirtualObjectDefinition";
    const version = meta.version || "1.0.0";
    const schema = meta.validationSchema || meta.schema || null;
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];
    const registry = meta.registry || null;

    return {
      kind: "definition",
      id,
      label,
      defKind,
      version,
      schema,
      policyTags,
      registry
    };
  }

  toPolicy(id, label, meta) {
    const policyKind = meta.policyKind || "ExcavationSafetyProfile";
    const profileName = meta.profileName || label || id;
    const budgets = meta.budgets || {
      nodeBudget: 20000,
      traceSpanBudget: 50000,
      deepPassBudget: 2000,
      maxRunSeconds: 15
    };
    const trust = meta.trust || {
      minConfidenceForAutoUse: 0.85,
      minConfidenceForDisplay: 0.4,
      maxDriftForAutoUse: 0.2,
      maxDriftForCitizenUI: 0.6
    };
    const redaction = meta.redaction || {
      redactPatterns: []
    };
    const context = meta.context || {
      role: "citizen",
      deviceClass: "edge-unknown",
      networkTrust: "unknown",
      consentLevel: "minimal",
      locationHint: null
    };

    return {
      kind: "policy",
      id,
      label,
      policyKind,
      profileName,
      budgets,
      trust,
      redaction,
      context
    };
  }

  toEnvelope(id, label, meta) {
    const runId = meta.runId || id;
    const mode = meta.mode || "unknown";
    const intent = meta.intent || "unspecified";
    const safetyProfile = meta.safetyProfile || null;
    const metrics = meta.metrics || {};
    const outputsSummary = meta.outputsSummary || {};
    const contentHash = meta.contentHash || null;

    return {
      kind: "envelope",
      id,
      label,
      runId,
      mode,
      intent,
      safetyProfile,
      metrics,
      outputsSummary,
      contentHash
    };
  }

  toAnchor(id, label, meta) {
    const manifestId = meta.manifestId || id;
    const contentHash = meta.contentHash || null;
    const did = meta.did || null;
    const homeChain = meta.homeChain || "bostrom";
    const commitments = Array.isArray(meta.commitments) ? meta.commitments.slice() : [];

    return {
      kind: "anchor",
      id,
      label,
      manifestId,
      contentHash,
      did,
      homeChain,
      commitments
    };
  }

  // ---------------- Edge classification ----------------

  classifyEdges(edges, nodeIndex, errors) {
    const typed = [];
    for (const edge of edges) {
      if (!edge || !edge.from || !edge.to) {
        errors.push({ kind: "edge-missing-endpoints", edge });
        continue;
      }
      const fromNode = nodeIndex.get(edge.from);
      const toNode = nodeIndex.get(edge.to);
      if (!fromNode || !toNode) {
        errors.push({ kind: "edge-orphan", edge });
        continue;
      }
      const relation = this.inferRelation(fromNode.id, toNode.id, edge.label);
      const meta = typeof edge.meta === "object" && edge.meta !== null ? edge.meta : {};
      const typedEdge = {
        from: edge.from,
        to: edge.to,
        relation,
        meta
      };
      if (!this.isAllowedRelation(relation, fromNode.id, toNode.id)) {
        errors.push({
          kind: "edge-invalid-relation",
          edge,
          typedEdge,
          message: `Relation '${relation}' not allowed between '${fromNode.id}' and '${toNode.id}'.`
        });
      }
      typed.push(typedEdge);
    }
    return typed;
  }

  inferRelation(fromId, toId, label) {
    const l = typeof label === "string" ? label.toLowerCase() : "";
    if (l.includes("validates")) return "validates";
    if (l.includes("governs")) return "governed-by";
    if (l.includes("anchors") || l.includes("anchored")) return "anchored-on";
    if (fromId.startsWith("inst") && toId.startsWith("def")) return "instance-of";
    if (fromId.startsWith("def") && toId.startsWith("pol")) return "governed-by";
    if (fromId.startsWith("env") && toId.startsWith("anc")) return "anchored-on";
    return "flows-to";
  }

  isAllowedRelation(relation, fromId, toId) {
    if (relation === "instance-of") {
      return fromId.startsWith("inst") && toId.startsWith("def");
    }
    if (relation === "governed-by") {
      return (fromId.startsWith("def") || fromId.startsWith("inst")) && toId.startsWith("pol");
    }
    if (relation === "anchored-on") {
      return fromId.startsWith("env") && toId.startsWith("anc");
    }
    return true;
  }

  // ---------------- Safety coverage analysis ----------------

  analyzeSafetyCoverage(instances, policies, edges) {
    const violations = [];

    const highRiskInstances = instances.filter(
      (inst) =>
        Array.isArray(inst.policyTags) &&
        inst.policyTags.includes("requires-governance")
    );

    const governedTargets = new Set(
      edges
        .filter((e) => e.relation === "governed-by")
        .map((e) => e.from)
    );

    for (const inst of highRiskInstances) {
      if (!governedTargets.has(inst.id)) {
        violations.push({
          kind: "unguarded-high-risk-instance",
          id: inst.id,
          message: `High-risk instance '${inst.id}' lacks a 'governed-by' edge to a policy node.`
        });
      }
    }

    const hasPolicy = policies.length > 0;
    if (!hasPolicy && highRiskInstances.length > 0) {
      violations.push({
        kind: "no-policies-defined",
        message: "High-risk instances present but no policy nodes defined."
      });
    }

    return {
      ok: violations.length === 0,
      violations,
      message:
        violations.length === 0
          ? "Safety coverage OK."
          : "Safety coverage violations detected."
    };
  }

  // ---------------- Language binding synthesis ----------------

  buildLanguageBinding(params) {
    const {
      instances,
      definitions,
      policies,
      envelopes,
      anchors,
      edges,
      targets,
      context
    } = params;

    const languageBindings = {};

    // JavaScript automation binding
    if (targets.languages.includes("javascript")) {
      languageBindings.javascript = {
        packageName: targets.packages?.javascript || "javaspectre-automation",
        entryFile: "src/automation/entry.js",
        workflows: this.deriveWorkflowsFromGraph(instances, definitions, policies, envelopes, anchors, edges, "javascript"),
        repo: context.repo || null
      };
    }

    // Rust crate binding (invariant core)
    if (targets.languages.includes("rust")) {
      languageBindings.rust = {
        crateName: targets.crates?.rust || "jspectre-core",
        modules: this.deriveRustModules(definitions, policies),
        repo: context.repo || null
      };
    }

    // Lua module binding (lightweight scripting)
    if (targets.languages.includes("lua")) {
      languageBindings.lua = {
        moduleName: targets.packages?.lua || "javaspectre_automation",
        entryScript: "lua/automation/init.lua",
        hooks: this.deriveLuaHooks(instances, policies),
        repo: context.repo || null
      };
    }

    // Mermaid binding (canonical diagram)
    if (targets.languages.includes("mermaid")) {
      languageBindings.mermaid = {
        canonicalFlowId: context.pipeline || "automation-flow",
        nodeCount: instances.length + definitions.length + policies.length + envelopes.length + anchors.length,
        edgeCount: edges.length
      };
    }

    return {
      targets,
      bindings: languageBindings,
      context
    };
  }

  deriveWorkflowsFromGraph(instances, definitions, policies, envelopes, anchors, edges, lang) {
    const workflows = [];

    if (instances.length > 0 && policies.length > 0) {
      workflows.push({
        id: "safety-gated-automation",
        description: "Execute automation only when high-risk instances are governed by policies and sealed in a TransparencyEnvelope.",
        triggers: ["github_push", "manual", "aln_plan"],
        steps: [
          "validate_mermaid_ast",
          "run_safety_profile",
          "emit_transparency_envelope",
          "anchor_envelope",
          "run_language_specific_automation"
        ],
        language: lang
      });
    }

    if (anchors.length > 0 && envelopes.some((e) => e.contentHash)) {
      workflows.push({
        id: "anchored-audit",
        description: "Audit automation runs against anchored TransparencyEnvelopes.",
        triggers: ["scheduled", "on_demand"],
        steps: [
          "fetch_envelopes",
          "verify_content_hashes",
          "verify_anchor_commitments"
        ],
        language: lang
      });
    }

    return workflows;
  }

  deriveRustModules(definitions, policies) {
    const defKinds = Array.from(new Set(definitions.map((d) => d.defKind)));
    const hasSafety = policies.length > 0;

    const modules = defKinds.map((kind) => ({
      name: `${kind.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_registry`,
      role: "definition_registry"
    }));

    if (hasSafety) {
      modules.push({
        name: "safety_profile_core",
        role: "enforce_excavation_safety"
      });
    }

    return modules;
  }

  deriveLuaHooks(instances, policies) {
    const hooks = [];
    if (instances.length > 0) {
      hooks.push({
        name: "on_virtual_object_discovered",
        params: ["vo"],
        description: "Called when a new virtual-object instance is surfaced for Lua-side automation."
      });
    }
    if (policies.length > 0) {
      hooks.push({
        name: "before_automation_run",
        params: ["safety_profile"],
        description: "Called before executing a Lua automation, with the active safety profile."
      });
    }
    return hooks;
  }
}

export default AutomationInstanceProver;
