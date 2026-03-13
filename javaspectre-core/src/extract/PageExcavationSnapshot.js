import { excavateDomSnapshot } from './DomSnapshotExcavator.js';
import { excavateCssRules } from './CssRulesExcavator.js';
import { extractTopicRows } from './TopicTableExtractor.js';

export function buildPageExcavationSnapshot(doc = document) {
  const url = doc.location ? doc.location.href : null;
  const title = doc.title || null;

  const domTree = excavateDomSnapshot(doc.body, {
    maxDepth: 5,
    maxChildren: 40,
    includeText: false
  });

  const css = excavateCssRules({ onlyInline: false });

  const topics = extractTopicRows(doc, {
    rowSelector: 'tr.topic-list-item.category-dapps'
  });

  return {
    meta: {
      url,
      title,
      capturedAt: new Date().toISOString()
    },
    dom: domTree,
    css,
    topics
  };
}
