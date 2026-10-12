# Slack

Slack workspace exports depend on your role and plan. Ordinary members generally cannot export a workspace themselves. Workspace owners or authorized export administrators can use Slack's export tools; access to private channels and DMs has additional plan/approval requirements. Ask an administrator for an authorized export, or begin with a different source. Do not ask the agent to bypass workspace access.

Owners can open workspace settings and the Import/Export Data tools, choose an available date range, start the export, and download the ZIP when ready. Extract it into `data/raw/slack/`, retaining channel folders and date-named JSON files. Media files are unnecessary.

Find your member ID in Slack's profile controls or users.json. Confirm a known message has that user ID before importing.

```json
{
  "name": "work",
  "format": "slack",
  "path": "data/raw/slack",
  "self": ["U0123456789"]
}
```

The importer reads YYYY-MM-DD.json message arrays, keeps your text by ID, excludes bot/system messages, and uses final text for message_changed entries. Some message subtypes are not supported; inspect a sample and counts before assuming full coverage. Thread replies get their own thread identifier, but context is omitted: channel chronology does not establish which prior message a person answered. Retention settings and export permissions can limit coverage.

Sources: [Export workspace data](https://slack.com/help/articles/201658943-Export-your-workspace-data), [Read exports](https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports). Checked October 12, 2026.
