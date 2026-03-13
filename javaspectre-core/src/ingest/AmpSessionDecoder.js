export class AmpSessionDecoder {
  static parseCookieBlob(raw) {
    if (typeof raw !== 'string' || !raw.length) {
      throw new Error('AmpSessionDecoder.parseCookieBlob requires a non-empty string.');
    }

    const [cookiePart] = raw.split('+', 1); // strip any trailing labels like "+ javascript-logging-session"
    const segments = cookiePart.split(';').map(s => s.trim()).filter(Boolean);

    const result = {
      cookies: {},
      decoded: {},
      errors: [],
      label: null
    };

    // Recover label, if any
    const plusIndex = raw.indexOf('+');
    if (plusIndex !== -1 && plusIndex < raw.length - 1) {
      result.label = raw.slice(plusIndex + 1).trim();
    }

    for (const segment of segments) {
      const eqIndex = segment.indexOf('=');
      if (eqIndex === -1) continue;
      const name = segment.slice(0, eqIndex).trim();
      const value = segment.slice(eqIndex + 1).trim();

      result.cookies[name] = value;

      try {
        const decoded = AmpSessionDecoder.decodeValue(value);
        result.decoded[name] = decoded;
      } catch (err) {
        result.errors.push({ name, error: String(err) });
      }
    }

    return result;
  }

  static decodeValue(b64url) {
    if (typeof b64url !== 'string') throw new Error('decodeValue expects a string.');
    // URL-safe base64 → standard base64
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad === 2) b64 += '==';
    else if (pad === 3) b64 += '=';
    else if (pad !== 0) throw new Error('Invalid base64 length.');

    const json = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(json);

    return {
      raw: obj,
      sessionId: obj.sessionId ?? null,
      deviceId: obj.deviceId ?? obj.deviceid ?? null,
      optOut: obj.optOut ?? obj.optout ?? false,
      lastEventTime: obj.lastEventTime ?? null,
      lastEventId: obj.lastEventId ?? null
    };
  }
}

export default AmpSessionDecoder;
