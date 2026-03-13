import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { glob } from 'node:fs/promises';

async function readSource(filePath) {
  const resolved = resolve(filePath);
  const content = await readFile(resolved, 'utf8');
  const name = basename(resolved);
  const ext = extname(resolved).toLowerCase();

  return {
    content,
    title: name,
    sourcePath: resolved,
    sourceType: 'file',
    contentType: extensionToContentType(ext),
    metadata: { filePath: resolved, fileName: name, extension: ext },
  };
}

async function readSources(pattern) {
  const files = [];

  for await (const entry of glob(pattern)) {
    const info = await stat(entry);
    if (info.isFile()) {
      files.push(await readSource(entry));
    }
  }

  return files;
}

function extensionToContentType(ext) {
  const map = {
    '.md': 'text/markdown',
    '.mdx': 'text/markdown',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/javascript',
    '.py': 'text/x-python',
  };
  return map[ext] || 'text/plain';
}

export { readSource, readSources };
