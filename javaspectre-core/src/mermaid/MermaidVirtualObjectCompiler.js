// Compiles a Mermaid-style AST graph into typed virtual-objects,
// ready for use by Javaspectre's safety, transparency, and anchoring layers.

export class MermaidVirtualObjectCompiler {
  constructor(options = {}) {
    this.defaultDomain = options.defaultDomain || 'generic';
    this.requireSafety = options.requireSafety !== false;
  }

  /**
   * Compile a Mermaid AST-like graph into a typed model.
   * @param {Object} graph - { nodes, edges, subgraphs }
   * @returns {Object} compiled model { instances, definitions, policies, envelopes, anchors, errors }
   */
  compile(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error('MermaidVirtualObjectCompiler.compile: invalid graph input');
    }

    const instances = [];
    const definitions = [];
    const policies = [];
    const envelopes = [];
    const anchors = [];
    const errors = [];

    const nodeIndex = new Map();
    for (const node of graph.nodes) {
      if (!node.id) {
        errors.push({ kind: 'node-missing-id', node });
        continue;
      }
      nodeIndex.set(node.id, node);
      const classified = this.classifyNode(node);
      switch (classified.kind) {
        case 'instance':
          instances.push(classified);
          break;
        case 'definition':
          definitions.push(classified);
          break;
        case 'policy':
          policies.push(classified);
          break;
        case 'envelope':
          envelopes.push(classified);
          break;
        case 'anchor':
          anchors.push(classified);
          break;
        case 'ignore':
          break;
        default:
          errors.push({ kind: 'node-unknown-kind', node, info: classified });
      }
    }

    const typedEdges = this.classifyEdges(graph.edges, nodeIndex, errors);

    const safetyCoverage = this.analyzeSafetyCoverage(instances, definitions, policies, typedEdges);
    if (this.requireSafety && !safetyCoverage.ok) {
      errors.push({
        kind: 'safety-coverage-failed',
        message: safetyCoverage.message,
        violations: safetyCoverage.violations,
      });
    }

    const compiled = {
      domain: this.defaultDomain,
      instances,
      definitions,
      policies,
      envelopes,
      anchors,
      edges: typedEdges,
      subgraphs: graph.subgraphs || [],
      safetyCoverage,
      errors,
    };

