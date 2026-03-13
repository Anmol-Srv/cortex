async function fetchSource(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const contentType = response.headers.get('content-type') || 'text/plain';
  const title = extractTitleFromUrl(url);

  return {
    content,
    title,
    sourcePath: url,
    sourceType: 'url',
    contentType,
    metadata: { url, fetchedAt: new Date().toISOString() },
  };
}

function extractTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    const lastSegment = path.split('/').pop() || parsed.hostname;
    return decodeURIComponent(lastSegment);
  } catch {
    return url;
  }
}

export { fetchSource };
