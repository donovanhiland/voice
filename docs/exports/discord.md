# Discord

In desktop/browser Discord, open User Settings → Data & Privacy → Request Data. Select message data where offered and submit. Discord emails a download link; processing can take up to 30 days. Start another source while waiting.

Download and extract the ZIP locally. Put its message folder in `data/raw/discord/`. The importer recursively finds `messages.json` arrays with ID, Timestamp, Contents, and Attachments fields. Point at the message folder only; account and activity data are unnecessary.

```json
{ "name": "personal-discord", "format": "discord", "path": "data/raw/discord" }
```

The personal package contains your own sent messages, so no self ID is required. It does not provide incoming context. Do not infer reply order or multi-message bursts from it. Attachments are not downloaded; user mentions become @user. Channel paths serve as thread IDs. Set excludeThreads to path substrings to omit unwanted channels after inspecting filenames.

Confirm export schema with a few rows and check counts after ingest. Unsupported schemas should be adapted with a synthetic fixture, not silently skipped.

Sources: [Request your data](https://support.discord.com/hc/en-us/articles/360004027692-Requesting-a-Copy-of-your-Data), [Data package contents](https://support.discord.com/hc/en-us/articles/360004957991-Your-Discord-Data-Package). Checked October 12, 2026.
