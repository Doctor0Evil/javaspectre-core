/**
 * SecureArContext
 * - Wraps window/navigator/XR in a policy-driven envelope.
 * - Enforces CitizenXRProfile and RuntimePolicyRegistry.
 * - Exposes a safe factory for ARVirtualObject instances.
 */

class RuntimePolicyRegistry {
  constructor() {
    this.domainPolicies = new Map();
    this.defaultPolicy = {
      allowTelemetry: false,
      allowCrossOriginIntrospection: false,
      allowedSdks: [],
      citizenMode: "CITIZEN_MODE_PRIVATE"
    };
  }

  setDomainPolicy(host, policy) {
    this.domainPolicies.set(host, { ...this.defaultPolicy, ...policy });
  }

  getPolicyForLocation(locationObj) {
    const host = locationObj?.host || "unknown";
    return this.domainPolicies.get(host) || this.defaultPolicy;
  }
}

class CitizenXRProfile {
  constructor({
    did,
    safetyPreferences = {},
    governanceKeys = [],
    auditTrailRefs = []
  }) {
    this.did = did;
    this.safetyPreferences = Object.assign(
      {
        allowHighFrequencySensors: false,
        allowCrossDeviceCorrelation: false,
        allowARAds: false
      },
      safetyPreferences
    );
    this.governanceKeys = governanceKeys;
    this.auditTrailRefs = auditTrailRefs;
  }

  canUseSensor(sensorType) {
    if (sensorType === "high-frequency") {
      return !!this.safetyPreferences.allowHighFrequencySensors;
    }
    return true;
  }
}

class RuntimeIntrospectionSeal {
  constructor({ policy, auditFn }) {
    this.policy = policy;
    this.auditFn = auditFn || (() => {});
  }

  guardCrossOriginAccess(target, descriptor) {
    if (!this.policy.allowCrossOriginIntrospection) {
      this.auditFn({
        type: "cross-origin-block",
        descriptor,
        timestamp: Date.now()
      });
      throw new Error("Cross-origin introspection is blocked by policy.");
    }
    return target;
  }

  guardTelemetry(sdkName, action) {
    if (!this.policy.allowTelemetry) {
      this.auditFn({
        type: "telemetry-block",
        sdkName,
        action,
        timestamp: Date.now()
      });
      return false;
    }
    return this.policy.allowedSdks.includes(sdkName);
  }
}

class ARVirtualObject {
  constructor({
    id,
    owner,
    type,
    geometry,
    policyTags = [],
    ledgerAnchor = null
  }) {
    this.id = id;
    this.owner = owner;
    this.type = type;
    this.geometry = geometry;
    this.policyTags = policyTags;
    this.ledgerAnchor = ledgerAnchor;
    this.createdAt = Date.now();
  }
}

/**
 * SecureArContext:
 *   - builds from window/navigator safely.
 *   - exposes limited methods for AR use.
 */
class SecureArContext {
  constructor({ windowRef, policyRegistry, citizenProfile, auditFn }) {
    if (!windowRef || typeof windowRef !== "object") {
      throw new Error("SecureArContext requires a valid window reference.");
    }

    this.window = windowRef;
    this.navigator = windowRef.navigator || {};
    this.location = windowRef.location || {};
    this.policyRegistry = policyRegistry || new RuntimePolicyRegistry();
    this.policy = this.policyRegistry.getPolicyForLocation(this.location);
    this.citizenProfile = citizenProfile || new CitizenXRProfile({ did: "did:aln:anonymous" });
    this.auditFn = auditFn || (() => {});
    this.seal = new RuntimeIntrospectionSeal({
      policy: this.policy,
      auditFn: this.auditFn
    });

    this._initSafeGlobals();
  }

  _initSafeGlobals() {
    // Wrap critical APIs with policy-aware stubs.
    this.safeFetch = async (...args) => {
      if (!this.seal.guardTelemetry("generic-fetch", "request")) {
        return Promise.reject(new Error("Telemetry/Network blocked by policy."));
      }
      return this.window.fetch(...args);
    };

    this.safePostMessage = (message, targetOrigin = "*") => {
      // Disallow wildcard targetOrigin by default for citizen safety.
      const allowedOrigin = targetOrigin === "*" ? this.location.origin : targetOrigin;
      this.auditFn({
        type: "postMessage",
        payloadShape: typeof message,
        targetOrigin: allowedOrigin,
        timestamp: Date.now()
      });
      this.window.postMessage(message, allowedOrigin);
    };
  }

  getCitizenMode() {
    return this.policy.citizenMode || "CITIZEN_MODE_PRIVATE";
  }

  supportsXR() {
    return typeof this.navigator.xr !== "undefined";
  }

  async requestXRSession(mode = "immersive-ar") {
    if (!this.supportsXR()) {
      throw new Error("XRSystem is not available in this context.");
    }
    if (!this.citizenProfile.canUseSensor("high-frequency")) {
      throw new Error("Citizen safety preferences do not allow XR sensors.");
    }
    this.auditFn({
      type: "xr-session-request",
      mode,
      timestamp: Date.now()
    });
    return this.navigator.xr.requestSession(mode);
  }

  createArVirtualObject(config) {
    const obj = new ARVirtualObject(config);
    this.auditFn({
      type: "ar-object-created",
      id: obj.id,
      owner: obj.owner,
      policyTags: obj.policyTags,
      timestamp: Date.now()
    });
    return obj;
  }

  // Example: safe event subscription for AR overlay interactions.
  onSafePointerMove(callback) {
    if (!this.citizenProfile.canUseSensor("high-frequency")) {
      return () => {};
    }

    const handler = (event) => {
      const safeEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
        // Redact more detailed info.
      };
      callback(safeEvent);
    };

    this.window.addEventListener("pointermove", handler, { passive: true });
    return () => this.window.removeEventListener("pointermove", handler);
  }
}

export {
  RuntimePolicyRegistry,
  CitizenXRProfile,
  RuntimeIntrospectionSeal,
  ARVirtualObject,
  SecureArContext
};
