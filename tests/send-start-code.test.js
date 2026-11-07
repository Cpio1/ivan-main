// Run with: node --test tests/send-start-code.test.js
// Telegram is mocked via global fetch; no real messages are sent.
const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/send-start-code.js");

const TOKEN = "123456:TEST-TOKEN-should-never-be-logged";
const CHAT_ID = "-1001234567890";
const VALID_CODES = "007123 000000 424242";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

function captureConsole() {
  const lines = [];
  const orig = console.error;
  console.error = (...args) => lines.push(args.map(String).join(" "));
  return { lines, restore: () => { console.error = orig; } };
}

function setup(t, fetchImpl) {
  const saved = {
    fetch: global.fetch,
    token: process.env.TELEGRAM_BOT_TOKEN,
    chat: process.env.TELEGRAM_CHAT_ID,
    codes: process.env.START_ACCESS_CODES
  };
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_CHAT_ID = CHAT_ID;
  process.env.START_ACCESS_CODES = VALID_CODES;
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return fetchImpl(url, opts); };
  const log = captureConsole();
  t.after(() => {
    global.fetch = saved.fetch;
    log.restore();
    for (const [k, v] of [
      ["TELEGRAM_BOT_TOKEN", saved.token],
      ["TELEGRAM_CHAT_ID", saved.chat],
      ["START_ACCESS_CODES", saved.codes]
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  return { calls, log };
}

const jsonResponse = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const post = (body) => ({ method: "POST", body });

test("valid code sends the code and the student's name to Telegram, but isn't echoed to the browser", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true, result: {} }));
  const res = mockRes();
  await handler(post({ code: "007123", firstName: "Ivan", lastName: "Ivanov" }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, valid: true, notified: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.telegram.org/bot" + TOKEN + "/sendMessage");
  assert.ok(calls[0].opts.signal, "request must have an abort signal (timeout)");
  const payload = JSON.parse(calls[0].opts.body);
  assert.equal(payload.chat_id, CHAT_ID);
  assert.match(payload.text, /successful entry/);
  assert.match(payload.text, /Student: Ivan Ivanov/);
  assert.match(payload.text, /Test: Bluebook SAT/);
  assert.match(payload.text, /Code: 007123/);
  assert.ok(!JSON.stringify(res.body).includes("007123"), "code must not be echoed to the browser");
});

test("wrong (but well-formed) code returns valid:false and sends nothing to Telegram", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true }));
  const res = mockRes();
  await handler(post({ code: "999999", firstName: "Ivan", lastName: "Ivanov" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, valid: false });
  assert.equal(calls.length, 0);
});

test("a repeat entry by the same student sends its own code to Telegram", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true }));
  const first = mockRes();
  await handler(post({ code: "000000", firstName: "Repeat", lastName: "Student" }), first);
  assert.deepEqual(first.body, { ok: true, valid: true, notified: true });

  const second = mockRes();
  await handler(post({ code: "424242", firstName: "Repeat", lastName: "Student" }), second);
  assert.deepEqual(second.body, { ok: true, valid: true, notified: true });

  assert.equal(calls.length, 2);
  assert.match(JSON.parse(calls[0].opts.body).text, /Code: 000000/);
  assert.match(JSON.parse(calls[1].opts.body).text, /Code: 424242/);
});

test("accepts a JSON string body", async (t) => {
  setup(t, () => jsonResponse(200, { ok: true }));
  const res = mockRes();
  await handler(post(JSON.stringify({ code: "424242", firstName: "Json", lastName: "Body" })), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
});

test("with no allowlist configured, any well-formed 6-digit code is accepted and notifies", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true }));
  delete process.env.START_ACCESS_CODES;
  const res = mockRes();
  await handler(post({ code: "999999", firstName: "Any", lastName: "Code" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, valid: true, notified: true });
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].opts.body);
  assert.match(payload.text, /Code: 999999/);
});

test("valid code but missing Telegram env -> valid:true, notified:false, no Telegram call", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true }));
  delete process.env.TELEGRAM_CHAT_ID;
  const res = mockRes();
  await handler(post({ code: "424242", firstName: "No", lastName: "Config" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, valid: true, notified: false });
  assert.equal(calls.length, 0);
});

test("Telegram HTTP error on a valid code -> valid:true/notified:false, no token or code in logs", async (t) => {
  const { log } = setup(t, () => jsonResponse(403, { ok: false, error_code: 403, description: "Forbidden: bot is not a member of the channel chat" }));
  const res = mockRes();
  await handler(post({ code: "007123", firstName: "Http", lastName: "Error" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.notified, false);
  const out = log.lines.join("\n");
  assert.match(out, /403/);
  assert.ok(!out.includes(TOKEN) && !out.includes("TEST-TOKEN") && !out.includes("007123"));
});

test("non-JSON Telegram response on a valid code -> notified:false", async (t) => {
  setup(t, () => new Response("<html>bad gateway</html>", { status: 200 }));
  const res = mockRes();
  await handler(post({ code: "424242", firstName: "Non", lastName: "Json" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notified, false);
});

test("network error whose message contains the URL is not logged verbatim", async (t) => {
  const { log } = setup(t, (url) => { throw new TypeError("fetch failed for " + url); });
  const res = mockRes();
  await handler(post({ code: "007123", firstName: "Net", lastName: "Err" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notified, false);
  assert.ok(!log.lines.join("\n").includes(TOKEN));
});

test("timeout aborts the request -> notified:false", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setup(t, (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  const res = mockRes();
  const pending = handler(post({ code: "000000", firstName: "Time", lastName: "Out" }), res);
  await Promise.resolve();
  t.mock.timers.tick(8000);
  await pending;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notified, false);
});

test("invalid code format and wrong method are rejected without calling Telegram", async (t) => {
  const { calls } = setup(t, () => jsonResponse(200, { ok: true }));
  for (const code of ["12345", "1234567", "12a456", 123456, undefined]) {
    const res = mockRes();
    await handler(post({ code }), res);
    assert.equal(res.statusCode, 400, "code=" + code);
  }
  const res = mockRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});
