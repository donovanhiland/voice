# Telegram

Use Telegram Desktop from desktop.telegram.org. Its export feature can export account data or an individual chat. Open Settings (often Advanced → Export Telegram data), choose the conversations and date range you want, and select machine-readable JSON rather than HTML. You can also use a chat's export menu where available. Menu labels vary by client version; mobile and other desktop clients may not expose the same export tools.

Save the export folder containing result.json into `data/raw/telegram/`. Media is unnecessary. Inspect an outgoing message's from_id field to find your author ID, such as user123456789; configure the literal value, not just your display name.

```json
{
  "name": "telegram",
  "format": "telegram",
  "path": "data/raw/telegram",
  "self": ["user123456789"]
}
```

The importer supports account `chats.list` and single-chat `messages` layouts, date_unixtime timestamps, and text arrays containing formatting entities. It keeps text content rather than recreating rich formatting. It excludes service events and other senders. Check actual exported coverage and ordering before deriving a profile.

Source: [Telegram export announcement](https://telegram.org/blog/export-and-more). Checked October 12, 2026; verify current client menus when guiding a user.
