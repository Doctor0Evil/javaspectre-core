export function excavateDomSnapshot(root = document.body, options = {}) {
  const {
    maxDepth = 6,
    maxChildren = 50,
    includeText = false,
    includeAttributes = ['id', 'class', 'href', 'src', 'data-*']
  } = options;

  function shouldIncludeAttr(name) {
    if (includeAttributes.includes('*')) return true;
    if (includeAttributes.includes(name)) return true;
    if (name.startsWith('data-') && includeAttributes.includes('data-*')) return true;
    return false;
  }

  function walk(node, depth) {
    if (!node || depth > maxDepth) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!includeText || !text) return null;
      return {
        kind: 'text',
        text,
        length: text.length
      };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const el = /** @type {Element} */ (node);
    const attrs = {};
    for (const { name, value } of Array.from(el.attributes)) {
      if (!shouldIncludeAttr(name)) continue;
      attrs[name] = value;
    }

    const children = [];
    const childNodes = Array.from(el.childNodes).slice(0, maxChildren);
    for (const child of childNodes) {
      const childVo = walk(child, depth + 1);
      if (childVo) children.push(childVo);
    }

    return {
      kind: 'element',
      tag: el.tagName.toLowerCase(),
      attrs,
      children,
      metrics: {
        childCount: children.length
      }
    };
  }

  return walk(root, 0);
}
