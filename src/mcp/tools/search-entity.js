import { z } from 'zod';

import { searchByName, listByType } from '../../memory/entities/store.js';

function registerSearchEntityTool(server) {
  server.tool(
    'search_entity',
    `Find entities in the knowledge graph by name or type.
Use for: "find Alice", "list all topics", "show all people", "find documents about normalization".
Entity types: document, person, topic (extensible per domain).
Returns entities with mention counts — use traverse_graph or get_entity_context for deeper details.`,
    {
      query: z.string().optional().describe('Entity name to search (e.g. "Alice", "Cohort 6", "normalization")'),
      entityType: z.string().optional().describe('Filter by type: session, course, person, topic'),
      limit: z.number().optional().default(10).describe('Max results'),
      namespace: z.string().optional().describe('Namespace. Omit for default.'),
    },
    async ({ query, entityType, limit, namespace }) => {
      if (!query && !entityType) {
        return errorResponse('Provide either a query (entity name) or entityType.');
      }

      const results = query
        ? await searchByName(query, { entityType, namespace, limit })
        : await listByType(entityType, { namespace, limit });

      if (!results.length) {
        const filter = query ? `matching "${query}"` : `of type "${entityType}"`;
        return textResponse(`No entities found ${filter}.`);
      }

      const lines = results.map((e) =>
        `- **${e.name}** (${e.entityType}, id:${e.id}) — ${e.mentionCount} mentions${e.description ? ` — ${e.description}` : ''}`,
      );

      const header = query ? `Entities matching "${query}"` : `${entityType} entities`;
      const footer = '\nUse `get_entity_context(entityId=<id>)` for details or `traverse_graph(startEntityId=<id>)` to explore connections.';

      return textResponse(`## ${header} (${results.length})\n\n${lines.join('\n')}${footer}`);
    },
  );
}

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

function errorResponse(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }] };
}

export { registerSearchEntityTool };
