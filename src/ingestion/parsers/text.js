/**
 * Parse plain text — split by double newlines into sections.
 */
function parseText(content) {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const sections = paragraphs.length > 1
    ? paragraphs.map((p, i) => ({
        heading: `Section ${i + 1}`,
        text: p,
      }))
    : [{ heading: 'Content', text: content.trim() }];

  return { text: content.trim(), sections, metadata: {} };
}

export { parseText };
