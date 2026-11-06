// Shared Telegram sender. The leading underscore keeps Vercel from exposing this
// file as an API route.
const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 8000;

async function sendTelegramMessage(botToken, chatId, text, logPrefix) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(TELEGRAM_API_BASE + "/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.ok !== true) {
      // Telegram's description never contains the token or the message text.
      const description = data && typeof data.description === "string" ? data.description : "no description";
      console.error(logPrefix + ": Telegram API error", response.status, description);
      return { ok: false };
    }

    return { ok: true };
  } catch (err) {
    // Log only the error kind: fetch errors can carry the request URL, which contains the token.
    const reason = err && err.name === "AbortError" ? "timeout" : (err && err.name) || "unknown";
    console.error(logPrefix + ": Telegram request failed:", reason);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendTelegramMessage };
