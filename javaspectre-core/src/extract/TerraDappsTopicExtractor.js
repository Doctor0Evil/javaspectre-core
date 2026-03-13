export class TerraDappsTopicExtractor {
  static parseHtml(html) {
    if (typeof html !== 'string' || !html.length) {
      throw new Error('TerraDappsTopicExtractor.parseHtml requires a non-empty HTML string.');
    }

    let doc = null;

    if (typeof window !== 'undefined' && typeof window.DOMParser === 'function') {
      const parser = new window.DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } else {
      throw new Error('DOMParser is not available in this environment.');
    }

    return doc;
  }

  static extractTopicsFromDocument(doc) {
    const topics = [];
    const rows = doc.querySelectorAll('tr.topic-list-item.category-dapps');

    rows.forEach(row => {
      const idAttr = row.getAttribute('data-topic-id');
      const id = idAttr ? Number(idAttr) : null;

      const titleLink = row.querySelector('a.title.raw-link.raw-topic-link');
      const title = titleLink ? titleLink.textContent.trim() : null;
      const url = titleLink ? titleLink.getAttribute('href') : null;

      const repliesLink = row.querySelector('.num.posts-map a.badge-posts');
      let replies = null;
      if (repliesLink) {
        const numSpan = repliesLink.querySelector('.number');
        if (numSpan) {
          const parsed = Number(numSpan.textContent.trim());
          replies = Number.isNaN(parsed) ? null : parsed;
        }
      }

      const activitySpan = row.querySelector('.num.activity .relative-date');
      const lastActivityLabel = activitySpan ? activitySpan.textContent.trim() : null;
      const lastActivityTimeAttr = activitySpan ? activitySpan.getAttribute('data-time') : null;
      const lastActivityTime = lastActivityTimeAttr ? Number(lastActivityTimeAttr) : null;

      topics.push({
        id,
        title,
        url,
        replies,
        lastActivity: lastActivityLabel,
        lastActivityTime
      });
    });

    return topics;
  }

  static extractTopics(html) {
    const doc = TerraDappsTopicExtractor.parseHtml(html);
    return TerraDappsTopicExtractor.extractTopicsFromDocument(doc);
  }
}

export default TerraDappsTopicExtractor;
