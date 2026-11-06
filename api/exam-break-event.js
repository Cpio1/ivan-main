// Posts Unscheduled Break events to the Telegram chat that receives start codes.
//
// The site has no login, so there's no session to authenticate here. Instead, the
// request can't carry free text: the message is built on the server from fixed
// templates, the page must be one of the exam's pages, and the name must be
// registered. Someone who knows a registered name could still fake an event, but
// they can't use this endpoint to send arbitrary messages.
const { sendTelegramMessage } = require("./_telegram");

const LOG_PREFIX = "exam-break-event";

// Keep in sync with the name lists in the "/" and "/start" bundles.
// tests/exam-break-event.test.js fails if they differ.
const REGISTERED_NAMES = ["Ivan Ivanov", "Aizhan Assan", "Tomiris Kalimova", "Islam Mursalov"];

const PAGES = ["/test", "/test2", "/test3", "/test4"];

const EVENTS = {
  break_started: { title: "🔴 Ученик поставил экзамен на стоп", timeLabel: "Время остановки" },
  test_resumed: { title: "🟢 Ученик возобновил экзамен", timeLabel: "Время возобновления" }
};

// How far the browser's event time may differ from the server's clock. Requests
// only lag by seconds, so a bigger gap means the device's clock is wrong.
const MAX_CLOCK_DIFFERENCE_MS = 60 * 1000;

// Both limits are per server instance, so they're a best-effort extra layer.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const requestsByIp = new Map();
const seenEventIds = new Map();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (isRateLimited(clientIp(req))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const event = parseEvent(req.body);
  if (!event) {
    return res.status(400).json({ error: "Invalid event" });
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!botToken || !chatId) {
    console.error(LOG_PREFIX + ": missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env var");
    return res.status(500).json({ error: "Telegram delivery not configured" });
  }

  pruneOld(seenEventIds, DEDUPE_WINDOW_MS);
  if (seenEventIds.has(event.eventId)) {
    return res.status(200).json({ ok: true, duplicate: true });
  }
  // Recorded before sending so that a concurrent duplicate can't also send.
  seenEventIds.set(event.eventId, Date.now());

  const result = await sendTelegramMessage(botToken, chatId, buildMessage(event), LOG_PREFIX);
  if (!result.ok) {
    seenEventIds.delete(event.eventId);
    return res.status(502).json({ error: "Failed to send notification" });
  }

  return res.status(200).json({ ok: true });
};

function parseEvent(rawBody) {
  const body = typeof rawBody === "string" ? safeParse(rawBody) : rawBody;
  if (!body || typeof body !== "object") return null;

  const template = Object.prototype.hasOwnProperty.call(EVENTS, body.event) ? EVENTS[body.event] : null;
  if (!template || !PAGES.includes(body.page)) return null;

  if (typeof body.eventId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.eventId)) return null;

  const firstName = cleanName(body.firstName);
  const lastName = cleanName(body.lastName);
  if (!isRegistered(firstName, lastName)) return null;

  return { template, firstName, lastName, occurredAt: eventTime(body.occurredAt), eventId: body.eventId };
}

// The moment the student clicked, so that a slow request doesn't shift the time.
function eventTime(occurredAt) {
  const now = Date.now();
  if (!Number.isFinite(occurredAt) || Math.abs(now - occurredAt) > MAX_CLOCK_DIFFERENCE_MS) return now;
  return occurredAt;
}

function buildMessage(event) {
  return [
    event.template.title,
    "",
    "👤 " + event.firstName + " " + event.lastName,
    "",
    "🕒 " + event.template.timeLabel + ": " + almatyTime(event.occurredAt)
  ].join("\n");
}

function almatyTime(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(timestamp);
}

function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

// Same comparison as the name check on the site's login page.
function isRegistered(firstName, lastName) {
  if (!firstName || !lastName) return false;
  const name = (firstName + " " + lastName).toLowerCase();
  return REGISTERED_NAMES.some((registered) => registered.toLowerCase() === name);
}

function isSameOrigin(req) {
  const headers = req.headers || {};
  const host = headers["x-forwarded-host"] || headers.host;
  if (!headers.origin || !host) return false;
  try {
    return new URL(headers.origin).host === host;
  } catch {
    return false;
  }
}

function clientIp(req) {
  const forwarded = (req.headers && req.headers["x-forwarded-for"]) || "";
  return String(forwarded).split(",")[0].trim() || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  for (const [key, entry] of requestsByIp) {
    if (now - entry.start > RATE_WINDOW_MS) requestsByIp.delete(key);
  }
  const entry = requestsByIp.get(ip) || { start: now, count: 0 };
  entry.count += 1;
  requestsByIp.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

function pruneOld(map, maxAge) {
  const now = Date.now();
  for (const [key, time] of map) {
    if (now - time > maxAge) map.delete(key);
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