    return compiled;
  }

  classifyNode(node) {
    const id = String(node.id);
    const label = typeof node.label === 'string' ? node.label : null;
    const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
    const typeHint = meta.type || this.inferTypeFromId(id);

    if (typeHint === 'ignore') {
      return { kind: 'ignore', id, label, meta };
    }

    if (typeHint === 'instance') {
      return this.toInstance(id, label, meta);
    }
    if (typeHint === 'definition') {
      return this.toDefinition(id, label, meta);
    }
    if (typeHint === 'policy') {
      return this.toPolicy(id, label, meta);
    }
    if (typeHint === 'envelope') {
      return this.toEnvelope(id, label, meta);
    }
    if (typeHint === 'anchor') {
      return this.toAnchor(id, label, meta);
    }

    return { kind: 'unknown', id, label, meta };
  }

  inferTypeFromId(id) {
    if (id.startsWith('inst_')) return 'instance';
    if (id.startsWith('def_')) return 'definition';
    if (id.startsWith('pol_')) return 'policy';
    if (id.startsWith('env_')) return 'envelope';
    if (id.startsWith('anc_')) return 'anchor';
    return 'unknown';
  }

  toInstance(id, label, meta) {
    const voKind = meta.voKind || meta.kind || 'virtualObject';
    const lifecycle = meta.lifecycle || 'runtime';
    const domain = meta.domain || this.defaultDomain;
    const attributes = meta.attributes || meta.fields || {};
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];
    const origin = meta.origin || null;

    return {
      kind: 'instance',
      id,
      label,
      voKind,
      lifecycle,
      domain,
      attributes,
      policyTags,
      origin,
    };
  }

  toDefinition(id, label, meta) {
    const defKind = meta.defKind || meta.kind || 'virtualObjectDefinition';
    const version = meta.version || '1.0.0';
    const schema = meta.validationSchema || meta.schema || null;
    const policyTags = Array.isArray(meta.policyTags) ? meta.policyTags.slice() : [];
    const registry = meta.registry || null;

    return {
      kind: 'definition',
      id,
      label,
      defKind,
      version,
      schema,
      policyTags,
      registry,
    };
  }

  toPolicy(id, label, meta) {
    const policyKind = meta.policyKind || 'ExcavationSafetyProfile';
    const profileName = meta.profileName || label || id;
    const budgets = meta.budgets || {
      nodeBudget: 20000,
      traceSpanBudget: 50000,
      deepPassBudget: 2000,
      maxRunSeconds: 15,
    };
    const trust = meta.trust || {
      minConfidenceForAutoUse: 0.85,
      minConfidenceForDisplay: 0.4,
      maxDriftForAutoUse: 0.2,
      maxDriftForCitizenUI: 0.6,
    };
    const redaction = meta.redaction || { redactPatterns: [] };
    const context = meta.context || {
      role: 'citizen',
      deviceClass: 'edge-unknown',
      networkTrust: 'unknown',
      consentLevel: 'minimal',
      locationHint: null,
    };

    return {
      kind: 'policy',
      id,
      label,
      policyKind,
      profileName,
      budgets,
      trust,
      redaction,
      context,
    };
  }

  toEnvelope(id, label, meta) {
    const runId = meta.runId || id;
    const mode = meta.mode || 'unknown';
    const intent = meta.intent || 'unspecified';
    const safetyProfile = meta.safetyProfile || null;
    const metrics = meta.metrics || {};
    const outputsSummary = meta.outputsSummary || {};
    const contentHash = meta.contentHash || null;

    return {
      kind: 'envelope',
      id,
      label,
      runId,
      mode,
      intent,
      safetyProfile,
      metrics,
      outputsSummary,
      contentHash,
    };
  }

  toAnchor(id, label, meta) {
    const manifestId = meta.manifestId || id;
    const contentHash = meta.contentHash || null;
    const did = meta.did || null;
    const homeChain = meta.homeChain || 'bostrom';
    const commitments = Array.isArray(meta.commitments) ? meta.commitments.slice() : [];

    return {
      kind: 'anchor',
      id,
      label,
      manifestId,
      contentHash,
      did,
      homeChain,
      commitments,
    };
  }

  classifyEdges(edges, nodeIndex, errors) {
    const typed = [];
    for (const edge of edges) {
      if (!edge.from || !edge.to) {
        errors.push({ kind: 'edge-missing-endpoints', edge });
        continue;
      }
      const fromNode = nodeIndex.get(edge.from);
      const toNode = nodeIndex.get(edge.to);
      if (!fromNode || !toNode) {
        errors.push({ kind: 'edge-orphan', edge });
        continue;
      }

      const relation = edge.relation || this.inferRelation(fromNode.id, toNode.id, edge.label);
      const meta = edge.meta && typeof edge.meta === 'object' ? edge.meta : {};

      const typedEdge = {
        from: edge.from,
        to: edge.to,
        relation,
        meta,
      };

      if (!this.isAllowedRelation(relation, fromNode.id, toNode.id)) {
        errors.push({
          kind: 'edge-invalid-relation',
          edge: typedEdge,
          message: `Relation ${relation} not allowed between ${fromNode.id} and ${toNode.id}`,
        });
      }

      typed.push(typedEdge);
    }
    return typed;
  }

  inferRelation(fromId, toId, label) {
    const l = typeof label === 'string' ? label.toLowerCase() : '';
    if (l.includes('validates')) return 'validates';
    if (l.includes('governs')) return 'governed_by';
    if (l.includes('anchors') || l.includes('anchored')) return 'anchored_on';

    if (fromId.startsWith('inst_') && toId.startsWith('def_')) return 'instance_of';
    if (fromId.startsWith('def_') && toId.startsWith('pol_')) return 'governed_by';
    if (fromId.startsWith('env_') && toId.startsWith('anc_')) return 'anchored_on';

    return 'flows_to';
  }

  isAllowedRelation(relation, fromId, toId) {
    if (relation === 'instance_of') {
      return fromId.startsWith('inst_') && toId.startsWith('def_');
    }
    if (relation === 'governed_by') {
      return (fromId.startsWith('def_') || fromId.startsWith('inst_')) && toId.startsWith('pol_');
    }
    if (relation === 'anchored_on') {
      return fromId.startsWith('env_') && toId.startsWith('anc_');
    }
    return true;
  }

  analyzeSafetyCoverage(instances, definitions, policies, edges) {
    const violations = [];

    const highRiskInstances = instances.filter((inst) =>
      Array.isArray(inst.policyTags) && inst.policyTags.includes('requires-governance')
    );

    const governedTargets = new Set(
      edges
        .filter((e) => e.relation === 'governed_by')
        .map((e) => e.from)
    );

    for (const inst of highRiskInstances) {
      if (!governedTargets.has(inst.id)) {
        violations.push({
          kind: 'unguarded-high-risk-instance',
          id: inst.id,
          message: `High-risk instance ${inst.id} lacks governed_by edge to a policy node`,
        });
      }
    }

    const hasPolicy = policies.length > 0;
    if (!hasPolicy && highRiskInstances.length > 0) {
      violations.push({
        kind: 'no-policies-defined',
        message: 'High-risk instances present but no policy nodes defined',
      });
    }

    return {
      ok: violations.length === 0,
      violations,
      message: violations.length === 0 ? 'Safety coverage OK' : 'Safety coverage violations detected',
    };
  }
}

export default MermaidVirtualObjectCompiler;
