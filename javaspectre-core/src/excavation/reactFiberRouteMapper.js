// javaspectre-core/src/excavation/reactFiberRouteMapper.js
// Walks a React fiber-like tree (as seen in paste.txt) and emits virtual-object
// “routes” from top-level containers down to leaf message components.

export function mapReactFiberRoutes(rootFiber, options = {}) {
  if (!rootFiber || typeof rootFiber !== "object") {
    throw new Error("mapReactFiberRoutes requires a root fiber object.");
  }

  const maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : 32;
  const routes = [];
  const stack = [{ fiber: rootFiber, path: [] }];

  while (stack.length > 0) {
    const { fiber, path } = stack.pop();
    if (!fiber || path.length > maxDepth) continue;

    const nextPath = [...path, fiberDescriptor(fiber)];

    if (isMessageFiber(fiber)) {
      routes.push(buildMessageRoute(fiber, nextPath));
    }

    const child = fiber.child || fiber.childFiber || null;
    const sibling = fiber.sibling || fiber.siblingFiber || null;

    if (sibling) {
      stack.push({ fiber: sibling, path: path });
    }
    if (child) {
      stack.push({ fiber: child, path: nextPath });
    }
  }

  return routes;
}

function fiberDescriptor(fiber) {
  const tag = typeof fiber.tag === "number" ? fiber.tag : null;
  const typeName =
    typeof fiber.type === "string"
      ? fiber.type
      : fiber.type && fiber.type.name
      ? fiber.type.name
      : null;

  const id =
    (fiber.stateNode && fiber.stateNode.id) ||
    (fiber.pendingProps && fiber.pendingProps.id) ||
    (fiber.memoizedProps && fiber.memoizedProps.id) ||
    null;

  const className =
    (fiber.stateNode && fiber.stateNode.className) ||
    (fiber.pendingProps && fiber.pendingProps.className) ||
    (fiber.memoizedProps && fiber.memoizedProps.className) ||
    null;

  return { tag, typeName, id, className };
}

function isMessageFiber(fiber) {
  const props = fiber.memoizedProps || fiber.pendingProps || {};
  const className = props.className || (fiber.stateNode && fiber.stateNode.className) || "";

  if (typeof className === "string") {
    if (className.includes("qwen-chat-message-user")) return true;
    if (className.includes("qwen-chat-message-assistant")) return true;
  }

  if (typeof fiber.type === "function" && fiber.type.name && fiber.type.name.toLowerCase().includes("message")) {
    return true;
  }

  return false;
}

function buildMessageRoute(fiber, path) {
  const props = fiber.memoizedProps || fiber.pendingProps || {};
  const stateNode = fiber.stateNode || null;

  const messageId =
    props.messageId ||
    (stateNode && stateNode.id) ||
    null;

  const text =
    (stateNode && typeof stateNode.textContent === "string"
      ? stateNode.textContent.trim()
      : null) || null;

  const role = inferRoleFromClass(props.className || (stateNode && stateNode.className) || "");

  return {
    kind: "react-fiber-route",
    messageId,
    role,
    depth: path.length,
    path,
    textPreview: text ? text.slice(0, 140) : null
  };
}

function inferRoleFromClass(className) {
  if (!className || typeof className !== "string") return "unknown";
  if (className.includes("qwen-chat-message-user")) return "user";
  if (className.includes("qwen-chat-message-assistant")) return "assistant";
  return "unknown";
}

export default mapReactFiberRoutes;
