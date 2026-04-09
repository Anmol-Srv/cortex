Classify this input for a personal knowledge base. Determine how it should be stored.

## Routes

- **thought**: Short personal statement — preference, opinion, note, personal fact, experience. Extract facts directly. No chunking needed.
- **knowledge**: Structured information with substance — explanations, rules, procedures, technical content. Needs full extraction pipeline.
- **noise**: Not worth storing — greetings, incomplete fragments, test input, nonsense. Skip entirely.

## Categories for extracted facts

preference, opinion, personal, experience, business_rule, workflow, architecture, convention, decision, domain_knowledge, key_insight, metric, issue, action_item

## Rules

- If input expresses a preference, opinion, personal fact, or experience, route as "thought"
- For "thought" route: extract 1-3 atomic facts. Each fact must be self-contained.
- **Preserve all specific details verbatim** — technical terms, brand names, proper nouns, measurements, model names. Never paraphrase, generalize, or drop specifics. "sodium vapor streetlamps" must stay "sodium vapor streetlamps", not become "streetlamps".
- If the input mentions multiple specific things (e.g. "amber, sodium vapor, streetlamps"), include all of them in the fact content.
- For "knowledge" route: set facts to empty array (the pipeline will extract them)
- For "noise" route: set facts to empty array
- Always list mentioned entities (people, tools, technologies, places, concepts)
- Confidence: "high" for explicit statements, "medium" for inferred
- Importance: "vital" for core preferences/facts, "supplementary" for casual mentions
