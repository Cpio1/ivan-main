// Run with: node --test tests/exam-break-event.test.js
// Telegram is mocked via global fetch; no real messages are sent.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("../api/exam-break-event.js");

const TOKEN = "123456:TEST-TOKEN-should-never-be-logged";
const CHAT_ID = "-1001234567890";
let nextId = 0;
let nextIp = 0;

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

function validBody(overrides) {
  nextId += 1;
  return {
    event: "break_started",
    page: "/test",
    firstName: "Ivan",
    lastName: "Ivanov",
    secondsLeft: 1912,
    eventId: "event-id-" + nextId,
    ...overrides
  };
}

// A new IP per request by default, so that rate limiting only affects its own test.
function post(body, headers) {
  nextIp += 1;
  return {
    method: "POST",
    body,
    headers: { host: "site.example", origin: "https://site.example", "x-forwarded-for": "10.0.0." + nextIp, ...headers }
  };
}

const telegramOk = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });

function setup(t, fetchImpl) {
  const saved = { fetch: global.fetch, token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID, error: console.error };
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_CHAT_ID = CHAT_ID;
  const calls = [];
  const logs = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return (fetchImpl || telegramOk)(url, opts); };
  console.error = (...args) => logs.push(args.map(String).join(" "));
  t.after(() => {
    global.fetch = saved.fetch;
    console.error = saved.error;
    for (const [k, v] of [["TELEGRAM_BOT_TOKEN", saved.token], ["TELEGRAM_CHAT_ID", saved.chat]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  return { calls, logs };
}

const sentText = (call) => JSON.parse(call.opts.body).text;

test("stop message has exactly the requested format, in Almaty time", async (t) => {
  const { calls } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 0, 15, 9, 22, 31) });
  const res = mockRes();
  await handler(post(validBody()), res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].url, "https://api.telegram.org/bot" + TOKEN + "/sendMessage");
  assert.equal(JSON.parse(calls[0].opts.body).chat_id, CHAT_ID);
  assert.equal(sentText(calls[0]), "🔴 Ученик поставил экзамен на стоп\n\n👤 Ivan Ivanov\n\n🕒 Время остановки: 14:22:31");
});

test("resume message has exactly the requested format on every exam page", async (t) => {
  const { calls } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 0, 15, 9, 27, 15) });
  for (const page of ["/test", "/test2", "/test3", "/test4"]) {
    await handler(post(validBody({ event: "test_resumed", page, secondsLeft: 65 })), mockRes());
    assert.equal(sentText(calls[calls.length - 1]), "🟢 Ученик возобновил экзамен\n\n👤 Ivan Ivanov\n\n🕒 Время возобновления: 14:27:15");
  }
});

test("just after midnight in Almaty shows 00, not 24", async (t) => {
  const { calls } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 0, 15, 19, 0, 5) });
  await handler(post(validBody()), mockRes());
  assert.match(sentText(calls[0]), /Время остановки: 00:00:05$/);
});

test("name check is case-insensitive like the login page, and shows the name as entered", async (t) => {
  const { calls } = setup(t);
  const res = mockRes();
  await handler(post(validBody({ firstName: " aizhan ", lastName: "ASSAN" })), res);
  assert.equal(res.statusCode, 200);
  assert.ok(sentText(calls[0]).includes("\n👤 aizhan ASSAN\n"));
});

test("invalid input is rejected without calling Telegram", async (t) => {
  const { calls } = setup(t);
  const bad = [
    { event: "custom" },
    { event: "__proto__" },
    { event: undefined },
    { page: "/start" },
    { page: "constructor" },
    { firstName: "Nobody" },
    { firstName: "Ivan\n\nFAKE MESSAGE" },
    { firstName: undefined },
    { lastName: 42 },
    { secondsLeft: -1 },
    { secondsLeft: 1921 },
    { secondsLeft: 12.5 },
    { secondsLeft: "100" },
    { eventId: "short" },
    { eventId: "bad id with spaces" },
    { eventId: undefined }
  ];
  for (const overrides of bad) {
    const res = mockRes();
    await handler(post(validBody(overrides)), res);
    assert.equal(res.statusCode, 400, JSON.stringify(overrides));
  }
  for (const body of ["not json", null, "[]"]) {
    const res = mockRes();
    await handler(post(body), res);
    assert.equal(res.statusCode, 400, String(body));
  }
  assert.equal(calls.length, 0);
});

