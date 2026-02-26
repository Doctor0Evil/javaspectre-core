// Parses varint-length-prefixed frames from hex strings into virtual-objects.

export class VarintFrameExcavator {
  constructor(options = {}) {
    this.minFrames = typeof options.minFrames === 'number' ? options.minFrames : 1;
    this.maxFrames = typeof options.maxFrames === 'number' ? options.maxFrames : 128;
    this.maxVarintBytes = typeof options.maxVarintBytes === 'number' ? options.maxVarintBytes : 5;
  }

  /**
   * Parse hex into varint-length-prefixed frames.
   * Varint format: 7 bits per byte, MSB=1 for continuation, MSB=0 for last.
   * @param {string} parentId
   * @param {string} hex - normalized lowercase hex, even length.
   */
  excavate(parentId, hex) {
    const virtualObjects = [];
    const relationships = [];

    if (!hex || hex.length < 2) {
      return { virtualObjects, relationships };
    }

    const bytes = Buffer.from(hex, 'hex');
    const frames = [];
    let offset = 0;
    let index = 0;

    while (offset < bytes.length && frames.length < this.maxFrames) {
      const varint = this._readVarint(bytes, offset);
      if (!varint.ok) {
        break;
      }
      const length = varint.value;
      const headerBytes = varint.bytesRead;
      const payloadStart = offset + headerBytes;
      const payloadEnd = payloadStart + length;

      if (payloadEnd > bytes.length) {
        break;
      }

      const payload = bytes.slice(payloadStart, payloadEnd);

      frames.push({
        index,
        offsetBytes: offset,
        headerBytes,
        lengthBytes: length,
        payloadHex: payload.toString('hex')
      });

      offset = payloadEnd;
      index += 1;
    }

    if (frames.length < this.minFrames) {
      return { virtualObjects, relationships };
    }

    const containerId = `${parentId}:varint`;
    const containerVO = {
      id: containerId,
      category: 'binary-varint-sequence',
      path: null,
      type: 'varint-sequence',
      fields: {
        frameCount: frames.length,
        totalBytes: bytes.length,
        parsedBytes: offset,
        remainderBytes: bytes.length - offset
      },
      signature: `varseq:${frames.length}:${hex.slice(0, 8)}`
    };
    virtualObjects.push(containerVO);

    frames.forEach((frame) => {
      const frameId = `${containerId}#${frame.index}`;
      const vo = {
        id: frameId,
        category: 'binary-varint-frame',
        path: null,
        type: 'varint-frame',
        fields: {
          index: frame.index,
          offsetBytes: frame.offsetBytes,
          headerBytes: frame.headerBytes,
          lengthBytes: frame.lengthBytes,
          payloadHex: frame.payloadHex.slice(0, 64),
          hasMoreThan32Bytes: frame.lengthBytes > 32
        },
        signature: `vframe:${frame.lengthBytes}`
      };
      virtualObjects.push(vo);
      relationships.push({
        from: containerId,
        to: frameId,
        kind: 'contains',
        name: 'varint-frame'
      });
    });

    relationships.push({
      from: parentId,
      to: containerId,
      kind: 'parsed-as',
      name: 'varint-sequence'
    });

    return { virtualObjects, relationships };
  }

  _readVarint(bytes, offset) {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < bytes.length && bytesRead < this.maxVarintBytes) {
      const b = bytes[offset + bytesRead];
      const valueBits = b & 0x7f;
      const more = (b & 0x80) !== 0;

      result |= valueBits << shift;
      bytesRead += 1;
      shift += 7;

      if (!more) {
        return { ok: true, value: result, bytesRead };
      }
    }

    return { ok: false, value: 0, bytesRead: 0 };
  }
}

export default VarintFrameExcavator;
