import { z } from 'zod';

import cortexDb from '../../db/cortex.js';
import { findByUid } from '../../memory/facts/store.js';
import { getEntitiesForFact } from '../../memory/facts/entity-linker.js';
import { getRelationsByFact } from '../../memory/entities/relations.js';

function registerGetFactContextTool(server) {
  server.tool(
    'get_fact_context',
    `Get a fact with full context: entities mentioned, relations created, source documents.
Use for: "tell me more about this fact", "what's the source for this?", "who is involved?".
Returns fact details + linked entities + provenance.`,
    {
      uid: z.string().optional().describe('Fact UID (e.g. "fact-a1b2c3d4")'),
      factId: z.number().optional().describe('Fact ID (alternative to UID)'),
    },
    async ({ uid, factId }) => {
      if (!uid && !factId) {
        return textResponse('Error: Provide either uid or factId.');
      }

      let fact;
      if (uid) {
        fact = await findByUid(uid);
      } else {
        fact = await cortexDb('fact').where({ id: factId }).first();
      }

      if (!fact) {
        return textResponse('Error: Fact not found.');
      }

      const [entities, relations, documents] = await Promise.all([
        getEntitiesForFact(fact.id),
        getRelationsByFact(fact.id),
        fact.sourceDocumentIds?.length
          ? cortexDb('document').whereIn('id', fact.sourceDocumentIds).select('id', 'title', 'sourceType', 'sourcePath')
          : [],
      ]);

      const parts = [
        `## Fact: ${fact.uid}`,
        `- **Content:** ${fact.content}`,
        `- **Category:** ${fact.category}`,
        `- **Confidence:** ${fact.confidence}`,
        `- **Status:** ${fact.status}`,
      ];

      if (fact.sourceSection) {
        parts.push(`- **Source section:** ${fact.sourceSection}`);
      }

      if (entities.length) {
        parts.push('\n### Entities Mentioned');
        for (const e of entities) {
          parts.push(`- **${e.name}** (${e.entityType}, id:${e.id})`);
        }
      }

      if (relations.length) {
        parts.push('\n### Relations Created from This Fact');
        for (const r of relations) {
          parts.push(`- **${r.sourceName}** (${r.sourceType}) —[${r.relationType}]→ **${r.targetName}** (${r.targetType})`);
        }
      }

      if (documents.length) {
        parts.push('\n### Source Documents');
        for (const doc of documents) {
          parts.push(`- **${doc.title}** (${doc.sourceType}, path: ${doc.sourcePath})`);
        }
      }

      return textResponse(parts.join('\n'));
    },
  );
}

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

export { registerGetFactContextTool };
