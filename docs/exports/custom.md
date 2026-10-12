# Other apps and custom exports

Convert an authorized export into one JSON object per line, saved under a dedicated folder such as data/raw/custom/:

```json
{"id":"1","thread":"conversation-a","ts":"2025-01-02T13:00:00Z","text":"Can we meet at 3?","me":false}
{"id":"2","thread":"conversation-a","ts":"2025-01-02T13:01:00Z","text":"3 works for me","me":true}
```

Required fields: thread (string), ts (ISO timestamp with explicit offset), text (string), me (boolean). id is optional but recommended and must distinguish records in the same conversation. Preserve raw casing, punctuation, emojis, and paragraphs; encode paragraph breaks as \n inside JSON. Include incoming messages when available so context can be recovered, but only me:true messages become style samples.

```json
{ "name": "custom-chat", "format": "jsonl", "path": "data/raw/custom" }
```

Ask the agent to inspect the source format and author identity, write a converter, test it against a small synthetic fixture, and report counts before importing. Do not label all records as your own. Keep legitimate repetition across time; the importer only removes identical same-thread text within 60 seconds. Records are sorted chronologically per thread.

Use separate source labels or directories for contexts you want measured independently. Never infer reply context from an export that contains only outgoing messages. If no incoming data exists, output only your actual records; do not fabricate messages from others.
