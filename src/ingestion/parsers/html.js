/**
 * Strip HTML tags and extract text content.
 */
function parseHtml(content) {
  const title = extractHtmlTitle(content);

  // Remove script and style blocks
  let cleaned = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Replace block elements with newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)>/gi, '\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Decode common entities
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  const sections = [{ heading: 'Content', text: cleaned }];

  return { text: cleaned, sections, metadata: { title } };
}

function extractHtmlTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

export { parseHtml };
