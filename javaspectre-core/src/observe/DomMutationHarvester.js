export class DomMutationHarvester {
  constructor(target = document.body, options = {}) {
    this.target = target;
    this.options = {
      attributes: true,
      childList: true,
      subtree: true,
      ...options
    };
    this.observer = null;
  }

  start(onRecord) {
    if (this.observer) return;

    this.observer = new MutationObserver(mutationList => {
      const records = mutationList.map(m => this._toVirtualObject(m));
      onRecord(records);
    });

    this.observer.observe(this.target, this.options);
  }

  stop() {
    if (!this.observer) return;
    this.observer.disconnect();
    this.observer = null;
  }

  _toVirtualObject(mutation) {
    const base = {
      type: mutation.type,
      timestamp: Date.now()
    };

    if (mutation.type === 'childList') {
      return {
        ...base,
        target: this._summarizeNode(mutation.target),
        added: Array.from(mutation.addedNodes).map(n => this._summarizeNode(n)),
        removed: Array.from(mutation.removedNodes).map(n => this._summarizeNode(n))
      };
    }

    if (mutation.type === 'attributes') {
      return {
        ...base,
        target: this._summarizeNode(mutation.target),
        attributeName: mutation.attributeName,
        oldValue: mutation.oldValue,
        newValue: mutation.target.getAttribute(mutation.attributeName)
      };
    }

    return base;
  }

  _summarizeNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      return { kind: 'text', text: text.slice(0, 80), length: text.length };
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return { kind: 'other', nodeType: node.nodeType };
    }
    const el = /** @type {Element} */ (node);
    const id = el.id || null;
    const cls = el.className || null;
    return {
      kind: 'element',
      tag: el.tagName.toLowerCase(),
      id,
      class: cls
    };
  }
}
