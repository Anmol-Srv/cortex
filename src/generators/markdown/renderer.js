/**
 * Generic knowledge document renderer.
 * Takes a standard document structure → returns markdown string.
 *
 * Any ingestion pipeline converts its domain data into this format,
 * and this renderer produces the markdown without knowing the domain.
 */
function renderKnowledgeFile({ uid, type, title, date, frontmatter, headerLinks, sections, relatedLinks, sources }) {
  const parts = [];

  parts.push(renderFrontmatter({ uid, type, title, date, ...frontmatter }));
  parts.push(renderHeader(title, headerLinks));

  for (const section of sections) {
    if (section.body) {
      parts.push(`## ${section.heading}\n\n${section.body}`);
    }
  }

  if (relatedLinks?.length) {
    parts.push(renderRelated(relatedLinks));
  }

  if (sources?.length) {
    parts.push(renderSources(sources));
  }

  return parts.filter(Boolean).join('\n\n');
}

function renderFrontmatter(fields) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      lines.push(`${key}: "${escapeYaml(value)}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('status: processed');
  lines.push('cortex_version: 1');
  lines.push('---');
  return lines.join('\n');
}

function renderHeader(title, headerLinks) {
  const lines = [`# ${title}`, ''];

  if (headerLinks?.length) {
    for (const link of headerLinks) {
      if (link.href) {
        lines.push(`**${link.label}:** [${link.text}](${link.href})`);
      } else {
        lines.push(`**${link.label}:** ${link.text}`);
      }
    }
  }

  return lines.join('\n');
}

function renderRelated(links) {
  const lines = ['## Related', ''];
  for (const link of links) {
    if (link.href) {
      lines.push(`- **${link.label}:** [${link.text}](${link.href})`);
    } else {
      lines.push(`- **${link.label}:** ${link.text}`);
    }
  }
  return lines.join('\n');
}

function renderSources(sources) {
  const lines = ['## Sources', ''];
  for (const s of sources) {
    lines.push(`- ${s.label}: \`${s.url}\``);
  }
  return lines.join('\n');
}

function escapeYaml(text) {
  if (!text) return '';
  return text.replace(/"/g, '\\"');
}

export { renderKnowledgeFile };
