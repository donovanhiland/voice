export const formats = [
  "discord",
  "imessage",
  "whatsapp",
  "slack",
  "telegram",
  "jsonl",
] as const;
export type Format = (typeof formats)[number];
export type Source = {
  name: string;
  format: Format;
  path: string;
  self?: string[];
  timezone?: string;
  dateOrder?: "DMY" | "MDY";
  excludeThreads?: string[];
};
export type Config = {
  name: string;
  timezone: string;
  preferences: string[];
  sources: Source[];
  heldoutPerSource: number;
  maxSkillTokens: number;
};
export type Turn = { from: "me" | "them"; text: string };
export type Message = {
  id: string;
  source: string;
  thread: string;
  ts: string;
  text: string;
  kind: "text" | "reaction";
  ctx?: Turn[];
};
export type Record = {
  id: string;
  thread: string;
  ts: string;
  text: string;
  me: boolean;
};
