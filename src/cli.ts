import { readFile, access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { importSource } from "./import";
import {
  build,
  split,
  jsonl,
  save,
  readJsonl,
  prepareEval,
  writerInputs,
  score,
  normalized,
} from "./pipeline";
import { formats, type Config, type Message } from "./types";

export async function loadConfig(root: string): Promise<Config> {
  const c = JSON.parse(await readFile(join(root, "voice.config.json"), "utf8"));
  if (
    typeof c.name !== "string" ||
    !c.name.trim() ||
    typeof c.timezone !== "string" ||
    !Array.isArray(c.preferences) ||
    c.preferences.some((p: unknown) => typeof p !== "string") ||
    !Array.isArray(c.sources) ||
    !c.sources.length
  )
    throw new Error(
      "Config requires name, timezone, preferences array, and at least one source.",
    );
  new Intl.DateTimeFormat("en-US", { timeZone: c.timezone });
  if (
    !Number.isInteger(c.heldoutPerSource) ||
    c.heldoutPerSource < 1 ||
    !Number.isInteger(c.maxSkillTokens) ||
    c.maxSkillTokens < 500
  )
    throw new Error(
      "heldoutPerSource must be a positive integer; maxSkillTokens must be at least 500.",
    );
  const seen = new Set<string>();
  for (const s of c.sources) {
    if (
      typeof s.name !== "string" ||
      !s.name.trim() ||
      seen.has(s.name) ||
      !formats.includes(s.format) ||
      typeof s.path !== "string" ||
      !s.path.trim()
    )
      throw new Error(
        "Sources need unique names, a supported format, and an export folder path.",
      );
    if (
      s.self !== undefined &&
      (!Array.isArray(s.self) ||
        s.self.some((v: unknown) => typeof v !== "string"))
    )
      throw new Error("Source self must be an array of sender names/IDs.");
    if (
      s.excludeThreads !== undefined &&
      (!Array.isArray(s.excludeThreads) ||
        s.excludeThreads.some((v: unknown) => typeof v !== "string"))
    )
      throw new Error("excludeThreads must be an array of strings.");
    if (s.dateOrder !== undefined && !["DMY", "MDY"].includes(s.dateOrder))
      throw new Error("dateOrder must be DMY or MDY.");
    if (s.timezone) new Intl.DateTimeFormat("en-US", { timeZone: s.timezone });
    seen.add(s.name);
    s.path = resolve(root, s.path);
  }
  return c;
}
async function init(root: string) {
  try {
    await access(join(root, "voice.config.json"));
    console.log("Config already exists; left intact.");
    return;
  } catch {}
  await save(
    join(root, "voice.config.json"),
    await readFile(
      join(import.meta.dir, "../voice.config.example.json"),
      "utf8",
    ),
  );
  await mkdir(join(root, "data/raw"), { recursive: true });
  console.log(
    "Created voice.config.json. Set name, timezone, sources, sender IDs, and preferences before ingest.",
  );
}
export async function ingest(root: string, config: Config) {
  const all: Message[] = [];
  const report: unknown[] = [];
  for (const source of config.sources) {
    const rows = await importSource(source, config.timezone);
    all.push(...rows);
    report.push({
      source: source.name,
      count: rows.length,
      text: rows.filter((m) => m.kind === "text").length,
      reactions: rows.filter((m) => m.kind === "reaction").length,
      withContext: rows.filter((m) => m.ctx?.length).length,
      first: rows[0].ts,
      last: rows[rows.length - 1].ts,
      threads: new Set(rows.map((m) => m.thread)).size,
    });
  }
  const ids = new Set(all.map((m) => m.id));
  if (ids.size !== all.length)
    throw new Error(
      "Duplicate IDs across imported files. Inspect overlapping exports before proceeding.",
    );
  const { corpus, heldout } = split(all, config.heldoutPerSource);
  await save(join(root, "data/corpus.jsonl"), jsonl(corpus));
  await save(join(root, "data/eval/heldout.jsonl"), jsonl(heldout));
  await save(
    join(root, "data/import-report.json"),
    JSON.stringify(
      { sources: report, corpus: corpus.length, heldout: heldout.length },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      { sources: report, corpus: corpus.length, heldout: heldout.length },
      null,
      2,
    ),
  );
  if (corpus.length < 100)
    console.log(
      "Small corpus: inspect examples carefully; this is enough to experiment, not a stable measurement.",
    );
}
async function budget(root: string) {
  const held = await readJsonl<Message>(join(root, "data/eval/heldout.jsonl"));
  const corpus = await readJsonl<Message>(join(root, "data/corpus.jsonl"));
  const words = new Set(corpus.map((m) => normalized(m.text)));
  if (held.some((m) => words.has(normalized(m.text))))
    throw new Error("Heldout text leaks into corpus.");
  const paths = [
    "SKILL.md",
    "references/preferences.md",
    "references/style-card.md",
    "references/exemplars.md",
  ];
  const texts = await Promise.all(
    paths.map((p) => readFile(join(root, "output/voice", p), "utf8")),
  );
  // Examples are JSON string literals, allowing exact multiline checks.
  const examples = texts[3]
    .split("\n")
    .filter((l) => l.startsWith("Sample: "))
    .map((l) => JSON.parse(l.slice(8)) as string);
  const holdTexts = new Set(held.map((m) => normalized(m.text)));
  if (examples.some((e) => holdTexts.has(normalized(e))))
    throw new Error("Heldout exemplar leak.");
  const tokens = Math.ceil(texts.join("").length / 4);
  const config = await loadConfig(root);
  if (tokens > config.maxSkillTokens)
    throw new Error(
      `Estimated ${tokens} tokens exceeds ${config.maxSkillTokens}.`,
    );
  console.log(
    `Approximate token count: ${tokens}/${config.maxSkillTokens}. Exact heldout overlap checks passed. Token estimate uses characters/4, not a model tokenizer.`,
  );
}
export async function main(args: string[]) {
  const root = process.cwd();
  const [command, ...rest] = args;
  if (command === "init") return init(root);
  if (command === "demo") {
    const dir = join(root, "data/demo");
    await mkdir(dir, { recursive: true });
    const config: Config = {
      name: "Example Writer",
      timezone: "UTC",
      preferences: ["Use plain text unless asked for formatting."],
      sources: [
        { name: "sample", format: "jsonl", path: join(root, "examples") },
      ],
      heldoutPerSource: 5,
      maxSkillTokens: 2600,
    };
    await save(join(dir, "voice.config.json"), JSON.stringify(config, null, 2));
    await ingest(dir, config);
    console.log(
      await build(
        dir,
        config,
        await readJsonl<Message>(join(dir, "data/corpus.jsonl")),
      ),
    );
    console.log(`Synthetic demo skill: ${dir}/output/voice`);
    return;
  }
  if (command === "eval") {
    const [action, run] = rest;
    if (!run || !/^[\w-]+$/.test(run))
      throw new Error("Use eval prepare|inputs|score RUN_NAME.");
    const dir = join(root, "data/eval/runs", run);
    if (action === "prepare")
      console.log(
        await prepareEval(
          root,
          run,
          await readJsonl<Message>(join(root, "data/eval/heldout.jsonl")),
        ),
      );
    else if (action === "inputs") {
      await writerInputs(dir);
      console.log(`Writer inputs ready: ${dir}/inputs.jsonl`);
    } else if (action === "score") {
      await score(dir);
      console.log(
        `Saved ${dir}/report.json and review.jsonl. Human review is still required.`,
      );
    } else throw new Error("Unknown eval action.");
    return;
  }
  if (command === "doctor") {
    console.log(`Bun ${Bun.version}`);
    const config = await loadConfig(root);
    for (const s of config.sources) {
      await access(s.path);
      console.log(`${s.name}: ${s.format} export folder accessible`);
    }
    console.log(
      "No model runner is required. Use your chosen agent for brief/draft generation; read docs/evaluation.md before doing so.",
    );
    return;
  }
  if (command === "ingest") return ingest(root, await loadConfig(root));
  if (command === "build") {
    console.log(
      await build(
        root,
        await loadConfig(root),
        await readJsonl<Message>(join(root, "data/corpus.jsonl")),
      ),
    );
    return;
  }
  if (command === "budget") return budget(root);
  console.log(
    "Usage: bun run voice init|doctor|ingest|build|budget|eval prepare|inputs|score RUN_NAME\nSynthetic demo: bun run demo",
  );
}
if (import.meta.main)
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
