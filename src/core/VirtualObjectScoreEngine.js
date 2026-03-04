// Assigns stability, novelty, and drift scores to virtual-objects.
// Enables high-confidence object selection for ALN anchoring.

export class VirtualObjectScoreEngine {
  constructor(options) {
    this.historyWindow = options?.historyWindow ?? 20;
    this.objectHistory = new Map();
    this.globalBaseline = {
      stability: 0.5,
      novelty: 0.5,
      drift: 0.0
    };
  }

  /**
   * Score all objects in a snapshot.
   * @param {Object} snapshot - Session snapshot with excavation data
   * @returns {Array} Scored objects with stability, novelty, drift
   */
  scoreSnapshot(snapshot) {
    const scoredObjects = [];
    const virtualObjects = snapshot.excavationResult?.virtualObjects ?? [];

    for (const obj of virtualObjects) {
      const score = this._scoreObject(obj, snapshot);
      scoredObjects.push({
        id: obj.id,
        category: obj.type,
        path: obj.path,
        stability: score.stability,
        novelty: score.novelty,
        drift: score.drift,
        reuseHint: score.reuseHint,
        confidence: score.confidence
      });
    }

    return scoredObjects;
  }

  /**
   * Score an individual virtual object.
   * @param {Object} obj - Virtual object from excavation
   * @param {Object} snapshot - Parent snapshot
   * @returns {Object} Score metrics
   */
  _scoreObject(obj, snapshot) {
    const historicalScores = this.objectHistory.get(obj.id) ?? [];
    
    // Stability: consistency across appearances
    const stability = this._calculateStability(obj, historicalScores);
    
    // Novelty: how unique/rare this object pattern is
    const novelty = this._calculateNovelty(obj, historicalScores);
    
    // Drift: change from historical baseline
    const drift = this._calculateDrift(obj, historicalScores);
    
    // Reuse hint: likelihood this object is valuable for future runs
    const reuseHint = this._calculateReuseHint(obj, stability, novelty, drift);
    
    // Overall confidence score
    const confidence = (stability * 0.5) + ((1 - drift) * 0.3) + (reuseHint * 0.2);

    // Update history (maintain window size)
    historicalScores.push({ stability, novelty, drift, timestamp: Date.now() });
    if (historicalScores.length > this.historyWindow) {
      historicalScores.shift();
    }
    this.objectHistory.set(obj.id, historicalScores);

    return { stability, novelty, drift, reuseHint, confidence };
  }

  _calculateStability(obj, historicalScores) {
    if (historicalScores.length === 0) {
      // First appearance: base stability on structural properties
      const depthFactor = 1 - (obj.depth / 10); // Shallower = more stable
      const childFactor = Math.min(1, (obj.children?.length ?? 0) / 10);
      return Math.max(0.3, Math.min(1.0, (depthFactor + childFactor) / 2));
    }

    // Calculate variance from historical scores
    const avgStability = historicalScores.reduce(
      (acc, s) => acc + s.stability, 0
    ) / historicalScores.length;
    
    const variance = historicalScores.reduce(
      (acc, s) => acc + Math.pow(s.stability - avgStability, 2), 0
    ) / historicalScores.length;
    
    // Low variance = high stability
    return Math.max(0.0, Math.min(1.0, 1 - Math.sqrt(variance)));
  }

  _calculateNovelty(obj, historicalScores) {
    if (historicalScores.length === 0) {
      // First appearance: moderate novelty by default
      return 0.5;
    }

    // Check if object structure has changed significantly
    const lastScore = historicalScores[historicalScores.length - 1];
    const timeSinceLastAppearance = Date.now() - lastScore.timestamp;
    
    // Longer absence = higher novelty on reappearance
    const timeNovelty = Math.min(1.0, timeSinceLastAppearance / (1000 * 60 * 60)); // 1 hour max
    
    return Math.max(0.0, Math.min(1.0, timeNovelty));
  }

  _calculateDrift(obj, historicalScores) {
    if (historicalScores.length < 2) {
      return 0.0;
    }

    const recentScores = historicalScores.slice(-5);
    const avgStability = recentScores.reduce(
      (acc, s) => acc + s.stability, 0
    ) / recentScores.length;
    
    const baselineStability = historicalScores[0].stability;
    
    // Drift = change from original baseline
    return Math.abs(avgStability - baselineStability);
  }

  _calculateReuseHint(obj, stability, novelty, drift) {
    // High stability + low drift = high reuse value
    const baseReuse = stability * (1 - drift);
    
    // Adjust for object type (some types are inherently more reusable)
    const typeMultiplier = {
      'object': 1.0,
      'array': 0.9,
      'string': 0.7,
      'number': 0.8,
      'dom-node': 0.6,
      'null': 0.3
    }[obj.type] ?? 0.5;
    
    return Math.max(0.0, Math.min(1.0, baseReuse * typeMultiplier));
  }

  /**
   * Get object history for auditing.
   * @param {string} objectId - Target object ID
   * @returns {Array} Historical scores
   */
  getObjectHistory(objectId) {
    return this.objectHistory.get(objectId) ?? [];
  }

  /**
   * Clear history for a specific object (for testing only).
   * @param {string} objectId - Target object ID
   */
  clearObjectHistory(objectId) {
    this.objectHistory.delete(objectId);
  }
}

export default VirtualObjectScoreEngine;
