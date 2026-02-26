// Parses simple TLV (Type–Length–Value) sequences from hex strings into virtual-objects.

export class TlvFrameExcavator {
  constructor(options = {}) {
    this.minFrames = typeof options.minFrames === 'number' ? options.minFrames : 1;
    this.maxFrames = typeof options.maxFrames === 'number' ? options.maxFrames : 64;
    this.requireAligned = options.requireAligned !== false;
  }

  /**
   * Attempt to parse a hex string into TLV frames.
   * Format: [TT][LL][..LL..][VALUE...], where TT, LL are 1 byte each, length in bytes.
   * @param {string} parentId - id of parent binary-blob VO.
   * @param {string} hex - normalized lowercase hex, even length.
   * @returns {{virtualObjects:Array, relationships:Array}}
   */
  excavate(parentId, hex) {
    const virtualObjects = [];
    const relationships = [];

    if (!hex || hex.length < 4) {
      return { virtualObjects, relationships };
    }

    const frames = [];
    let offset = 0;
    let index = 0;

    while (offset + 4 <= hex.length && frames.length < this.maxFrames) {
      const typeHex = hex.slice(offset, offset + 2);
      const lenHex = hex.slice(offset + 2, offset + 4);
      const length = parseInt(lenHex, 16);

      if (!Number.isFinite(length) || length < 0) {
        break;
      }

      const valueStart = offset + 4;
      const valueEnd = valueStart + length * 2;
      if (valueEnd > hex.length) {
        // Truncated, stop parsing.
        break;
      }

      const valueHex = hex.slice(valueStart, valueEnd);

      frames.push({
        index,
        offsetBytes: offset / 2,
        typeHex,
        lengthBytes: length,
        valueHex
      });

      offset = valueEnd;
      index += 1;
    }

    if (frames.length < this.minFrames) {
      return { virtualObjects, relationships };
    }

    if (this.requireAligned && offset !== hex.length) {
      // Remainder not parsed; optionally treat as failure.
      return { virtualObjects, relationships };
    }

    const containerId = `${parentId}:tlv`;
    const containerVO = {
      id: containerId,
      category: 'binary-tlv-sequence',
      path: null,
      type: 'tlv-sequence',
      fields: {
        frameCount: frames.length,
        totalBytes: hex.length / 2,
        parsedBytes: offset / 2,
        remainderBytes: hex.length / 2 - offset / 2
      },
      signature: `tlvseq:${frames.length}:${hex.slice(0, 8)}`
    };
    virtualObjects.push(containerVO);

    frames.forEach((frame) => {
      const frameId = `${containerId}#${frame.index}`;
      const vo = {
        id: frameId,
        category: 'binary-tlv-frame',
        path: null,
        type: 'tlv-frame',
        fields: {
          index: frame.index,
          offsetBytes: frame.offsetBytes,
          typeHex: frame.typeHex,
          lengthBytes: frame.lengthBytes,
          valueHex: frame.valueHex.slice(0, 64),
          hasMoreThan32Bytes: frame.lengthBytes > 32
        },
        signature: `tlv:${frame.typeHex}:${frame.lengthBytes}`
      };
      virtualObjects.push(vo);
      relationships.push({
        from: containerId,
        to: frameId,
        kind: 'contains',
        name: 'tlv-frame'
      });
    });

    relationships.push({
      from: parentId,
      to: containerId,
      kind: 'parsed-as',
      name: 'tlv-sequence'
    });

    return { virtualObjects, relationships };
  }
}

export default TlvFrameExcavator;
