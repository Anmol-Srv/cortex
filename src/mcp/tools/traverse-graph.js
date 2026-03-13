import { z } from 'zod';

import { findById } from '../../memory/entities/store.js';
import { getEntityNeighborhood, findPath, findRelated } from '../../memory/entities/traversal.js';

function registerTraverseGraphTool(server) {
  server.tool(
    'traverse_graph',
    `Navigate entity relationships in the knowledge graph.
Use for: "who did Alice mentor?", "what topics does course X cover?", "how is A related to B?",
"what sessions are in this course?", "show mentorship chain".
Relation types: PART_OF, LED_BY, MENTORED, COVERS, FOLLOWS.`,
    {
      startEntityId: z.number().describe('Starting entity ID (from search_entity results)'),
      action: z.enum(['neighbors', 'path', 'related']).optional().default('neighbors')
        .describe('neighbors = direct connections, path = shortest path to target, related = all reachable entities'),
      targetEntityId: z.number().optional().describe('Target entity ID (required for "path" action)'),
      relationType: z.string().optional().describe('Filter: PART_OF, LED_BY, MENTORED, COVERS, FOLLOWS'),
      maxDepth: z.number().optional().default(2).describe('Traversal depth 1-4 (higher = slower, finds distant connections)'),
      limit: z.number().optional().default(20).describe('Max results'),
    },
    async ({ startEntityId, action, targetEntityId, relationType, maxDepth, limit }) => {
      const entity = await findById(startEntityId);
      if (!entity) {
        return textResponse(`Error: Entity ID ${startEntityId} not found.`);
      }

      if (action === 'neighbors') {
        return formatNeighbors(entity, { depth: Math.min(maxDepth, 3), limit });
      }

      if (action === 'path') {
        if (!targetEntityId) {
          return textResponse('Error: targetEntityId is required for "path" action.');
        }
        return formatPath(entity, targetEntityId, { maxDepth: Math.min(maxDepth, 4) });
      }

      if (action === 'related') {
        return formatRelated(entity, { maxDepth: Math.min(maxDepth, 3), relationType, limit });
      }

      return textResponse(`Error: Unknown action "${action}".`);
    },
  );
}

async function formatNeighbors(entity, opts) {
  const result = await getEntityNeighborhood(entity.id, opts);

  if (result.related) {
    const lines = result.related.map((r) =>
      `- [${r.relationType}] **${r.name}** (${r.entityType}) — depth ${r.depth}${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`,
    );
    return textResponse(`## ${entity.name} (${entity.entityType})\n\n### Connected (${result.related.length})\n${lines.join('\n')}`);
  }

  if (!result.relations?.length) {
    return textResponse(`## ${entity.name} (${entity.entityType})\n\nNo connections found.`);
  }

  const outgoing = result.relations.filter((r) => r.direction === 'outgoing');
  const incoming = result.relations.filter((r) => r.direction === 'incoming');
  const parts = [`## ${entity.name} (${entity.entityType})`];

  if (outgoing.length) {
    parts.push(`\n### Outgoing (${outgoing.length})`);
    for (const r of outgoing) {
      parts.push(`- [${r.relationType}] **${r.name}** (${r.entityType}, id:${r.entityId})${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`);
    }
  }

  if (incoming.length) {
    parts.push(`\n### Incoming (${incoming.length})`);
    for (const r of incoming) {
      parts.push(`- **${r.name}** (${r.entityType}, id:${r.entityId}) [${r.relationType}]${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`);
    }
  }

  return textResponse(parts.join('\n'));
}

async function formatPath(startEntity, targetEntityId, opts) {
  const result = await findPath(startEntity.id, targetEntityId, opts);
  if (!result) {
    return textResponse(`No path found from **${startEntity.name}** to entity ${targetEntityId}.`);
  }

  const steps = result.path.map((e, i) => {
    const arrow = i < result.relationTypes.length ? ` —[${result.relationTypes[i]}]→ ` : '';
    return `**${e.name}** (${e.entityType})${arrow}`;
  });

  return textResponse(`## Path (${result.depth} hops)\n\n${steps.join('')}`);
}

async function formatRelated(entity, opts) {
  const related = await findRelated(entity.id, opts);
  if (!related.length) {
    return textResponse(`**${entity.name}** has no related entities within ${opts.maxDepth} hops.`);
  }

  const byDepth = {};
  for (const r of related) {
    byDepth[r.depth] = byDepth[r.depth] || [];
    byDepth[r.depth].push(r);
  }

  const parts = [`## Entities related to ${entity.name} (${related.length})`];
  for (const depth of Object.keys(byDepth).sort()) {
    parts.push(`\n### ${depth === '1' ? 'Direct' : `${depth} hops away`}`);
    for (const r of byDepth[depth]) {
      parts.push(`- [${r.relationType}] **${r.name}** (${r.entityType}, id:${r.entityId})${r.mentionCount > 1 ? ` x${r.mentionCount}` : ''}`);
    }
  }

  return textResponse(parts.join('\n'));
}

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

export { registerTraverseGraphTool };