test("extra fields can't add text to the message", async (t) => {
  const { calls } = setup(t);
  await handler(post(validBody({ text: "INJECTED", message: "INJECTED", section: "INJECTED", status: "INJECTED" })), mockRes());
  assert.doesNotMatch(sentText(calls[0]), /INJECTED/);
});

test("accepts a JSON string body", async (t) => {
  const { calls } = setup(t);
  const res = mockRes();
  await handler(post(JSON.stringify(validBody())), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
});

test("wrong method and other origins are rejected without calling Telegram", async (t) => {
  const { calls } = setup(t);
  const get = mockRes();
  await handler({ method: "GET", headers: {} }, get);
  assert.equal(get.statusCode, 405);
  for (const origin of ["https://evil.example", undefined, "not a url"]) {
    const res = mockRes();
    await handler(post(validBody(), { origin }), res);
    assert.equal(res.statusCode, 403, String(origin));
  }
  assert.equal(calls.length, 0);
});

test("the same event id is only sent once, including concurrent requests", async (t) => {
  const { calls } = setup(t);
  const body = validBody();
  const first = mockRes();
  const second = mockRes();
  await Promise.all([handler(post(body), first), handler(post(body), second)]);
  const third = mockRes();
  await handler(post(body), third);
  assert.equal(calls.length, 1);
  assert.deepEqual([first.statusCode, second.statusCode, third.statusCode], [200, 200, 200]);
  await handler(post(validBody()), mockRes());
  assert.equal(calls.length, 2, "a new event must be sent");
});

test("rate limit applies per client", async (t) => {
  const { calls } = setup(t);
  const headers = { "x-forwarded-for": "203.0.113.9" };
  const statuses = [];
  for (let i = 0; i < 32; i += 1) {
    const res = mockRes();
    await handler(post(validBody(), headers), res);
    statuses.push(res.statusCode);
  }
  assert.equal(statuses.filter((s) => s === 200).length, 30);
  assert.deepEqual(statuses.slice(30), [429, 429]);
  assert.equal(calls.length, 30);
});

test("Telegram failures return 502 and never log the token", async (t) => {
  const failures = [
    () => new Response(JSON.stringify({ ok: false, description: "Forbidden" }), { status: 403 }),
    () => { throw new TypeError("fetch failed for https://api.telegram.org/bot" + TOKEN + "/sendMessage"); }
  ];
  for (const failure of failures) {
    const { logs } = setup(t, failure);
    const res = mockRes();
    await handler(post(validBody()), res);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { error: "Failed to send notification" });
    assert.ok(logs.length > 0);
    assert.ok(logs.every((line) => !line.includes(TOKEN)));
    assert.ok(logs.every((line) => line.startsWith("exam-break-event:")));
  }
});

test("an event that failed to send can be retried", async (t) => {
  let fail = true;
  const { calls } = setup(t, () => (fail ? new Response("{}", { status: 500 }) : telegramOk()));
  const body = validBody();
  await handler(post(body), mockRes());
  fail = false;
  const res = mockRes();
  await handler(post(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, undefined);
  assert.equal(calls.length, 2);
});

test("missing env vars return 500 without calling Telegram", async (t) => {
  const { calls } = setup(t);
  delete process.env.TELEGRAM_BOT_TOKEN;
  const res = mockRes();
  await handler(post(validBody()), res);
  assert.equal(res.statusCode, 500);
  assert.equal(calls.length, 0);
});

test("registered names match the login and start code bundles", () => {
  const root = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "api/exam-break-event.js"), "utf8");
  const listIn = (text) => JSON.parse(text.match(/\[\s*"Ivan[^\]]*\]/)[0].replace(/\s+/g, " "));
  const serverNames = listIn(source);
  for (const bundle of ["_next/static/chunks/app/page-f97c4b30b39a8ed5.js", "_next/static/chunks/app/start/page-691286c07902a63a.js"]) {
    assert.deepEqual(listIn(fs.readFileSync(path.join(root, bundle), "utf8")), serverNames, bundle);
  }
});
