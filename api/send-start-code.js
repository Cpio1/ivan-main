const { sendTelegramMessage } = require("./_telegram");

const TEST_NAME = "Bluebook SAT";

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

  const firstName = sanitizeName(body && body.firstName);
  const lastName = sanitizeName(body && body.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();

  if (!botToken || !chatId) {
    console.error("send-start-code: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env var");
    return res.status(500).json({ error: "Telegram delivery not configured" });
  }

  const text =
    "Bluebook Start Code\n\n" +
    "Code: " + code + "\n" +
    "Test: " + TEST_NAME + "\n" +
    "Student: " + fullName + "\n" +
    "Date/Time: " + new Date().toISOString();

  const result = await sendTelegramMessage(botToken, chatId, text, "send-start-code");

  if (!result.ok) {
    return res.status(502).json({ error: "Failed to send start code to Telegram" });
  }

  return res.status(200).json({ ok: true });
};

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
