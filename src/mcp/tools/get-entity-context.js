import { z } from 'zod';

import { findById, searchByName } from '../../memory/entities/store.js';
import { listRelationsForEntity } from '../../memory/entities/relations.js';
import { getFactsForEntity } from '../../memory/facts/entity-linker.js';

function registerGetEntityContextTool(server) {
  server.tool(
    'get_entity_context',
    `Get an entity with full context: all relations, connected facts, graph metrics.
Use for: "tell me about Alice", "what does this entity do?", "show expertise areas",
"what documents has this person authored?", "what facts mention this topic?".
Returns entity + relations + key facts.`,
    {
      entityId: z.number().optional().describe('Entity ID (from search_entity results)'),
      name: z.string().optional().describe('Entity name (alternative to ID, will find best match)'),
      namespace: z.string().optional().describe('Namespace. Omit for default.'),
    },
    async ({ entityId, name, namespace }) => {
      if (!entityId && !name) {
        return textResponse('Error: Provide either entityId or name.');
      }

      let entity;
      if (entityId) {
        entity = await findById(entityId);
      } else {
        const results = await searchByName(name, { namespace, limit: 1 });
        entity = results[0];
      }

      if (!entity) {
        return textResponse('Error: Entity not found.');
      }

      const [relations, facts] = await Promise.all([
        listRelationsForEntity(entity.id, { limit: 50 }),
        getFactsForEntity(entity.id, { limit: 10 }),
      ]);

      const parts = [
        `## ${entity.name}`,
        `- **Type:** ${entity.entityType}`,
        `- **ID:** ${entity.id}`,
        `- **Mentions:** ${entity.mentionCount}`,
      ];

      if (entity.description) {
        parts.push(`- **Description:** ${entity.description}`);
      }

      const outgoing = relations.filter((r) => r.direction === 'outgoing');
      const incoming = relations.filter((r) => r.direction === 'incoming');

      if (outgoing.length) {
        parts.push(`\n### Outgoing Relations (${outgoing.length})`);
        for (const r of outgoing.slice(0, 15)) {
          parts.push(`- [${r.relationType}] **${r.name}** (${r.entityType})${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`);
        }
        if (outgoing.length > 15) parts.push(`- ... and ${outgoing.length - 15} more`);
      }

      if (incoming.length) {
        parts.push(`\n### Incoming Relations (${incoming.length})`);
        for (const r of incoming.slice(0, 15)) {
          parts.push(`- **${r.name}** (${r.entityType}) [${r.relationType}]${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`);
        }
        if (incoming.length > 15) parts.push(`- ... and ${incoming.length - 15} more`);
      }

      if (facts.length) {
        parts.push(`\n### Key Facts (${facts.length})`);
        for (const f of facts.slice(0, 10)) {
          parts.push(`- [${f.category}] ${f.content.length > 120 ? f.content.slice(0, 120) + '...' : f.content}`);
        }
      }

      if (!outgoing.length && !incoming.length && !facts.length) {
        parts.push('\nNo connections or facts found for this entity.');
      }

      parts.push(`\nUse \`traverse_graph(startEntityId=${entity.id})\` for deeper graph exploration.`);

      return textResponse(parts.join('\n'));
    },
  );
}

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

export { registerGetEntityContextTool };
