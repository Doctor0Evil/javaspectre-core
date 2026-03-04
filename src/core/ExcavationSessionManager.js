// Manages excavation sessions, snapshots, and session lifecycle.
// Ensures no rollbacks, no downgrades, monotone evolution only.

import crypto from 'node:crypto';

export class ExcavationSessionManager {
  constructor(options) {
    this.maxDepth = options?.maxDepth ?? 6;
    this.maxSnapshots = options?.maxSnapshots ?? 5;
    this.sessions = new Map();
    this.sessionHistory = [];
  }

  /**
   * Start a new excavation session.
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - { mode, intent, userDid, userRole, device, consentScope }
   * @returns {Object} Session object
   */
  startSession(sessionId, context) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists. No rollbacks permitted.`);
    }

    const session = {
      id: sessionId,
      createdAt: Date.now(),
      context: {
        mode: context.mode ?? 'unknown',
        intent: context.intent ?? null,
        userDid: context.userDid ?? null,
        userRole: context.userRole ?? 'citizen',
        device: context.device ?? 'unknown',
        consentScope: context.consentScope ?? 'unspecified'
      },
      snapshots: [],
      status: 'active',
      metrics: {
        totalNodesProcessed: 0,
        totalVirtualObjects: 0,
        totalRelationships: 0,
        deepPassExecuted: false
      }
    };

    this.sessions.set(sessionId, session);
    this.sessionHistory.push({
      sessionId,
      action: 'created',
      timestamp: Date.now(),
      context
    });

    return session;
  }

  /**
   * Add a snapshot to an existing session.
   * @param {string} sessionId - Target session ID
   * @param {Object} excavationResult - Result from VirtualObjectExcavator
   * @param {string} snapshotType - 'shallow' | 'deep'
   * @returns {Object} Snapshot object
   */
  addSnapshot(sessionId, excavationResult, snapshotType) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (session.snapshots.length >= this.maxSnapshots) {
      throw new Error(`Max snapshots (${this.maxSnapshots}) reached for session ${sessionId}.`);
    }

    // Enforce monotone evolution: deep must come after shallow
    if (snapshotType === 'shallow' && session.snapshots.some(s => s.type === 'deep')) {
      throw new Error('Cannot add shallow snapshot after deep snapshot. No downgrades permitted.');
    }

    const snapshot = {
      id: this._generateSnapshotId(sessionId, snapshotType),
      type: snapshotType,
      createdAt: Date.now(),
      excavationResult: {
        virtualObjectCount: excavationResult.virtualObjects?.length ?? 0,
        domSheetCount: excavationResult.domSheets?.length ?? 0,
        traceSpanCount: excavationResult.traceSpans?.length ?? 0
      },
      metrics: {
        domSheets: excavationResult.domSheets?.length ?? 0,
        virtualObjects: excavationResult.virtualObjects?.length ?? 0,
        relationships: this._countRelationships(excavationResult.virtualObjects)
      },
      contentHash: this._hashExcavationResult(excavationResult)
    };

    session.snapshots.push(snapshot);

    if (snapshotType === 'deep') {
      session.metrics.deepPassExecuted = true;
    }

    session.metrics.totalNodesProcessed += excavationResult.domSheets?.reduce(
      (acc, sheet) => acc + (sheet.totalNodes ?? 0), 0
    ) ?? 0;
    session.metrics.totalVirtualObjects += excavationResult.virtualObjects?.length ?? 0;
    session.metrics.totalRelationships += snapshot.metrics.relationships;

    this.sessionHistory.push({
      sessionId,
      action: 'snapshot_added',
      snapshotType,
      timestamp: Date.now(),
      snapshotId: snapshot.id
    });

    return snapshot;
  }

  /**
   * Get session summary for research output.
   * @param {string} sessionId - Target session ID
   * @returns {Object} Session summary
   */
  getSessionSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const latestSnapshot = session.snapshots[session.snapshots.length - 1] ?? null;

    return {
      sessionId: session.id,
      createdAt: session.createdAt,
      status: session.status,
      context: session.context,
      snapshotCount: session.snapshots.length,
      latestSnapshotType: latestSnapshot?.type ?? null,
      metrics: session.metrics,
      sovereigntyFlags: {
        noRollbacks: true,
        noDowngrades: true,
        monotoneEvolution: true
      }
    };
  }

  /**
   * Close a session (final, irreversible).
   * @param {string} sessionId - Target session ID
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    session.status = 'closed';
    session.closedAt = Date.now();

    this.sessionHistory.push({
      sessionId,
      action: 'closed',
      timestamp: Date.now()
    });
  }

  _generateSnapshotId(sessionId, snapshotType) {
    const hash = crypto.createHash('sha256');
    hash.update(`${sessionId}:${snapshotType}:${Date.now()}`);
    return hash.digest('hex').slice(0, 12);
  }

  _countRelationships(virtualObjects) {
    if (!Array.isArray(virtualObjects)) return 0;
    return virtualObjects.reduce(
      (acc, obj) => acc + (obj.children?.length ?? 0), 0
    );
  }

  _hashExcavationResult(result) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      voCount: result.virtualObjects?.length ?? 0,
      sheetCount: result.domSheets?.length ?? 0,
      spanCount: result.traceSpans?.length ?? 0
    }));
    return hash.digest('hex');
  }
}

export default ExcavationSessionManager;
