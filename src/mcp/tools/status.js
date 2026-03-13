import { z } from 'zod';

import { getStats } from '../../memory/documents/store.js';
import { getEntityCount } from '../../memory/entities/store.js';
import { getRelationCount } from '../../memory/entities/relations.js';
import { getFactCount } from '../../memory/facts/store.js';

function registerStatusTool(server) {
  server.tool(
    'status',
    `Show Cortex knowledge base statistics — documents, chunks, facts, entities, relations.
Use when: checking system health, verifying ingestion, reviewing knowledge graph size.`,
    {
      namespace: z.string().optional().describe('Filter by namespace. Omit for global stats.'),
    },
    async ({ namespace }) => {
      const [docStats, factCount, documents, people, topics, relations] = await Promise.all([
        getStats(namespace),
        getFactCount(namespace),
        getEntityCount('document'),
        getEntityCount('person'),
        getEntityCount('topic'),
        getRelationCount(),
      ]);

      const text = [
        `## Cortex Knowledge Base${namespace ? ` (${namespace})` : ''}`,
        '',
        '### Documents',
        `- Documents: ${docStats.documentCount}`,
        `- Chunks: ${docStats.totalChunks}`,
        `- Facts: ${factCount} active`,
        '',
        '### Entity Graph',
        `- Document entities: ${documents}`,
        `- People: ${people}`,
        `- Topics: ${topics}`,
        `- Relations: ${relations}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    },
  );
}

export { registerStatusTool };
