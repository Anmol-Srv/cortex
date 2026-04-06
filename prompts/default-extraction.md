You are extracting structured facts from a document in a personal knowledge base. Extract every discrete, atomic fact that would be useful for someone querying this knowledge base later.

## Categories

1. **preference** — Personal likes, dislikes, favorites, preferred tools/foods/methods
2. **opinion** — Personal views, assessments, evaluations of tools/concepts/approaches
3. **personal** — Personal facts: birthday, workplace, location, biographical details
4. **experience** — Personal experiences: projects built, tools used, skills acquired, years of use
5. **business_rule** — Organizational rules, policies, constraints, requirements
6. **workflow** — Process flows, state transitions, step-by-step procedures
7. **architecture** — System design, service interactions, infrastructure decisions
8. **convention** — Coding patterns, naming rules, team standards, style guidelines
9. **decision** — Why choices were made, tradeoffs considered, alternatives rejected
10. **domain_knowledge** — Domain-specific terminology, concepts, definitions
11. **key_insight** — Important takeaways, notable explanations, lessons learned
12. **metric** — Quantitative data, measurements, statistics, benchmarks
13. **issue** — Known problems, bugs, limitations, risks, caveats
14. **action_item** — Tasks, follow-ups, assignments, deadlines, TODOs

## Rules

- Each fact must be **self-contained** — include enough context (names, identifiers) so the fact makes sense without the source document.
- Facts should be **atomic** — one idea per fact. Don't combine multiple facts into one.
- Include **specific details** — numbers, names, identifiers, exact values when available. **Never paraphrase or drop specific terms** (brand names, technical terms, model names, proper nouns). "sodium vapor lamps" must appear as "sodium vapor lamps", not just "lamps".
- Do NOT extract generic knowledge (widely known programming concepts, common definitions). Only extract facts specific to THIS document and THIS person/organization.
- Use personal categories (preference, opinion, personal, experience) when the content expresses subjective or biographical information. Use knowledge categories for objective/organizational information.
- Set confidence to "high" when the fact comes directly from explicit statements. Set to "medium" for facts inferred or summarized. Set to "low" for uncertain or speculative information.
- Set importance to "vital" if the fact is essential to understanding the topic — core preferences, key decisions, critical constraints. Set to "supplementary" for supporting details, examples, or background context.
- Aim for 5-20 facts per document depending on length and density. Don't pad with low-value facts, but don't miss important details either.

## Anti-Redundancy Rules

- **No rephrased duplicates.** If you already extracted a fact about a topic, don't extract the same thing in different words.
- **Combine related items.** If multiple items convey the same point, combine into one fact.
- **Be specific, not generic.** "I prefer Fastify over Express for Node.js APIs" is good. "The user has framework preferences" is bad.
