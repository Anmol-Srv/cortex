import dayjs from 'dayjs';
import { groupBy, sortBy } from 'lodash-es';

/**
 * Generic document index renderer.
 * Each document entry: { uid, title, slug, date, type, groupLabel, groupSlug, authorName, extraColumns }
 */

function renderDocumentIndex(documents, { title = 'Cortex — Document Index', columns = [] } = {}) {
  const sorted = sortBy(documents, 'date').reverse();

  const extraHeaders = columns.map((c) => c.label).join(' | ');
  const extraSep = columns.map(() => '------').join(' | ');

  const lines = [
    `# ${title}`,
    '',
    `_Last updated: ${dayjs().format('YYYY-MM-DD HH:mm')}_`,
    '',
    `**${documents.length}** documents processed.`,
    '',
    `| Document | Group | Author | Date |${extraHeaders ? ` ${extraHeaders} |` : ''}`,
    `|----------|-------|--------|------|${extraSep ? ` ${extraSep} |` : ''}`,
  ];

  for (const d of sorted) {
    const link = `[${d.title}](./${d.slug}.md)`;
    const group = d.groupLabel || '—';
    const author = d.authorName || '—';
    const date = dayjs(d.date).format('MMM D, YYYY');
    const extras = columns.map((c) => d.extraColumns?.[c.key] ?? '—').join(' | ');
    lines.push(`| ${link} | ${group} | ${author} | ${date} |${extras ? ` ${extras} |` : ''}`);
  }

  return lines.join('\n');
}

function renderGroupIndex(groupLabel, documents, { type = 'document' } = {}) {
  const sorted = sortBy(documents, 'date');

  const lines = [
    `# ${groupLabel}`,
    '',
    `_${documents.length} documents_`,
    '',
  ];

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const date = dayjs(d.date).format('MMM D');
    lines.push(`${i + 1}. [${d.title}](../${d.slug}.md) — ${date}`);
  }

  return lines.join('\n');
}

function renderAuthorIndex(authorName, documents, { type = 'document' } = {}) {
  const sorted = sortBy(documents, 'date').reverse();

  const lines = [
    `# ${authorName}`,
    '',
    `_${documents.length} documents_`,
    '',
  ];

  for (const d of sorted) {
    const date = dayjs(d.date).format('MMM D, YYYY');
    const group = d.groupLabel ? ` — ${d.groupLabel}` : '';
    lines.push(`- [${d.title}](../${d.slug}.md)${group}, ${date}`);
  }

  return lines.join('\n');
}

export { renderDocumentIndex, renderGroupIndex, renderAuthorIndex };
