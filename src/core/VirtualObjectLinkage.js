// Shared linkage payload for all virtual objects: runId, nodeId, did, contentHash.

export class LinkageFields {
  constructor({ runId = null, nodeId = null, did = null, contentHash = null } = {}) {
    this.runId = runId;
    this.nodeId = nodeId;
    this.did = did;
    this.contentHash = contentHash;
  }

  attachTo(target) {
    // Shallow copy linkage onto any virtual-object instance.
    Object.defineProperty(target, "runId", {
      value: this.runId,
      enumerable: true,
      writable: false
    });
    Object.defineProperty(target, "nodeId", {
      value: this.nodeId,
      enumerable: true,
      writable: false
    });
    Object.defineProperty(target, "did", {
      value: this.did,
      enumerable: true,
      writable: false
    });
    Object.defineProperty(target, "contentHash", {
      value: this.contentHash,
      enumerable: true,
      writable: false
    });
    return target;
  }

  toJSON() {
    return {
      runId: this.runId,
      nodeId: this.nodeId,
      did: this.did,
      contentHash: this.contentHash
    };
  }
}

/**
 * Helper to produce a partial WHERE clause and SQL params for linkage queries.
 */
export function buildLinkageWhere(linkage = {}) {
  const clauses = [];
  const params = [];

  if (linkage.runId) {
    clauses.push("run_id = ?");
    params.push(linkage.runId);
  }
  if (linkage.nodeId) {
    clauses.push("node_id = ?");
    params.push(linkage.nodeId);
  }
  if (linkage.did) {
    clauses.push("did = ?");
    params.push(linkage.did);
  }
  if (linkage.contentHash) {
    clauses.push("content_hash = ?");
    params.push(linkage.contentHash);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}
