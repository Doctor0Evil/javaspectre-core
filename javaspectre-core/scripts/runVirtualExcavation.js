import extractDomVirtualObjects from "../src/excavation/domVirtualObjectExtractor.js";
import mapReactFiberRoutes from "../src/excavation/reactFiberRouteMapper.js";
import planExcavationRoutes from "../src/excavation/virtualObjectExcavationPlanner.js";

export function runVirtualExcavation(domRoot, reactFiberRoot) {
  const domVOs = extractDomVirtualObjects(domRoot);              // DOM-based virtual-objects
  const fiberRoutes = mapReactFiberRoutes(reactFiberRoot);       // React routes
  const routeVOs = fiberRoutes.map((r) => ({ kind: "route-message", ...r }));

  const combined = [...domVOs, ...routeVOs];
  const routes = planExcavationRoutes(combined, { maxRoutes: 24 });

  return routes;
}
