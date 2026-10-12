# Install the generated skill

Build output is `output/voice/`, containing SKILL.md and its references. These files include personal excerpts. Keep them private unless you intentionally want to share your writing samples.

Ask your agent to locate its supported skill directory and install the entire folder. Before copying, inspect whether a voice skill already exists. Back it up or use a different skill name if needed; do not overwrite silently.

For Claude Code, a personal installation typically lives at `~/.claude/skills/voice/`. See [Claude Code skills](https://code.claude.com/docs/en/skills). For Codex and other agents, have the agent check its current skill discovery instructions and supported location. The built files are portable Markdown; scripts do not depend on either agent.

A manual Claude Code copy, after checking the destination:

```sh
mkdir -p ~/.claude/skills
cp -R output/voice ~/.claude/skills/voice
```

Invoke with a fresh request, for example: “Use my voice. Tell my friend I can meet at 3 tomorrow but need to leave by 4.” Verify requested facts, punctuation preferences, and output text. If clean evaluation worked but installed output differs, check global instructions, hooks, and other writing skills. Treat the installed environment as its own integration test.

Update preferences in voice.config.json, rebuild, and reinstall to retain corrections. Manual changes to output/voice/ are replaced by build.
