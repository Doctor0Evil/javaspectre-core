export function getHashtagGeneratorSheet(doc = document) {
  for (const sheet of doc.styleSheets) {
    const node = sheet.ownerNode;
    if (node && node.id === 'hashtag-css-generator') {
      return sheet;
    }
  }
  return null;
}

export function listHashtagGeneratorRules(doc = document) {
  const sheet = getHashtagGeneratorSheet(doc);
  if (!sheet) return [];

  const out = [];
  const rules = sheet.cssRules || sheet.rules;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    out.push({
      index: i,
      type: rule.constructor.name,
      cssText: rule.cssText
    });
  }
  return out;
}

export function replaceHashtagGeneratorRule(index, newRuleText, doc = document) {
  const sheet = getHashtagGeneratorSheet(doc);
  if (!sheet) throw new Error('Hashtag CSS generator sheet not found.');
  const rules = sheet.cssRules || sheet.rules;
  if (index < 0 || index >= rules.length) {
    throw new Error(`Rule index ${index} out of bounds.`);
  }
  sheet.deleteRule(index);
  sheet.insertRule(newRuleText, index);
}
