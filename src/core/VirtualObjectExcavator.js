// Extracts virtual-objects from DOM, JSON, and trace data streams.
// Produces structured NanoData suitable for halo_bridge indexing.

import crypto from 'node:crypto';

export class VirtualObjectExcavator {
  constructor(options) {
    this.maxDepth = options?.maxDepth ?? 6;
    this.maxArraySample = options?.maxArraySample ?? 8;
    this.includeDom = options?.includeDom ?? false;
    this.objectCounter = 0;
  }

  /**
   * Main excavation entry point.
   * @param {Object} params - { value, domRoot }
   * @returns {Object} ExcavationResult with virtualObjects, domSheets, traceSpans
   */
  excavate(params) {
    const { value, domRoot } = params;
    const virtualObjects = [];
    const domSheets = [];
    const traceSpans = [];

    // Process JSON/value stream
    if (value !== null && value !== undefined) {
      const jsonResult = this._excavateValue(value, 0, 'root');
      virtualObjects.push(...jsonResult.objects);
    }

    // Process DOM stream
    if (domRoot && this.includeDom) {
      const domResult = this._excavateDom(domRoot, 0);
      domSheets.push(...domResult.sheets);
      virtualObjects.push(...domResult.objects);
    }

    return {
      virtualObjects,
      domSheets,
      traceSpans,
      metadata: {
        excavatedAt: Date.now(),
        objectCount: virtualObjects.length,
        sheetCount: domSheets.length,
        spanCount: traceSpans.length
      }
    };
  }

  _excavateValue(value, depth, path) {
    const objects = [];

    if (depth > this.maxDepth) {
      return { objects };
    }

    const type = this._getType(value);
    const objectId = this._generateObjectId(type, path);

    if (type === 'object' && value !== null) {
      const entries = Object.entries(value);
      const children = [];

      for (const [key, val] of entries.slice(0, this.maxArraySample)) {
        const childPath = `${path}.${key}`;
        const childResult = this._excavateValue(val, depth + 1, childPath);
        children.push(...childResult.objects);
      }

      objects.push({
        id: objectId,
        type: 'object',
        path,
        depth,
        childCount: entries.length,
        sampledChildCount: children.length,
        stability: 1.0,
        novelty: 0.0,
        children: children.map(c => c.id)
      });
      objects.push(...children);
    } else if (type === 'array') {
      const children = [];
      for (let i = 0; i < Math.min(value.length, this.maxArraySample); i++) {
        const childPath = `${path}[${i}]`;
        const childResult = this._excavateValue(value[i], depth + 1, childPath);
        children.push(...childResult.objects);
      }

      objects.push({
        id: objectId,
        type: 'array',
        path,
        depth,
        length: value.length,
        sampledLength: Math.min(value.length, this.maxArraySample),
        stability: 1.0,
        novelty: 0.0,
        children: children.map(c => c.id)
      });
      objects.push(...children);
    } else {
      objects.push({
        id: objectId,
        type,
        path,
        depth,
        value: this._sanitizeValue(value),
        stability: 1.0,
        novelty: 0.0,
        children: []
      });
    }

    return { objects };
  }

  _excavateDom(node, depth, path = 'document') {
    const sheets = [];
    const objects = [];

    if (!node || depth > this.maxDepth) {
      return { sheets, objects };
    }

    const nodeId = this._generateObjectId('dom', path);
    const nodeType = node.nodeType ?? 'unknown';
    const tagName = node.tagName ?? node.nodeName ?? null;

    const attributes = {};
    if (node.attributes) {
      for (const attr of node.attributes) {
        attributes[attr.name] = attr.value;
      }
    }

    const children = [];
    if (node.childNodes) {
      for (let i = 0; i < Math.min(node.childNodes.length, this.maxArraySample); i++) {
        const child = node.childNodes[i];
        const childPath = `${path}>${tagName || 'node'}[${i}]`;
        const childResult = this._excavateDom(child, depth + 1, childPath);
        children.push(...childResult.objects);
        sheets.push(...childResult.sheets);
      }
    }

    objects.push({
      id: nodeId,
      type: 'dom-node',
      path,
      depth,
      nodeType,
      tagName,
      attributes,
      childCount: node.childNodes?.length ?? 0,
      stability: 1.0,
      novelty: 0.0,
      children: children.map(c => c.id)
    });
    objects.push(...children);

    sheets.push({
      id: this._generateObjectId('sheet', path),
      rootNodeId: nodeId,
      totalNodes: objects.length,
      maxDepth: depth,
      path
    });

    return { sheets, objects };
  }

  _getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  _generateObjectId(type, path) {
    this.objectCounter++;
    const hash = crypto.createHash('sha256');
    hash.update(`${type}:${path}:${this.objectCounter}:${Date.now()}`);
    return hash.digest('hex').slice(0, 16);
  }

  _sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 1024) {
      return value.slice(0, 1024) + '...[truncated]';
    }
    return value;
  }
}

export default VirtualObjectExcavator;
