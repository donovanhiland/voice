# Evaluate without copying the target

Start with a few fresh drafts and the user's feedback. This larger workflow measures style against heldout messages and a generic baseline. It does not automatically judge content accuracy or personal voice fidelity.

## Prepare a frozen run

After ingest, build, and budget:

```sh
bun run voice eval prepare first
```

This writes `data/eval/runs/first/`: a skill snapshot, build/run hashes, `authoring.jsonl`, and `reference.jsonl`. A run name cannot be reused. The snapshot captures edits made after build too. Local outputs contain personal data and are ignored by Git.

Heldout selection is deterministic, capped at 20% of each source's text messages, balanced across available length bands, and capped per thread. Repeated normalized texts stay in training rather than leaking through exact wording into the test. At least five heldout cases are required. Small corpora and sparse sources have weak statistical evidence; inspect sample counts. Context only includes preceding turns within 30 minutes where the importer supports ordered conversations. Slack context is omitted rather than assuming channel chronology is a reply chain.

## Author neutral briefs

Use an authoring context that may read `authoring.jsonl` but never edits the skill. Ask:

> For each row in authoring.jsonl, write a neutral content brief describing what the expected message communicates. Preserve facts, names, numbers, requests, questions, and commitments. Rephrase rather than copying its casing, slang, or punctuation. Do not invent a reply to the context. Save one JSONL row per ID to briefs.jsonl with fields id and brief. Flag ambiguous messages for review.

Example schema (fictional):

```json
{
  "id": "sample:abc",
  "brief": "Ask whether they can meet at 3 tomorrow, and offer 4 as an alternative."
}
```

Review briefs for omissions. Run:

```sh
bun run voice eval inputs first
```

`inputs.jsonl` contains ID, source, brief, and context, with no expected output. Exact copied briefs are rejected; semantic quality still requires review. The original heldout target and any exact target messages appearing in context are excluded from writer inputs.

## Draft in separate contexts

Use fresh contexts, one for the skill and one for the baseline. The contexts may read `inputs.jsonl`; neither may read authoring.jsonl, reference.jsonl, review.jsonl, briefs.example.jsonl, or previous outputs. Disable unrelated global writing hooks if possible; document any that remain. An agent that already read expected messages cannot do an independent blind writer pass in the same context.

Skill writer prompt:

> Read the frozen skill in this run's skill/ folder. For each input, draft a message expressing exactly its brief, informed by its source and context. Output only the draft in the output field. Write JSONL rows containing id, variant: "skill", and output. Do not read reference or authoring files.

Baseline writer prompt:

> For each input, write a natural chat message expressing exactly its brief, informed by its context. Write JSONL rows containing id, variant: "baseline", and output. Do not read the voice skill, training corpus, profile, exemplars, reference, or authoring files.

Use the same model and settings for both variants. Save to separate ignored files, then concatenate into `drafts.jsonl`. Save completed rows incrementally, resume missing ID/variant pairs, and never generate both variants in a shared context where the baseline has already seen the skill.

```json
{"id":"sample:abc","variant":"skill","output":"Can you meet at 3 tomorrow? 4 works too"}
{"id":"sample:abc","variant":"baseline","output":"Would 3 tomorrow work? I can also do 4."}
```

Record the runner in `runner.json` alongside drafts:

```json
{
  "model": "actual model/version",
  "settings": {},
  "hooks": "disabled or describe",
  "contexts": "fresh and separate",
  "notes": ""
}
```

Check a single case for content completeness, output wrapping, or tool calls before expanding the batch. Scripts themselves make no model calls, so model latency and cost depend on your chosen agent. There is no automatic retry loop.

## Score and review

```sh
bun run voice eval score first
```

Both variants need exactly one nonempty draft per ID. The report compares observed rates and lengths by source. It is descriptive, with no learned discriminator or automatic voice pass threshold. `review.jsonl` contains actual, skill, and baseline texts with blank `contentComplete`, `wouldSend`, and `notes` fields. Have the user review drafts: unchanged, small edit, or reject. Track factual completeness independently of style.

If adding a model judge later, give it an independent reference sample of this person's messages. Test its calibration on real messages and baselines first. A generic human-versus-AI detector is not a personal voice judge.

Do not feed reviewed heldout text back into the skill while calling it a test set. Once results inform refinement, those cases are development data. For a final test, use a new export/sample excluded from all previous training and review, and create a new run.
