import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  localIso,
  parseImessage,
  parseWhatsapp,
  recordsToMessages,
  importSource,
} from "../src/import";
import {
  split,
  normalized,
  build,
  prepareEval,
  writerInputs,
  score,
  save,
  jsonl,
} from "../src/pipeline";
import type { Config, Message, Source } from "../src/types";
const source: Source = {
  name: "chat",
  format: "imessage",
  path: "unused",
  self: ["Me"],
};
test("iMessage preserves paragraphs, nested sender identity, edits and reactions", () => {
  const rows = parseImessage(
    "Jan 02, 2025  1:00:00 PM\nSomeone\nA question\n\nJan 02, 2025  1:01:00 PM\nMe\nFirst paragraph\n\nSecond paragraph\n\n    Jan 02, 2025  1:02:00 PM\n    Someone\n    Nested reply\n\nJan 02, 2025  1:03:00 PM\nMe\nOld text\nEdited 1 minute later: New text\nTapbacks:\n    Liked by Someone\nAttachment missing!\n\nJan 02, 2025  1:04:00 PM\nMe\n😂",
    "thread",
    ["Me"],
    "UTC",
  );
  const out = recordsToMessages(rows, source);
  expect(out).toHaveLength(3);
  expect(out[0].text).toBe("First paragraph\n\nSecond paragraph");
  expect(out[1].text).toBe("New text");
  expect(out[1].ctx?.at(-1)?.text).toBe("Nested reply");
  expect(out[2].kind).toBe("reaction");
});
test("dedupe removes only near repeats in the same thread", () => {
  const out = recordsToMessages(
    [0, 10, 120].map((s, i) => ({
      id: String(i),
      thread: "a",
      ts: new Date(s * 1000).toISOString(),
      text: "Ya",
      me: true,
    })),
    source,
  );
  expect(out).toHaveLength(2);
});
test("WhatsApp requires configured date order and keeps multiline messages", () => {
  const rows = parseWhatsapp(
    "[02/03/2025, 13:04:00] Alex: First\nSecond\n[02/03/2025, 13:05:00] Sam: reply\n[02/03/2025, 13:06:00] Alex: 👍",
    "a",
    ["Alex"],
    "UTC",
    "DMY",
  );
  expect(rows[0].ts).toBe("2025-03-02T13:04:00.000Z");
  expect(rows[0].text).toBe("First\nSecond");
  expect(rows[1].me).toBe(false);
});
test("local timestamps handle zones and reject ambiguous DST", () => {
  expect(localIso(2025, 1, 2, 12, 0, 0, "America/New_York")).toBe(
    "2025-01-02T17:00:00.000Z",
  );
  expect(() => localIso(2025, 11, 2, 1, 30, 0, "America/New_York")).toThrow(
    "ambiguous",
  );
  expect(() => localIso(2025, 3, 9, 2, 30, 0, "America/New_York")).toThrow(
    "ambiguous",
  );
});
function samples(): Message[] {
  return Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    source: "sample",
    thread: `t${i % 10}`,
    ts: new Date(1735800000000 + i * 120000).toISOString(),
    text: `Please bring ${i} notebooks`,
    kind: "text" as const,
    ctx: [{ from: "them" as const, text: "Are you free?" }],
  }));
}
test("heldout split is deterministic, keeps repeated phrases, and removes context leaks", () => {
  const rows = samples();
  rows.push({ ...rows[0], id: "dup", ts: "2025-02-01T00:00:00Z" });
  const a = split(rows, 10),
    b = split(rows, 10);
  expect(a).toEqual(b);
  expect(a.heldout).toHaveLength(10);
  expect(a.heldout.some((m) => m.text === rows[0].text)).toBe(false);
  const h = new Set(a.heldout.map((m) => normalized(m.text)));
  expect(a.corpus.some((m) => h.has(normalized(m.text)))).toBe(false);
  const contaminated = rows.map((m) => ({
    ...m,
    ctx: [{ from: "them" as const, text: a.heldout[0].text }],
  }));
  expect(split(contaminated, 10).corpus.every((m) => m.ctx?.length === 0)).toBe(
    true,
  );
});
test("build and eval freeze inputs, exclude expected wording, and require complete variants", async () => {
  const root = await mkdtemp(join(tmpdir(), "voice-test-"));
  try {
    const config: Config = {
      name: "Alex",
      timezone: "UTC",
      preferences: ["Occasional italics, never bold."],
      sources: [],
      heldoutPerSource: 10,
      maxSkillTokens: 2600,
    };
    const { corpus, heldout } = split(samples(), 10);
    const manifest = await build(root, config, corpus);
    expect(manifest.estimatedTokens).toBeLessThanOrEqual(2600);
    const skill = await readFile(join(root, "output/voice/SKILL.md"), "utf8");
    expect(skill).not.toContain("Donovan");
    const dir = await prepareEval(root, "first", heldout);
    await expect(prepareEval(root, "first", heldout)).rejects.toThrow("exists");
    await save(
      join(dir, "briefs.jsonl"),
      jsonl(
        heldout.map((m) => ({
          id: m.id,
          brief: `Ask them to bring ${m.text.match(/\d+/)![0]} notebooks.`,
        })),
      ),
    );
    await writerInputs(dir);
    expect(await readFile(join(dir, "inputs.jsonl"), "utf8")).not.toContain(
      '"expected"',
    );
    await save(
      join(dir, "briefs.jsonl"),
      jsonl(
        heldout.map((m) => ({
          id: m.id,
          brief: `A different request for ${m.id}.`,
        })),
      ),
    );
    await expect(writerInputs(dir)).rejects.toThrow("frozen");
    await save(
      join(dir, "runner.json"),
      JSON.stringify({
        model: "synthetic",
        hooks: "none",
        contexts: "fixture",
      }),
    );
    await save(
      join(dir, "drafts.jsonl"),
      jsonl(
        heldout.map((m) => ({ id: m.id, variant: "skill", output: m.text })),
      ),
    );
    await expect(score(dir)).rejects.toThrow("Missing baseline");
    await save(
      join(dir, "drafts.jsonl"),
      jsonl(
        heldout.flatMap((m) =>
          ["skill", "baseline"].map((variant) => ({
            id: m.id,
            variant,
            output: m.text,
          })),
        ),
      ),
    );
    await score(dir);
    expect(
      JSON.parse(await readFile(join(dir, "report.json"), "utf8")).sources
        .sample.sampleSize,
    ).toBe(10);
    await save(join(dir, "review.jsonl"), "human feedback\n");
    await score(dir);
    expect(await readFile(join(dir, "review.jsonl"), "utf8")).toBe(
      "human feedback\n",
    );
    await save(join(dir, "inputs.jsonl"), "changed\n");
    await expect(score(dir)).rejects.toThrow("changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Discord, Slack and Telegram filter source authors correctly", async () => {
  const root = await mkdtemp(join(tmpdir(), "voice-import-"));
  try {
    await save(
      join(root, "discord/c1/messages.json"),
      JSON.stringify([
        { ID: "1", Timestamp: "2025-01-02 12:00:00", Contents: "hi <@123>" },
      ]),
    );
    expect(
      (
        await importSource(
          { name: "d", format: "discord", path: join(root, "discord") },
          "UTC",
        )
      )[0].text,
    ).toBe("hi @user");
    await save(
      join(root, "slack/general/2025-01-02.json"),
      JSON.stringify([
        { type: "message", user: "U1", ts: "1735819200", text: "My text" },
        { type: "message", user: "U2", ts: "1735819201", text: "Their text" },
        { type: "message", bot_id: "B1", ts: "1735819202", text: "bot" },
      ]),
    );
    expect(
      await importSource(
        { name: "s", format: "slack", path: join(root, "slack"), self: ["U1"] },
        "UTC",
      ),
    ).toHaveLength(1);
    await save(
      join(root, "telegram/result.json"),
      JSON.stringify({
        chats: {
          list: [
            {
              id: 1,
              messages: [
                {
                  id: 1,
                  type: "message",
                  from_id: "user1",
                  date_unixtime: "1735819200",
                  text: ["Hi ", { type: "bold", text: "there" }],
                },
                {
                  id: 2,
                  type: "message",
                  from_id: "user2",
                  date_unixtime: "1735819201",
                  text: "other",
                },
              ],
            },
          ],
        },
      }),
    );
    expect(
      (
        await importSource(
          {
            name: "t",
            format: "telegram",
            path: join(root, "telegram"),
            self: ["user1"],
          },
          "UTC",
        )
      )[0].text,
    ).toBe("Hi there");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
