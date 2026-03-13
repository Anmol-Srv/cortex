/**
 * Create a source from raw content passed directly (e.g., via API or MCP).
 */
function rawSource({ content, title, sourcePath, sourceType = 'raw', contentType = 'text/plain', metadata = {} }) {
  return {
    content,
    title: title || 'Untitled',
    sourcePath: sourcePath || `raw/${Date.now()}`,
    sourceType,
    contentType,
    metadata,
  };
}

export { rawSource };
