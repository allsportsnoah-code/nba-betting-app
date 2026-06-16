import { promises as fs } from "node:fs";
import path from "node:path";

export type TunnelEmailDeliveryMode = "together" | "individual";

export type TunnelEmailSettings = {
  enabled: boolean;
  sendTimeLocal: string;
  sendTimesLocal: string[];
  waitUntilSendTime: boolean;
  deliveryMode: TunnelEmailDeliveryMode;
  recipientEmails: string[];
  recipients: string;
  from: string;
  subject: string;
  bodyTemplate: string;
};

export type TunnelEmailRuntimeStatus = {
  latestUrl: string;
  lastEmailLog: string;
};

const SETTINGS_PATH = path.join(process.cwd(), "config", "tunnel-link-email-settings.json");
const TUNNEL_URL_PATH = path.join(process.cwd(), "logs", "cloudflare-tunnel.url.txt");
const TUNNEL_START_LOG_PATH = path.join(process.cwd(), "logs", "cloudflare-tunnel.start.log");

export const DEFAULT_TUNNEL_EMAIL_BODY = `Betting Lab is up.

MLB board:
{{mlbLink}}

Owner controls:
{{ownerLink}}

Base link:
{{baseLink}}

Sent automatically at {{sentAt}}.`;

function getDefaultSettings(): TunnelEmailSettings {
  const recipientEmails = normalizeRecipientEmails(process.env.TUNNEL_LINK_EMAIL_TO ?? "");

  return {
    enabled: true,
    sendTimeLocal: "09:00",
    sendTimesLocal: ["09:00"],
    waitUntilSendTime: true,
    deliveryMode: "together",
    recipientEmails,
    recipients: recipientEmails.join(", "),
    from: process.env.TUNNEL_LINK_EMAIL_FROM ?? "",
    subject: process.env.TUNNEL_LINK_EMAIL_SUBJECT ?? "Betting Lab link is ready",
    bodyTemplate: DEFAULT_TUNNEL_EMAIL_BODY,
  };
}

function readString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeTime(value: unknown, fallback: string) {
  const text = readString(value, fallback);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalizeTimeList(value: unknown, legacyValue: unknown, fallback: string[]) {
  const candidates: unknown[] = [];

  if (Array.isArray(value)) {
    candidates.push(...value);
  } else if (typeof value === "string") {
    candidates.push(...value.split(/[,\n]/));
  }

  if (candidates.length === 0) {
    candidates.push(legacyValue);
  }

  const times = candidates
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));

  const uniqueTimes = Array.from(new Set(times)).sort((a, b) => a.localeCompare(b)).slice(0, 8);
  return uniqueTimes.length > 0 ? uniqueTimes : fallback;
}

function normalizeDeliveryMode(value: unknown): TunnelEmailDeliveryMode {
  return value === "individual" ? "individual" : "together";
}

function normalizeRecipientEmails(value: unknown, fallback: string[] = []) {
  const candidates: unknown[] = [];

  if (Array.isArray(value)) {
    const rows = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .slice(0, 20);
    return rows.length > 0 ? rows : fallback;
  } else if (typeof value === "string") {
    candidates.push(...value.split(/[,;\n]/));
  }

  const recipients = candidates
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);

  return recipients.length > 0 ? recipients : fallback;
}

export function normalizeTunnelEmailSettings(input: unknown): TunnelEmailSettings {
  const defaults = getDefaultSettings();
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const sendTimesLocal = normalizeTimeList(
    data.sendTimesLocal,
    data.sendTimeLocal,
    defaults.sendTimesLocal
  );
  const recipientEmails = normalizeRecipientEmails(
    data.recipientEmails,
    normalizeRecipientEmails(data.recipients, defaults.recipientEmails)
  );

  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : defaults.enabled,
    sendTimeLocal: normalizeTime(sendTimesLocal[0], defaults.sendTimeLocal),
    sendTimesLocal,
    waitUntilSendTime:
      typeof data.waitUntilSendTime === "boolean" ? data.waitUntilSendTime : defaults.waitUntilSendTime,
    deliveryMode: normalizeDeliveryMode(data.deliveryMode),
    recipientEmails,
    recipients: recipientEmails.map((email) => email.trim()).filter(Boolean).join(", "),
    from: readString(data.from, defaults.from),
    subject: readString(data.subject, defaults.subject),
    bodyTemplate: readString(data.bodyTemplate, defaults.bodyTemplate),
  };
}

export async function readTunnelEmailSettings(): Promise<TunnelEmailSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    return normalizeTunnelEmailSettings(JSON.parse(raw));
  } catch {
    return getDefaultSettings();
  }
}

export async function saveTunnelEmailSettings(input: unknown) {
  const settings = normalizeTunnelEmailSettings(input);
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

export async function readTunnelEmailRuntimeStatus(): Promise<TunnelEmailRuntimeStatus> {
  let latestUrl = "";
  let lastEmailLog = "";

  try {
    latestUrl = (await fs.readFile(TUNNEL_URL_PATH, "utf8")).trim();
  } catch {
    latestUrl = "";
  }

  try {
    const rawLog = await fs.readFile(TUNNEL_START_LOG_PATH, "utf8");
    const emailLines = rawLog
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes("Tunnel link email"));
    lastEmailLog = emailLines[emailLines.length - 1] ?? "";
  } catch {
    lastEmailLog = "";
  }

  return { latestUrl, lastEmailLog };
}
