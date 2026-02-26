// Splits a text buffer into lines and excavates binary-like segments per line.

import { BinaryVirtualObjectExcavator } from './BinaryVirtualObjectExcavator.js';

export class BinaryLineReader {
  constructor(options = {}) {
    this.excavator = options.excavator instanceof BinaryVirtualObjectExcavator
      ? options.excavator
      : new BinaryVirtualObjectExcavator(options.excavator || {});
    this.minScore = typeof options.minScore === 'number' ? options.minScore : 0.6;
  }

  /**
   * @param {string} text - whole file, chat log, or multi-line blob
   * @param {object} [context] - { sourceKind, sourceId }
   * @returns {{virtualObjects: Array, relationships: Array}}
   */
  read(text, context = {}) {
    const virtualObjects = [];
    const relationships = [];
    if (typeof text !== 'string' || !text) {
      return { virtualObjects, relationships };
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      // Heuristic: pick the longest token-ish chunk as candidate.
      const candidate = this._pickCandidateChunk(trimmed);
      if (!candidate) {
        return;
      }

      const result = this.excavator.excavate(candidate, {
        sourceKind: context.sourceKind || 'text-lines',
        sourceId: context.sourceId || null,
        lineNumber: index + 1
      });

      // Filter by classifier confidence.
      const rootVO = result.virtualObjects.find(v => v.id === result.rootId);
      if (!rootVO || rootVO.fields.score < this.minScore) {
        return;
      }

      virtualObjects.push(...result.virtualObjects);
      relationships.push(...result.relationships);
    });

    return { virtualObjects, relationships };
  }

  _pickCandidateChunk(line) {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return null;
    }
    tokens.sort((a, b) => b.length - a.length);
    return tokens[0];
  }
}

export default BinaryLineReader;
