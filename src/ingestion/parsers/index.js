import { parseMarkdown } from './markdown.js';
import { parseText } from './text.js';
import { parseHtml } from './html.js';
import { parseCode } from './code.js';
import { parseJsonContent } from './json-parser.js';

const EXTENSION_MAP = {
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.js': 'code',
  '.ts': 'code',
  '.jsx': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.java': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.h': 'code',
  '.cs': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.yaml': 'text',
  '.yml': 'text',
  '.toml': 'text',
  '.ini': 'text',
  '.cfg': 'text',
  '.env': 'text',
  '.csv': 'text',
  '.sql': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
};

const CONTENT_TYPE_MAP = {
  'text/markdown': 'markdown',
  'text/html': 'html',
  'text/plain': 'text',
  'application/json': 'json',
  'text/javascript': 'code',
  'application/javascript': 'code',
  'text/x-python': 'code',
};

const PARSERS = {
  markdown: parseMarkdown,
  text: parseText,
  html: parseHtml,
  code: parseCode,
  json: parseJsonContent,
};

function parse(content, { format, filePath, contentType } = {}) {
  const resolved = format
    || resolveFromContentType(contentType)
    || resolveFromPath(filePath)
    || detectFromContent(content);

  const parser = PARSERS[resolved] || parseText;
  return parser(content);
}

function resolveFromContentType(contentType) {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim();
  return CONTENT_TYPE_MAP[base] || null;
}

function resolveFromPath(filePath) {
  if (!filePath) return null;
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return ext ? EXTENSION_MAP[ext] || null : null;
}

function detectFromContent(content) {
  if (!content) return 'text';
  const trimmed = content.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return 'html';
  if (trimmed.match(/^#{1,6}\s/m)) return 'markdown';
  if (trimmed.match(/^(import|export|function|class|const|let|var|def|func|package)\s/m)) return 'code';

  return 'text';
}

export { parse, EXTENSION_MAP };
