/**
 * Parse markdown into sections split by headings.
 */
function parseMarkdown(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentHeading = null;
  let currentLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      if (currentLines.length) {
        sections.push({
          heading: currentHeading || 'Introduction',
          text: currentLines.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length) {
    sections.push({
      heading: currentHeading || 'Content',
      text: currentLines.join('\n').trim(),
    });
  }

  const fullText = sections.map((s) => s.text).join('\n\n');
  const title = extractTitle(lines) || null;

  return { text: fullText, sections, metadata: { title } };
}

function extractTitle(lines) {
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/);
    if (match) return match[1].trim();
  }
  return null;
}

export { parseMarkdown };
