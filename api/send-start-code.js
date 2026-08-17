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

  const apiKey = process.env.RESEND_API_KEY;
  const recipientsRaw = process.env.START_CODE_EMAIL_TO;

  if (!apiKey || !recipientsRaw) {
    console.error("send-start-code: missing RESEND_API_KEY or START_CODE_EMAIL_TO env var");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const recipients = recipientsRaw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.error("send-start-code: START_CODE_EMAIL_TO produced no valid recipients");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const timestamp = new Date().toISOString();

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Bluebook <onboarding@resend.dev>",
        to: recipients,
        subject: "Bluebook Start Code",
        text: "Start Code: " + code + "\nDate/Time: " + timestamp
      })
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text().catch(() => "");
      console.error("send-start-code: Resend API error", resendResponse.status, errorText);
      return res.status(502).json({ error: "Failed to send email" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-start-code: unexpected error sending email", err);
    return res.status(502).json({ error: "Failed to send email" });
  }
};

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
