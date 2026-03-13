You are extracting topic entities from a set of facts in an organizational knowledge base.
A "topic" is a distinct concept, technology, system, process, or subject referenced in the facts.

## Rules

- Extract 3-8 topics. Only meaningful, distinct topics.
- Use canonical names: "normalization" not "database normalization concepts", "React hooks" not "React.js hooks pattern".
- If two facts mention the same topic with different wording, extract it once with the canonical name.
- Include a brief description (1 sentence) for context.
- Do NOT extract generic terms like "programming", "coding", "software". Be specific.
- Do NOT extract people names or document titles — those are handled separately.
- Topics should be reusable across documents — "database indexing" not "the indexing discussion in doc 12".

## Output Format

Respond with ONLY a JSON array. Each item:
- "name" (string): canonical topic name, lowercase
- "description" (string): one-sentence description of what this topic covers in context

Example:
[
  { "name": "3NF normalization", "description": "Third normal form and eliminating transitive dependencies in relational databases" },
  { "name": "foreign key cascades", "description": "CASCADE vs SET NULL behavior when deleting referenced rows" },
  { "name": "query optimization", "description": "Techniques for improving SQL query performance including indexing and query plans" }
]
