// High-entropy hash fingerprint scanner for text blobs (logs, JSON, SQL dumps).
// Detects likely BLAKE3/Argon2 and other 256-bit hashes by shape and entropy.

import crypto from "crypto";

export class HashFingerprintScanner {
  constructor(options = {}) {
    this.minEntropyBitsPerChar = options.minEntropyBitsPerChar ?? 3.5;
    this.minLength = options.minLength ?? 32;
    this.maxLength = options.maxLength ?? 256;
  }

  scanText(label, text) {
    if (typeof text !== "string" || !text.length) {
      throw new Error("scanText requires a non-empty string");
    }

    const tokens = this.tokenize(text);
    const findings = [];

    for (const token of tokens) {
      if (token.length < this.minLength || token.length > this.maxLength) {
        continue;
      }

      const classes = this.classifyShape(token);
      if (!classes.isCandidate) continue;

      const entropy = this.estimateEntropyBitsPerChar(token);
      if (entropy < this.minEntropyBitsPerChar) continue;

      const guess = this.guessHashFamily(token, classes);

      findings.push({
        label,
        token,
        length: token.length,
        encoding: classes.encoding,
        entropyBitsPerChar: entropy,
        familyGuess: guess.family,
        suspicion: guess.suspicion,
        notes: guess.notes
      });
    }

    return findings;
  }

  tokenize(text) {
    // Split on non-word-ish delimiters but keep hex/base64 runs.
    return text
      .split(/[^A-Za-z0-9+/=]+/g)
      .map(t => t.trim())
      .filter(Boolean);
  }

  classifyShape(token) {
    const isHex = /^[0-9a-f]+$/i.test(token);
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(token);

    if (!isHex && !isBase64) {
      return { isCandidate: false, encoding: "none" };
    }

    return {
      isCandidate: true,
      encoding: isHex ? "hex" : "base64"
    };
  }

  estimateEntropyBitsPerChar(token) {
    const freq = Object.create(null);
    for (const ch of token) {
      freq[ch] = (freq[ch] || 0) + 1;
    }
    const len = token.length;
    let entropy = 0;
    Object.values(freq).forEach(count => {
      const p = count / len;
      entropy += -p * Math.log2(p);
    });
    return entropy; // bits per char
  }

  guessHashFamily(token, classes) {
    const len = token.length;
    const encoding = classes.encoding;

    // Heuristics for common shapes:
    // - 64 hex chars: 256-bit hash (SHA-256, BLAKE2, BLAKE3, etc.)
    // - 128 hex chars: 512-bit hash
    // - 44 base64 chars ending with '=': 32-byte binary encoded
    // Argon2 encodings usually start with "$argon2" and are not pure hex/base64,
    // but sometimes systems store only the raw digest or base64-encoded data.

    // If we had full string, we could look for "$argon2" prefix directly:
    if (/^\$argon2(id|i|d)\$/.test(token)) {
      return {
        family: "argon2-encoded",
        suspicion: "high",
        notes: "Looks like a full Argon2 encoded hash string"
      };
    }

    if (encoding === "hex") {
      if (len === 64) {
        return {
          family: "256-bit-hex",
          suspicion: "medium",
          notes: "Likely 256-bit hash (could be BLAKE3, SHA-256, BLAKE2s, etc.)"
        };
      }
      if (len === 128) {
        return {
          family: "512-bit-hex",
          suspicion: "medium",
          notes: "Likely 512-bit hash (could be BLAKE2b-512, SHA-512, etc.)"
        };
      }
      if (len >= 40 && len <= 96) {
        return {
          family: "generic-hex-hash",
          suspicion: "low",
          notes: "Hex token with high entropy; generic hash candidate"
        };
      }
    }

    if (encoding === "base64") {
      if (len === 44 && token.endsWith("=")) {
        return {
          family: "256-bit-base64",
          suspicion: "medium",
          notes: "Likely 32-byte hash encoded in base64 (possible BLAKE3/Argon2 digest)"
        };
      }
      if (len >= 32 && len <= 88) {
        return {
          family: "generic-base64-hash",
          suspicion: "low",
          notes: "Base64 token with high entropy; generic hash candidate"
        };
      }
    }

    return {
      family: "unknown",
      suspicion: "low",
      notes: "High-entropy token but shape does not strongly match common hash sizes"
    };
  }
}

// Example CLI usage:
// node hashFingerprintScanner.js path/to/logfile.log
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("fs");
  const path = process.argv[2];
  if (!path) {
    // eslint-disable-next-line no-console
    console.error("Usage: node hashFingerprintScanner.js <file>");
    process.exit(1);
  }
  const data = fs.readFileSync(path, "utf8");
  const scanner = new HashFingerprintScanner();
  const findings = scanner.scanText(path, data);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ file: path, findings }, null, 2));
}
