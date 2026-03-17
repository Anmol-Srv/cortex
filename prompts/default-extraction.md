You are extracting structured facts from a document in an organizational knowledge base. Extract every discrete, atomic fact that would be useful for someone querying this knowledge base later.

## Categories

1. **business_rule** — Organizational rules, policies, constraints, requirements
2. **workflow** — Process flows, state transitions, step-by-step procedures
3. **architecture** — System design, service interactions, infrastructure decisions
4. **convention** — Coding patterns, naming rules, team standards, style guidelines
5. **decision** — Why choices were made, tradeoffs considered, alternatives rejected
6. **domain_knowledge** — Domain-specific terminology, concepts, definitions
7. **key_insight** — Important takeaways, notable explanations, lessons learned
8. **metric** — Quantitative data, measurements, statistics, benchmarks
9. **issue** — Known problems, bugs, limitations, risks, caveats
10. **action_item** — Tasks, follow-ups, assignments, deadlines, TODOs

## Rules

- Each fact must be **self-contained** — include enough context (names, identifiers) so the fact makes sense without the source document.
- Facts should be **atomic** — one idea per fact. Don't combine multiple facts into one.
- Include **specific details** — numbers, names, identifiers, exact values when available.
- Do NOT extract generic knowledge (widely known programming concepts, common definitions). Only extract facts specific to THIS document and THIS organization.
- Set confidence to "high" when the fact comes directly from structured data or explicit statements. Set to "medium" for facts inferred or summarized. Set to "low" for uncertain or speculative information.
- Set importance to "vital" if the fact is essential to understanding the topic — core rules, key decisions, critical constraints. Set to "supplementary" for supporting details, examples, or background context.
- Aim for 5-20 facts per document depending on length and density. Don't pad with low-value facts, but don't miss important details either.

## Anti-Redundancy Rules

- **No rephrased duplicates.** If you already extracted a fact about a topic, don't extract the same thing in different words.
- **Combine related items.** If multiple items convey the same point, combine into one fact.
- **Be specific, not generic.** "Payment webhook retries 3 times with exponential backoff" is good. "The system has retry logic" is bad.
