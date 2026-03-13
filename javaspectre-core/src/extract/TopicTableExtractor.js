export function extractTopicRows(doc = document, options = {}) {
  const {
    rowSelector = 'tr.topic-list-item',
    titleSelector = 'a.title.raw-link.raw-topic-link',
    repliesSelector = '.num.posts-map a.badge-posts .number',
    lastActivitySelector = '.num.activity .relative-date'
  } = options;

  const rows = Array.from(doc.querySelectorAll(rowSelector));
  return rows.map(row => {
    const idAttr = row.getAttribute('data-topic-id');
    const id = idAttr ? Number(idAttr) : null;

    const titleEl = row.querySelector(titleSelector);
    const title = titleEl ? titleEl.textContent.trim() : null;
    const url = titleEl ? titleEl.getAttribute('href') : null;

    const repliesEl = row.querySelector(repliesSelector);
    const replies = repliesEl ? Number(repliesEl.textContent.trim()) : null;

    const actEl = row.querySelector(lastActivitySelector);
    const lastActivityLabel = actEl ? actEl.textContent.trim() : null;
    const lastActivityTimeAttr = actEl ? actEl.getAttribute('data-time') : null;
    const lastActivityTime = lastActivityTimeAttr ? Number(lastActivityTimeAttr) : null;

    return {
      id,
      title,
      url,
      replies,
      lastActivity: lastActivityLabel,
      lastActivityTime
    };
  });
}
