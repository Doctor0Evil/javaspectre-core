// javaspectre-core/src/excavation/domVirtualObjectExtractor.js
// Extracts stable virtual-objects (chat messages, panels, steps) from a DOM root
// using className / id patterns like those seen in paste.txt.

export function extractDomVirtualObjects(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    throw new Error("extractDomVirtualObjects requires a DOM root with querySelectorAll.");
  }

  const virtualObjects = [];

  // 1) Chat messages (user + assistant)
  const chatNodes = root.querySelectorAll("div.qwen-chat-message, div.qwen-chat-message-user, div.qwen-chat-message-assistant");
  chatNodes.forEach((node, index) => {
    const id = node.id || `chat-node-${index}`;
    const role =
      node.classList.contains("qwen-chat-message-user") ? "user" :
      node.classList.contains("qwen-chat-message-assistant") ? "assistant" :
      "unknown";

    const text = node.textContent.trim();
    const containerId = node.closest("div.chat-container")?.id || null;

    virtualObjects.push({
      kind: "dom-chat-message",
      id,
      role,
      containerId,
      selectorHint: buildSelectorHint(node),
      textPreview: text.slice(0, 140),
      textLength: text.length
    });
  });

  // 2) Deep-research panel (top “Deep Research Completed”, steps list, etc.)
  const researchPanels = root.querySelectorAll("div.deep-research-panel, div.deep-research-list-container");
  researchPanels.forEach((panel, index) => {
    const id = panel.id || `deep-research-panel-${index}`;
    const header = panel.querySelector(".deep-research-text")?.textContent.trim() || null;
    const duration = panel.querySelector(".deep-research-text-time-contentspan")?.textContent.trim() || null;
    const steps = Array.from(panel.querySelectorAll(".list-card-step-item-text")).map((el) =>
      el.textContent.trim()
    );

    virtualObjects.push({
      kind: "dom-deep-research-panel",
      id,
      header,
      duration,
      steps,
      selectorHint: buildSelectorHint(panel)
    });
  });

  // 3) POS / ALN research article blocks (qwen markdown sections)
  const markdownBlocks = root.querySelectorAll("div.qwen-markdown");
  markdownBlocks.forEach((block, index) => {
    const headingEl = block.querySelector("h1, h2, h3");
    const heading = headingEl ? headingEl.textContent.trim() : null;
    const text = block.textContent.trim();
    const id = block.id || `qwen-markdown-${index}`;

    virtualObjects.push({
      kind: "dom-markdown-article",
      id,
      heading,
      textPreview: text.slice(0, 240),
      textLength: text.length,
      selectorHint: buildSelectorHint(block)
    });
  });

  return virtualObjects;
}

function buildSelectorHint(node) {
  if (!node) return null;
  const classes = Array.from(node.classList || []);
  const base = {
    tag: node.tagName || null,
    id: node.id || null,
    classes: classes,
    data: {}
  };

  if (node.dataset && typeof node.dataset === "object") {
    for (const [k, v] of Object.entries(node.dataset)) {
      base.data[k] = v;
    }
  }

  return base;
}

export default extractDomVirtualObjects;
