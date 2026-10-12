# voice

Build a compact agent skill that writes chat messages like you, using your own message exports. Your agent guides you through export, setup, sample review, and evaluation.

The pipeline runs locally. It extracts your outgoing messages, reserves evaluation examples, measures each source separately, and generates a skill with preferences, a style card, and writing samples. It makes no model calls and sends no messages. Your chosen agent handles drafting and review.

## Start with your agent

Install [Bun](https://bun.sh/docs/installation) (1.1.38 or later) and Git, then:

```sh
git clone https://github.com/donovanhiland/voice.git
cd voice
bun install --frozen-lockfile
```

Open the folder in your coding agent and say:

> Read AGENTS.md and help me build a voice skill from my messages. Guide me through exports, setup, and reviewing the first drafts. Start with the easiest source I can access.

Claude Code also reads the included CLAUDE.md pointer. Other agents can read AGENTS.md explicitly. No particular model, API key, or subscription is required by the scripts.

Try the complete local build with fictional data first:

```sh
bun run demo
```

The demo writes to `data/demo/`, never your real output. Its messages are synthetic and only show how the pipeline works.

## Export your messages

One source is enough. Each guide explains where to export, what to save, how to identify your own messages, and limitations.

| Source         | Accepted input                                    | Guide                                    |
| -------------- | ------------------------------------------------- | ---------------------------------------- |
| Discord        | Personal data package message JSON                | [Discord](docs/exports/discord.md)       |
| iMessage / SMS | imessage-exporter TXT transcripts                 | [iMessage](docs/exports/imessage.md)     |
| WhatsApp       | Export Chat TXT, without media                    | [WhatsApp](docs/exports/whatsapp.md)     |
| Slack          | Workspace JSON export, filtered by your member ID | [Slack](docs/exports/slack.md)           |
| Telegram       | Desktop JSON `result.json`                        | [Telegram](docs/exports/telegram.md)     |
| Other apps     | Common JSONL conversation format                  | [Custom imports](docs/exports/custom.md) |

Importers are tested against synthetic fixtures. Export formats vary by app version, locale, and device. Have your agent inspect a small sample and the import report before trusting a full corpus. WhatsApp currently supports numeric DMY/MDY dates and English AM/PM; iMessage supports the English TXT timestamp format. English writing is the primary target of the current style measurements.

## Build manually

```sh
bun run voice init
```

Edit the ignored `voice.config.json`: set your name, IANA timezone, sources, sender labels/IDs, and preferences. Paths point to extracted export folders, not ZIP files. Use separate source names for contexts you want measured separately.

Example source entries (choose those you actually have):

```json
[
  {
    "name": "personal-texts",
    "format": "imessage",
    "path": "data/raw/imessage",
    "self": ["Me"]
  },
  {
    "name": "friends",
    "format": "whatsapp",
    "path": "data/raw/whatsapp",
    "self": ["Alex"],
    "dateOrder": "DMY"
  },
  {
    "name": "work",
    "format": "slack",
    "path": "data/raw/slack",
    "self": ["U0123456789"]
  }
]
```

Preferences are your current choices, such as “Occasional italics are fine; never bold.” They override measured habits and survive rebuilding. Defaults contain no personal bans or vocabulary rules.

```sh
bun run voice doctor
bun run voice ingest
bun run voice build
bun run voice budget
```

Inspect `data/import-report.json` and `output/voice/`. Review the first drafts before spending time on larger evals. Add data or adjust preferences when the examples feel wrong. Ingest and build replace derived files; frozen evaluation runs remain separate.

`output/voice/` is the installable skill. Its character based token estimate defaults to 2,600 tokens including all references. Copy the entire folder, not only SKILL.md, into your agent's skill directory. See [installation](docs/installation.md).

## Evaluate

The eval workflow compares drafts with a generic baseline using frozen heldout messages. It works with any agent that can write JSONL files. It separates brief authoring from drafting so the writer does not see the target wording.

```sh
bun run voice eval prepare first
# Have your agent follow docs/evaluation.md to write briefs.jsonl.
bun run voice eval inputs first
# Generate skill and baseline drafts from inputs.jsonl in fresh contexts.
bun run voice eval score first
```

The report shows descriptive style statistics by source, not a “sounds like you” pass/fail verdict. Review content completeness and whether you would actually send the drafts. [Evaluation instructions](docs/evaluation.md) include exact file schemas, prompts, and boundaries.

## Your data

`data/`, `output/`, personal config, and environment files are ignored by Git. Generated skills include real excerpts; treat them as personal data too. Scripts run locally, but anything your cloud agent reads may go to its model provider. Discuss that boundary with your agent before it reads private exports. You can use a local model instead.

Share this repository, not your exports or generated skill. Use synthetic examples in issues and contributions. The repo starts with fresh history and contains no author's message archive or generated voice profile.

## Development

```sh
bun test
bun run check
```

Tests cover author filtering, paragraphs, edits, nested replies, emoji reactions, near duplicate handling, timestamp ambiguity, heldout separation, token budgets, and eval completeness. CI runs these checks and the synthetic demo.

This is an initial reusable version of a personal experiment. Large model judges and custom discriminators are deliberately outside the default onboarding loop; validate small drafts with the person first. [Contributing](CONTRIBUTING.md).
