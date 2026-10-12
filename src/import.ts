import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { Source, Record, Message } from "./types";

export function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}
// Local export clocks have no offset. Reject nonexistent/ambiguous DST times
// rather than silently inventing their chronology. JSONL can supply an offset.
export function localIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  sec: number,
  zone: string,
): string {
  const target = [y, mo, d, h, mi, sec];
  const wall = Date.UTC(y, mo - 1, d, h, mi, sec);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  function parts(ms: number) {
    const p = Object.fromEntries(
      fmt.formatToParts(ms).map((x) => [x.type, x.value]),
    );
    return [
      Number(p.year),
      Number(p.month),
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    ];
  }
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const v = parts(wall + delta);
    offsets.add(
      Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], v[5]) - (wall + delta),
    );
  }
  const candidates = [...offsets]
    .map((o) => wall - o)
    .filter((ms) => parts(ms).every((v, i) => v === target[i]));
  if (candidates.length !== 1)
    throw new Error(
      `Invalid or ambiguous local timestamp ${target.join("-")} in ${zone}; convert this record to JSONL with an explicit UTC offset.`,
    );
  return new Date(candidates[0]).toISOString();
}
function iso(value: string): string {
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value))
    throw new Error(`Timestamp requires a UTC offset: ${value}`);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()))
    throw new Error(`Invalid timestamp: ${value}`);
  return d.toISOString();
}
export function cleanImessage(body: string[]): string {
  let lines = body.filter(
    (l) => l.trim() !== "This message responded to an earlier message.",
  );
  while (lines.some((l) => l.trim() === "Tapbacks:")) {
    const i = lines.findIndex((l) => l.trim() === "Tapbacks:");
    let end = i + 1;
    while (end < lines.length && /^\s{2,}\S/.test(lines[end])) end++;
    lines.splice(i, end - i);
  }
  const edited = lines.findIndex((l) => /^Edited .*later: /.test(l));
  if (edited >= 0)
    lines = [
      lines[edited].replace(/^Edited .*later: /, ""),
      ...lines.slice(edited + 1),
    ];
  lines = lines.filter(
    (l) =>
      !/^Edited\s*$/.test(l) &&
      !/^\s*(\/Users\/|Attachment missing!)/.test(l) &&
      !/^[\w ().-]+\.(jpg|jpeg|png|heic|mov|mp4|gif|pdf|caf|webp)$/i.test(
        l.trim(),
      ),
  );
  const url = lines.findIndex((l) => /^https?:\/\/\S+$/.test(l.trim()));
  if (url >= 0) lines = lines.slice(0, url + 1);
  return lines.join("\n").trim();
}
export function parseImessage(
  text: string,
  thread: string,
  self: string[],
  zone: string,
): Record[] {
  const records: Record[] = [];
  let current: { ts: string; indent: boolean; lines: string[] } | undefined;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  function flush() {
    if (!current || !current.lines.length) return;
    const sender = current.lines[0].trim();
    const body = cleanImessage(current.lines.slice(1));
    records.push({
      id: hash(`${thread}:${current.ts}:${records.length}`),
      thread,
      ts: current.ts,
      text: body,
      me: self.includes(sender),
    });
  }
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m =
      /^( {4})?([A-Za-z]{3}) (\d{1,2}), (\d{4})\s+(\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/.exec(
        line,
      );
    if (m) {
      flush();
      const h = (Number(m[5]) % 12) + (m[8] === "PM" ? 12 : 0);
      current = {
        ts: localIso(
          Number(m[4]),
          months.indexOf(m[2]) + 1,
          Number(m[3]),
          h,
          Number(m[6]),
          Number(m[7]),
          zone,
        ),
        indent: !!m[1],
        lines: [],
      };
    } else if (current)
      current.lines.push(
        current.indent && line.startsWith("    ") ? line.slice(4) : line,
      );
  }
  flush();
  return records;
}
export function parseWhatsapp(
  text: string,
  thread: string,
  self: string[],
  zone: string,
  order: "DMY" | "MDY",
): Record[] {
  const records: Record[] = [];
  let current: Record | undefined;
  function flush() {
    if (current) {
      current.text = current.text.trim();
      records.push(current);
    }
  }
  for (const original of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = original
      .replace(/[\u200e\u200f\u202f\u00a0]/g, " ")
      .trimStart();
    const m =
      /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\]?\s*(?:-\s*)?(.*)$/i.exec(
        line,
      );
    if (m) {
      flush();
      current = undefined;
      const sender = /^([^:]+):\s?(.*)$/.exec(m[8]);
      if (!sender) continue; // system record ends the previous message
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      let h = Number(m[4]);
      if (m[7]) h = (h % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
      const ts = localIso(
        y,
        Number(order === "DMY" ? m[2] : m[1]),
        Number(order === "DMY" ? m[1] : m[2]),
        h,
        Number(m[5]),
        Number(m[6] ?? 0),
        zone,
      );
      current = {
        id: hash(`${thread}:${ts}:${records.length}`),
        thread,
        ts,
        text: sender[2],
        me: self.includes(sender[1].trim()),
      };
    } else if (current) current.text += "\n" + original;
  }
  flush();
  return records;
}
function textValue(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((x) => (typeof x === "string" ? x : (x.text ?? "")))
      .join("");
  return "";
}
export async function importSource(
  source: Source,
  defaultZone: string,
): Promise<Message[]> {
  const all = await files(source.path);
  const records: Record[] = [];
  const self = source.self ?? [];
  const zone = source.timezone ?? defaultZone;
  if (!["discord", "jsonl"].includes(source.format) && !self.length)
    throw new Error(`${source.name}: configure self sender labels/IDs first.`);
  if (source.format === "whatsapp" && !source.dateOrder)
    throw new Error(
      `${source.name}: set dateOrder to DMY or MDY after inspecting the export.`,
    );
  for (const file of all) {
    const thread = relative(source.path, file).replace(/\.[^.]+$/, "");
    if (source.format === "imessage" && file.endsWith(".txt"))
      records.push(
        ...parseImessage(await readFile(file, "utf8"), thread, self, zone),
      );
    if (source.format === "whatsapp" && file.endsWith(".txt"))
      records.push(
        ...parseWhatsapp(
          await readFile(file, "utf8"),
          thread,
          self,
          zone,
          source.dateOrder!,
        ),
      );
    if (source.format === "discord" && basename(file) === "messages.json") {
      const rows = JSON.parse(await readFile(file, "utf8"));
      if (!Array.isArray(rows))
        throw new Error(`${file}: expected Discord message array.`);
      for (const r of rows) {
        if (typeof r.Contents !== "string" || typeof r.Timestamp !== "string")
          throw new Error(
            `${file}: unsupported Discord format; inspect it before adapting.`,
          );
        records.push({
          id: String(r.ID),
          thread,
          ts: iso(
            r.Timestamp.replace(" ", "T") +
              (/(Z|[+-]\d{2}:?\d{2})$/.test(r.Timestamp) ? "" : "Z"),
          ),
          text: r.Contents.replace(/<@!?\d+>/g, "@user"),
          me: true,
        });
      }
    }
    if (
      source.format === "slack" &&
      file.endsWith(".json") &&
      /^\d{4}-\d{2}-\d{2}\.json$/.test(basename(file))
    ) {
      const rows = JSON.parse(await readFile(file, "utf8"));
      for (const row of rows) {
        const r = row.subtype === "message_changed" ? row.message : row;
        if (
          !r ||
          r.type !== "message" ||
          r.bot_id ||
          (r.subtype && r.subtype !== "thread_broadcast")
        )
          continue;
        if (typeof r.text !== "string" || !r.ts || !r.user) continue;
        // Treat each reply thread separately; do not infer reply adjacency from whole-channel order.
        records.push({
          id: r.ts,
          thread: `${relative(source.path, file).split(/[\\/]/).slice(0, -1).join("/")}:${r.thread_ts ?? "channel"}`,
          ts: new Date(Number(r.ts) * 1000).toISOString(),
          text: r.text
            .replace(/<@(\w+)>/g, "@user")
            .replace(
              /<(https?:[^>|]+)(?:\|([^>]+))?>/g,
              (_: string, url: string, label: string | undefined) =>
                label ?? url,
            ),
          me: self.includes(r.user),
        });
      }
    }
    if (source.format === "telegram" && basename(file) === "result.json") {
      const data = JSON.parse(await readFile(file, "utf8"));
      const chats = data.chats?.list ?? (data.messages ? [data] : []);
      for (const chat of chats)
        for (const r of chat.messages ?? []) {
          if (r.type !== "message" || !r.from_id) continue;
          if (!r.date_unixtime)
            throw new Error(`${file}: Telegram message lacks date_unixtime.`);
          records.push({
            id: String(r.id),
            thread: String(chat.id ?? thread),
            ts: new Date(Number(r.date_unixtime) * 1000).toISOString(),
            text: textValue(r.text),
            me: self.includes(r.from_id),
          });
        }
    }
    if (source.format === "jsonl" && file.endsWith(".jsonl")) {
      for (const [index, line] of (await readFile(file, "utf8"))
        .split("\n")
        .entries()) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (
          typeof r.text !== "string" ||
          typeof r.thread !== "string" ||
          typeof r.me !== "boolean" ||
          typeof r.ts !== "string"
        )
          throw new Error(
            `${file}:${index + 1}: requires text, thread, me, ts.`,
          );
        records.push({
          id: String(r.id ?? `${thread}:${index}`),
          thread: r.thread,
          ts: iso(r.ts),
          text: r.text,
          me: r.me,
        });
      }
    }
  }
  if (!records.length)
    throw new Error(
      `${source.name}: no records parsed. Check format and export folder.`,
    );
  const messages = recordsToMessages(records, source);
  if (!messages.length)
    throw new Error(
      `${source.name}: no messages matched self; check exact sender labels/IDs.`,
    );
  return messages;
}
export function recordsToMessages(
  records: Record[],
  source: Source,
): Message[] {
  const groups = new Map<string, Record[]>();
  for (const r of records) {
    if ((source.excludeThreads ?? []).some((t) => r.thread.includes(t)))
      continue;
    if (!groups.has(r.thread)) groups.set(r.thread, []);
    groups.get(r.thread)!.push(r);
  }
  const out: Message[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.ts.localeCompare(b.ts));
    const seen = new Map<string, number>();
    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const text = r.text.trim();
      if (
        !r.me ||
        !text ||
        /^(?:https?:\/\/\S+\s*)+$/.test(text) ||
        /^(<Media omitted>|image omitted|video omitted|audio omitted)$/i.test(
          text,
        )
      )
        continue;
      const ms = Date.parse(r.ts);
      const last = seen.get(text);
      if (last !== undefined && ms - last <= 60000) continue;
      seen.set(text, ms);
      // Context only for ordered conversations. Slack requires explicit reply
      // linking beyond this importer; Discord supplies only outgoing messages.
      const ctx = ["discord", "slack"].includes(source.format)
        ? undefined
        : group
            .slice(Math.max(0, i - 4), i)
            .filter((p) => ms - Date.parse(p.ts) <= 1800000 && p.text.trim())
            .map((p) => ({
              from: p.me ? ("me" as const) : ("them" as const),
              text: p.text,
            }));
      out.push({
        id: `${source.name}:${hash(`${r.thread}:${r.id}`)}`,
        source: source.name,
        thread: r.thread,
        ts: r.ts,
        text,
        kind: /[\p{L}\p{N}]/u.test(text) ? "text" : "reaction",
        ...(ctx?.length ? { ctx } : {}),
      });
    }
  }
  return out.sort(
    (a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id),
  );
}
