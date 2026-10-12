# iMessage, RCS, and SMS

The importer accepts English TXT transcripts from [imessage-exporter](https://github.com/ReagentX/imessage-exporter). The easiest route uses messages already synced to a Mac. The exporter also documents iOS backup input; availability depends on what your device/backup contains.

On macOS, install with Homebrew or follow the maintainer's Cargo/prebuilt binary instructions:

```sh
brew install imessage-exporter
imessage-exporter -f txt -c disabled -o data/raw/imessage
```

If macOS denies database access, grant Full Disk Access to the terminal/app running the exporter through System Settings → Privacy & Security, then retry. The agent can guide this user controlled step. Do not copy attachments; writing style only needs text.

```json
{
  "name": "personal-texts",
  "format": "imessage",
  "path": "data/raw/imessage",
  "self": ["Me"],
  "timezone": "America/New_York"
}
```

Set timezone to the clock used in the export, not this example by default. The expected timestamp looks like `Jan 02, 2025  1:00:00 PM`, followed by the sender and message. Owner messages normally use Me. If you used custom-name or caller-ID options, set self accordingly.

The importer preserves paragraphs and nested reply records, uses final edited text, strips attachment markers/tapbacks/link previews, and sorts records by time. Inspect samples to verify the exporter version matches. Ambiguous or nonexistent DST clocks are rejected; convert affected records to the common JSONL format with explicit offsets rather than guessing.

Source: [Binary installation and export options](https://github.com/ReagentX/imessage-exporter/blob/develop/imessage-exporter/README.md). Checked October 12, 2026.
