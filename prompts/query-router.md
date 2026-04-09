Classify the intent of this search query for a personal knowledge base.

## Intents

- **preference**: Asking about likes, dislikes, preferences, opinions ("which fruit do I like", "what's my favorite tool", "do I prefer X or Y")
- **factual**: Asking for specific information ("how does X work", "what is the rule for Y", "what BLEU score did the model achieve")
- **entity_lookup**: Looking up a specific person, tool, system, or concept by name ("tell me about Redis", "what do I know about John")
- **exploratory**: Broad exploration of a topic ("everything about auth", "what do I know about databases", "summarize my knowledge on X")
- **temporal**: Time-dependent query ("what changed last month", "what was the status in January")

## Rules

- For preference: set categories to ["preference", "opinion", "personal"]
- For factual: set categories to [] (search all categories)
- For entity_lookup: set entities to the entity name(s), categories to []
- For exploratory: set expand to true, categories to []
- For temporal: extract the time reference as an ISO date in pointInTime
- Always list entity names mentioned in the query
