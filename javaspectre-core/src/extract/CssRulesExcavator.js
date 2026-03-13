export function excavateCssRules(filter = {}) {
  const {
    onlyInline = false, // true => only <style> sheets
    hrefIncludes = null // string or null
  } = filter;

  const sheets = Array.from(document.styleSheets);
  const result = [];

  for (const sheet of sheets) {
    const ownerNode = sheet.ownerNode || null;
    if (!ownerNode) continue;

    if (onlyInline && ownerNode.tagName && ownerNode.tagName.toLowerCase() !== 'style') {
      continue;
    }

    if (hrefIncludes && sheet.href && !sheet.href.includes(hrefIncludes)) {
      continue;
    }

    let rules = [];
    try {
      rules = Array.from(sheet.cssRules || sheet.rules || []);
    } catch (err) {
      // Cross-origin stylesheet; skip.
      continue;
    }

    const sheetInfo = {
      href: sheet.href || null,
      ownerTag: ownerNode.tagName ? ownerNode.tagName.toLowerCase() : null,
      ownerId: ownerNode.id || null,
      ruleCount: rules.length,
      rules: rules.map((r, index) => ({
        index,
        typeName: r.constructor && r.constructor.name,
        selectorText: r.selectorText || null,
        cssText: r.cssText
      }))
    };

    result.push(sheetInfo);
  }

  return result;
}
