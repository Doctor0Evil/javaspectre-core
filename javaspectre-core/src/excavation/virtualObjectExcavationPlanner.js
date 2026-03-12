// javaspectre-core/src/excavation/virtualObjectExcavationPlanner.js
// Given a list of virtual-objects (from DOM, fibers, traces), compute
// prioritised “excavation routes” using simple stability/novelty-like heuristics.

export function planExcavationRoutes(virtualObjects, options = {}) {
  if (!Array.isArray(virtualObjects)) {
    throw new Error("planExcavationRoutes requires an array of virtualObjects.");
  }

  const maxRoutes = typeof options.maxRoutes === "number" ? options.maxRoutes : 32;

  const scored = virtualObjects.map((vo) => {
    const kind = vo.kind || "unknown";
    const id = vo.id || null;
    const sizeScore = typeof vo.textLength === "number"
      ? clamp(vo.textLength / 2000, 0, 1)
      : 0.3;

    const stabilityHint = typeof vo.stability === "number" ? vo.stability : 0.5;
    const noveltyHint = typeof vo.novelty === "number" ? vo.novelty : 0.5;

    const priority =
      0.4 * (1 - stabilityHint) + // prefer less-stable / drifting items
      0.4 * noveltyHint +         // prefer novel objects
      0.2 * sizeScore;            // slightly prefer richer text

    const route = buildRouteFromVirtualObject(vo);

    return {
      kind,
      id,
      priority,
      route
    };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, maxRoutes);
}

function buildRouteFromVirtualObject(vo) {
  const base = {
    kind: vo.kind || "unknown",
    id: vo.id || null,
    role: vo.role || null,
    selectorHint: vo.selectorHint || null
  };

  if (vo.path && Array.isArray(vo.path)) {
    return {
      mode: "react-fiber",
      ...base,
      hops: vo.path.length,
      hopsDetail: vo.path
    };
  }

  if (vo.selectorHint) {
    return {
      mode: "dom",
      ...base
    };
  }

  return {
    mode: "generic",
    ...base
  };
}

function clamp(x, lo, hi) {
  if (Number.isNaN(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

export default planExcavationRoutes;
