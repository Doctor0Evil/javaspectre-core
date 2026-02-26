// Turns binary-like strings into virtual-objects with fingerprints and light structure.

import crypto from 'node:crypto';
import { BinaryStringClassifier } from './BinaryStringClassifier.js';

let nextId = 0;
function genId(prefix) {
  nextId += 1;
  return `${prefix}${nextId.toString(36)}`;
}

export class BinaryVirtualObjectExcavator {
  constructor(options = {}) {
    this.classifier = options.classifier instanceof BinaryStringClassifier
      ? options.classifier
      : new BinaryStringClassifier(options.classifier || {});
    this.maxPreviewBytes = typeof options.maxPreviewBytes === 'number'
      ? options.maxPreviewBytes
      : 32;
  }

  /**
   * Entry: takes a raw string, returns virtualObjects + relationships.
   * @param {string} raw
   * @param {object} [context] - optional hints: { sourceKind, sourceId, lineNumber }
   */
  excavate(raw, context = {}) {
    const virtualObjects = [];
    const relationships = [];

    const rootId = genId('bin-');
    const classified = this.classifier.classify(raw);

    const baseVO = this._buildBaseVirtualObject(rootId, raw, classified, context);
    virtualObjects.push(baseVO);

    if (classified.kind === 'hex' && classified.normalized) {
      const hexVOs = this._deriveHexViews(rootId, classified.normalized);
      for (const vo of hexVOs.virtualObjects) {
        virtualObjects.push(vo);
      }
      for (const rel of hexVOs.relationships) {
        relationships.push(rel);
      }
    }

    // Additional decoders (TLV, varint frames, etc.) can be plugged here.

    return {
      rootId,
      virtualObjects,
      relationships
    };
  }

  _buildBaseVirtualObject(id, raw, classified, context) {
    const hashSha256 = this._hash('sha256', raw);
    const hashSha1 = this._hash('sha1', raw);

    const preview = this._preview(raw);

    const fields = {
      rawLength: raw.length,
      kind: classified.kind,
      score: classified.score,
      normalizedLength: classified.normalized ? classified.normalized.length : null,
      hasHexPrefix: classified.meta?.hasHexPrefix || false,
      hasWhitespace: classified.meta?.hasWhitespace || false,
      hasNonAscii: classified.meta?.hasNonAscii || false,
      hashSha256,
      hashSha1,
      preview,
      sourceKind: context.sourceKind || null,
      sourceId: context.sourceId || null,
      lineNumber: typeof context.lineNumber === 'number' ? context.lineNumber : null
    };

    const signature = `${classified.kind}:${hashSha256.slice(0, 16)}`;

    return {
      id,
      category: 'binary-blob',
      path: context.path || null,
      type: 'binary',
      fields,
      signature
    };
  }

  _deriveHexViews(parentId, hex) {
    const virtualObjects = [];
    const relationships = [];

    const byteLength = hex.length / 2;
    const voId = genId('hexmeta-');

    const fields = {
      byteLength,
      isEvenLength: hex.length % 2 === 0,
      startsWith00: hex.startsWith('00'),
      startsWithFF: hex.startsWith('ff'),
      // Simple rough entropy estimate: frequency of each nibble.
      nibbleHistogram: this._nibbleHistogram(hex)
    };

    const signature = `hexmeta:${byteLength}:${this._hash('sha1', hex).slice(0, 12)}`;

    virtualObjects.push({
      id: voId,
      category: 'binary-hex-meta',
      path: null,
      type: 'hex-meta',
      fields,
      signature
    });

    relationships.push({
      from: parentId,
      to: voId,
      kind: 'derived-meta',
      name: 'hex-meta'
    });

    // Sample: first few bytes as integer window for pattern research.
    const sampleId = genId('hexsample-');
    const sampleBytes = this._sampleBytes(hex, 8);
    const sampleFields = {
      sampleBytes,
      sampleIntBigEndian: this._bytesToInt(sampleBytes, 'be'),
      sampleIntLittleEndian: this._bytesToInt(sampleBytes, 'le')
    };

    virtualObjects.push({
      id: sampleId,
      category: 'binary-hex-sample',
      path: null,
      type: 'hex-sample',
      fields: sampleFields,
      signature: `hexsample:${this._hash('sha1', sampleBytes).slice(0, 12)}`
    });

    relationships.push({
      from: voId,
      to: sampleId,
      kind: 'derived-sample',
      name: 'first-bytes'
    });

    return { virtualObjects, relationships };
  }

  _hash(alg, input) {
    return crypto.createHash(alg).update(input, 'utf8').digest('hex');
  }

  _preview(str) {
    if (str.length <= this.maxPreviewBytes * 2) {
      return str;
    }
    const head = str.slice(0, this.maxPreviewBytes);
    const tail = str.slice(-this.maxPreviewBytes);
    return `${head}…${tail}`;
  }

  _nibbleHistogram(hex) {
    const hist = {};
    for (let i = 0; i < 16; i += 1) {
      hist[i.toString(16)] = 0;
    }
    for (const ch of hex.toLowerCase()) {
      if (hist[ch] !== undefined) {
        hist[ch] += 1;
      }
    }
    return hist;
  }

  _sampleBytes(hex, maxBytes) {
    const bytes = [];
    const max = Math.min(maxBytes, hex.length / 2);
    for (let i = 0; i < max; i += 1) {
      const byteHex = hex.slice(i * 2, i * 2 + 2);
      bytes.push(byteHex);
    }
    return bytes.join('');
  }

  _bytesToInt(hexBytes, endian) {
    if (!hexBytes || hexBytes.length % 2 !== 0) {
      return null;
    }
    const buf = Buffer.from(hexBytes, 'hex');
    if (buf.length === 0 || buf.length > 6) {
      // Avoid overflow in JS safe integer range.
      return null;
    }
    let value = 0;
    if (endian === 'le') {
      for (let i = buf.length - 1; i >= 0; i -= 1) {
        value = (value << 8) + buf[i];
      }
    } else {
      for (let i = 0; i < buf.length; i += 1) {
        value = (value << 8) + buf[i];
      }
    }
    return value;
  }
}

export default BinaryVirtualObjectExcavator;
