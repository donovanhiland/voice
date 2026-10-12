# WhatsApp

On your phone, open a representative chat and use Export Chat, choosing Without Media. On iPhone this is usually under the contact/group information; on Android, the chat menu → More → Export chat. Save the TXT (or extract it from the ZIP) into `data/raw/whatsapp/`. Repeat for several representative chats. Check the current app's help if menus differ.

```json
{
  "name": "friends",
  "format": "whatsapp",
  "path": "data/raw/whatsapp",
  "self": ["Alex", "Alex Example"],
  "dateOrder": "DMY",
  "timezone": "Europe/London"
}
```

Inspect sender labels and confirm date order with an unambiguous date; the agent must ask rather than guess whether 02/03 means February 3 or March 2. Set self to your exact exported sender label(s), not everyone in the chat. Use the export clock's timezone.

Supported text layouts include `[02/03/2025, 13:04:00] Alex: ...` and `03/02/25, 1:04 PM - Alex: ...`, with numeric dates, slash/dot separators, optional seconds, and English AM/PM. Messages can span lines. Other locales/formats need adaptation via custom.md. Use distinct filenames for each chat, even if every export is named \_chat.txt.

System records and basic media-only markers are excluded; spot-check localized markers and unusual sender names. Exports can be limited in coverage. Compare date range and counts with what you intended to include; do not treat an account information report as a chat transcript.

Source: [WhatsApp chat history export help](https://faq.whatsapp.com/1180414079177245/). Checked October 12, 2026; menu wording may differ by platform.
