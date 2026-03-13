import { z } from 'zod';
import { partition } from 'lodash-es';

import { search } from '../../memory/search/hybrid.js';
import config from '../../config.js';

const CONFIDENCE_INDICATOR = { high: '[high]', medium: '[med]', low: '[low]' };

function registerSearchTool(server) {
  server.tool(
    'search',
    `Search Cortex knowledge base — finds facts and chunks across all ingested documents.
Use for: "how does X work", "what are the rules for Y", "what is the convention for Z",
architecture decisions, business rules, workflows, domain knowledge.
Returns ranked facts (precise answers) and chunks (supporting context).
Graph-enhanced: also returns related facts discovered through entity relationships.
Facts are grouped by confidence level (high > medium > low).`,
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().optional().default(10).describe('Max results per type (facts + chunks)'),
      namespaces: z.array(z.string()).optional().describe('Filter by namespaces. Defaults to all accessible.'),
      minConfidence: z.enum(['low', 'medium', 'high']).optional().default('medium').describe('Minimum fact confidence level'),
      useGraph: z.boolean().optional().default(true).describe('Enable graph-enhanced search (entity traversal for related facts)'),
    },
    async ({ query, limit, namespaces, minConfidence, useGraph }) => {
      const ns = namespaces?.length ? namespaces : [config.defaults.namespace];

      const { facts, chunks } = await search(query, {
        namespaces: ns,
        limit,
        minConfidence,
        useGraph,
      });

      const parts = [];

      if (facts.length) {
        const [related, direct] = partition(facts, (f) => f.resultType === 'related');

        if (direct.length) {
          parts.push(...formatFactsByConfidence(direct, limit));
        }

        if (related.length) {
          parts.push('\n## Related (via entity graph)\n');
          for (const f of related) {
            const ci = CONFIDENCE_INDICATOR[f.confidence] || '';
            parts.push(`- ${ci} **[${f.category}]** ${f.content}\n  _(via ${f.relationPath}, score: ${f.rrfScore?.toFixed(4)})_\n`);
          }
        }
      }

      if (chunks.length) {
        parts.push('\n## Chunks\n');
        for (const c of chunks) {
          const heading = c.sectionHeading ? `[${c.sectionHeading}] ` : '';
          parts.push(`---\n${heading}_(score: ${c.rrfScore?.toFixed(4)})_\n\n${c.content}\n`);
        }
      }

      if (!parts.length) {
        parts.push('No results found.');
      }

      return { content: [{ type: 'text', text: parts.join('\n') }] };
    },
  );
}

function formatFactsByConfidence(facts, limit) {
  const high = facts.filter((f) => f.confidence === 'high');
  const medium = facts.filter((f) => f.confidence === 'medium');
  const low = facts.filter((f) => f.confidence === 'low');

  const parts = [];

  if (high.length) {
    parts.push('## High Confidence Facts\n');
    for (const f of high.slice(0, Math.ceil(limit * 0.6))) {
      parts.push(`- **[${f.category}]** ${f.content}\n  _(score: ${f.rrfScore?.toFixed(4)})_\n`);
    }
  }

  if (medium.length) {
    parts.push('\n## Medium Confidence Facts\n');
    for (const f of medium.slice(0, Math.ceil(limit * 0.3))) {
      parts.push(`- **[${f.category}]** ${f.content}\n  _(score: ${f.rrfScore?.toFixed(4)})_\n`);
    }
  }

  if (low.length && !high.length) {
    parts.push('\n## Low Confidence Facts (no better results available)\n');
    for (const f of low.slice(0, 2)) {
      parts.push(`- **[${f.category}]** ${f.content}\n  _(score: ${f.rrfScore?.toFixed(4)})_\n`);
    }
  }

  return parts;
}

export { registerSearchTool };
