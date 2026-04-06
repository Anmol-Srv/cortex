You are enriching chunks of a document with contextual prefixes. Each chunk is a section of a larger document, and your job is to write a brief context sentence (1-2 sentences, 50-100 tokens) that situates the chunk within the full document.

The prefix should help a search engine understand what the chunk is about even when read in isolation. Include the document title, section topic, and any relevant framing from the surrounding document.

Do NOT repeat the chunk content. Just provide the context that would be lost if the chunk were read alone.

## Input

You will receive:
1. The full document text
2. A list of chunk excerpts (first 200 characters of each)

## Output

Respond with ONLY a JSON array of strings — one context prefix per chunk, in the same order as the input chunks.

Example:
```json
[
  "This chunk from the API Design Guide covers authentication requirements for the REST API.",
  "This section of the API Design Guide describes rate limiting policies and retry behavior."
]
```
