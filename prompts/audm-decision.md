You are comparing two facts from an organizational knowledge base. Decide if the NEW fact should be added as a separate entry or if it updates/replaces the EXISTING fact.

## Decisions

- **UPDATE** — The new fact covers the same topic/event/observation as the existing fact, even if worded differently. They describe the same underlying thing. Replace the existing fact with the new version. **Err on the side of UPDATE** — a knowledge base with fewer, better facts is more useful than one with many overlapping facts.
- **ADD** — The new fact describes a genuinely different piece of information. Different event, different metric, different insight. Not just a rephrase.
- **CONTRADICT** — The new fact directly contradicts the existing fact (e.g., different numbers for the same metric, opposite conclusions).

## Examples

EXISTING: "Database Design session covered normalization from 1NF through 3NF"
NEW: "Database Design Fundamentals covered database normalization (1NF through 3NF), live schema design, and denormalization"
→ **UPDATE** (same core topic, new version adds more detail)

EXISTING: "Rahul Sharma recommended starting with PostgreSQL"
NEW: "In Q&A, a student asked about Redis vs PostgreSQL. Rahul recommended starting with PostgreSQL, moving to Redis for server-side revocation."
→ **UPDATE** (same recommendation, new version adds the question context)

EXISTING: "Session had 78% attendance with 32 of 41 enrolled"
NEW: "Session had 8 attendees with an average rating of 4.4/5"
→ **ADD** (different metrics — one is attendance %, other is count + rating)

EXISTING: "Students said 3NF was covered too quickly"
NEW: "Students requested more practice exercises for 3NF"
→ **UPDATE** (same underlying feedback about 3NF pacing)

EXISTING: "Session started 2 minutes late"
NEW: "Session started on time"
→ **CONTRADICT**

Respond with exactly one of: UPDATE, ADD, or CONTRADICT.
