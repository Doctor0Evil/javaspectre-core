// Spot, tag, and classify Argon2 and BLAKE-like hashes in arbitrary strings.

export class HashSignatureDetector {
  constructor(options = {}) {
    this.minEntropyBitsPerChar = options.minEntropyBitsPerChar ?? 3.5;
    this.minLength = options.minLength ?? 32;
    this.maxLength = options.maxLength ?? 256;
  }

  detect(label, text) {
    if (typeof text !== "string" || !text.length) {
      return [];
    }

    const tokens = this.tokenize(text);
    const findings = [];

    for (const token of tokens) {
      const argonTag = this.classifyArgon2(token);
      if (argonTag) {
        findings.push({ label, ...argonTag });
        continue;
      }

      const hashTag = this.classifyHashLike(token);
      if (hashTag) {
        findings.push({ label, ...hashTag });
      }
    }

    return findings;
  }

  tokenize(text) {
    return text
      .split(/[^A-Za-z0-9$+/=]+/g)
      .map(t => t.trim())
      .filter(Boolean);
  }

  classifyArgon2(token) {
    if (!token.startsWith("$argon2")) return null;

    const fullMatch = token.match(
      /^\$(argon2id|argon2i|argon2d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+={0,2}$/
    );
    const variantMatch = token.match(/^\$(argon2id|argon2i|argon2d)\$/);

    if (!variantMatch) return null;

    return {
      type: "argon2_encoded",
      variant: variantMatch[1],
      token,
      suspicion: fullMatch ? "high" : "medium",
      notes: fullMatch
        ? "Matches PHC-style Argon2 encoded hash format"
        : "Looks like Argon2 encoded prefix"
    };
  }

  classifyHashLike(token) {
    if (token.length < this.minLength || token.length > this.maxLength) {
      return null;
    }

    const isHex = /^[0-9a-f]+$/i.test(token);
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(token);

    if (!isHex && !isBase64) return null;

    const entropy = this.estimateEntropyBitsPerChar(token);
    if (entropy < this.minEntropyBitsPerChar) return null;

    const len = token.length;

    if (isHex && len === 64) {
      return {
        type: "blake_candidate",
        token,
        encoding: "hex",
        entropyBitsPerChar: entropy,
        suspicion: "medium",
        notes: "256-bit hex hash (could be BLAKE3, SHA-256, etc.)"
      };
    }

    if (isBase64 && len === 44 && token.endsWith("=")) {
      return {
        type: "blake_candidate",
        token,
        encoding: "base64",
        entropyBitsPerChar: entropy,
        suspicion: "medium",
        notes: "32-byte base64 hash (could be BLAKE3 or similar)"
      };
    }

    return {
      type: "generic_hash",
      token,
      encoding: isHex ? "hex" : "base64",
      entropyBitsPerChar: entropy,
      suspicion: "low",
      notes: "High-entropy hash-like token"
    };
  }

  estimateEntropyBitsPerChar(token) {
    const freq = Object.create(null);
    for (const ch of token) {
      freq[ch] = (freq[ch] || 0) + 1;
    }
    const len = token.length;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy += -p * Math.log2(p);
    }
    return entropy;
  }
}
