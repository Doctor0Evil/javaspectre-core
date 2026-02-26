// Classifies and normalizes binary-like strings (hex, base64, url-safe, etc.).

export class BinaryStringClassifier {
  constructor(options = {}) {
    this.minLength = typeof options.minLength === 'number' ? options.minLength : 8;
    this.maxLength = typeof options.maxLength === 'number' ? options.maxLength : 4096;
  }

  classify(raw) {
    if (typeof raw !== 'string') {
      return { kind: 'non-string', score: 0, normalized: null, meta: { reason: 'not-a-string' } };
    }

    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < this.minLength || trimmed.length > this.maxLength) {
      return {
        kind: 'non-binary-candidate',
        score: 0,
        normalized: null,
        meta: { reason: 'length-out-of-range', length: trimmed.length }
      };
    }

    const meta = {
      length: trimmed.length,
      hasHexPrefix: trimmed.startsWith('0x') || trimmed.startsWith('0X'),
      hasWhitespace: /\s/.test(trimmed),
      hasNonAscii: /[^\x20-\x7e]/.test(trimmed),
    };

    const candidates = [
      this._scoreHex(trimmed),
      this._scoreBase64(trimmed),
      this._scoreBase64Url(trimmed),
      this._scoreBase32(trimmed)
    ].filter(Boolean);

    if (candidates.length === 0) {
      return {
        kind: 'unknown-binary-string',
        score: 0.2,
        normalized: null,
        meta: { ...meta, reason: 'no-decoder-accepted' }
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      kind: best.kind,
      score: best.score,
      normalized: best.normalized,
      meta: { ...meta, decoder: best.kind }
    };
  }

  _scoreHex(str) {
    const s = str.startsWith('0x') || str.startsWith('0X') ? str.slice(2) : str;
    if (s.length < 2 || s.length % 2 !== 0) {
      return null;
    }
    if (!/^[0-9a-fA-F]+$/.test(s)) {
      return null;
    }
    return {
      kind: 'hex',
      score: 0.95,
      normalized: s.toLowerCase()
    };
  }

  _scoreBase64(str) {
    // Very simple heuristic: valid alphabet + optional padding.
    if (!/^[A-Za-z0-9+/=]+$/.test(str)) {
      return null;
    }
    if (str.length % 4 !== 0) {
      return null;
    }
    return { kind: 'base64', score: 0.8, normalized: str };
  }

  _scoreBase64Url(str) {
    if (!/^[A-Za-z0-9_\-=]+$/.test(str)) {
      return null;
    }
    return { kind: 'base64url', score: 0.75, normalized: str };
  }

  _scoreBase32(str) {
    // RFC 4648 base32 alphabet (uppercase, optionally lowercase here).
    if (!/^[A-Z2-7=]+$/i.test(str)) {
      return null;
    }
    return { kind: 'base32', score: 0.6, normalized: str.toUpperCase() };
  }
}

export default BinaryStringClassifier;
