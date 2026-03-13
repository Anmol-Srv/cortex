/**
 * Parse JSON into readable text for ingestion.
 * Converts structured data into human-readable sections.
 */
function parseJsonContent(content) {
  let data;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return { text: content, sections: [{ heading: 'Content', text: content }], metadata: {} };
  }

  const text = stringify(data);
  const sections = [{ heading: 'Content', text }];

  return { text, sections, metadata: {} };
}

function stringify(value, indent = 0) {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        return `Item ${i + 1}:\n${stringify(item, indent + 1)}`;
      }
      return `- ${item}`;
    }).join('\n');
  }

  if (typeof value === 'object') {
    const prefix = '  '.repeat(indent);
    return Object.entries(value)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        if (typeof v === 'object') {
          return `${prefix}${k}:\n${stringify(v, indent + 1)}`;
        }
        return `${prefix}${k}: ${v}`;
      })
      .join('\n');
  }

  return String(value);
}

export { parseJsonContent };
