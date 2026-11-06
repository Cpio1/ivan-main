/**
 * Unscheduled Break for /test, /test2, /test3 and /test4.
 *
 * The screens are drawn over the exam, which stays mounted underneath. React
 * therefore keeps its answers, current question, flags and timer, and when the
 * module's time runs out its usual redirect happens as normal.
 *
 * The test bundles provide two things:
 * - window.__examSecondsLeft: the exam timer's current value. It's only read here;
 *   this file has no countdown of its own.
 * - The "Unscheduled Break" item in the More menu, which calls
 *   window.__openUnscheduledBreak().
 *
 * Telegram notifications go through /api/exam-break-event and never block the
 * break: if a request fails, the student isn't told and the exam carries on.
 */
(function () {
  "use strict";

  var PAGES = {
    "/test": { section: "Section 1:", name: "Reading and Writing" },
    "/test2": { section: "Section 1:", name: "Reading and Writing" },
    "/test3": { section: "Section 2:", name: "Math" },
    "/test4": { section: "Section 2:", name: "Math" }
  };
  var ACTIVE_BREAK_KEY = "examBreakActive";

  var CSS =
    ".ub-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;" +
    "padding:16px;background:rgba(0,0,0,.7);color:#1e1e1e;font-size:16px;line-height:1.5}" +
    ".ub-modal{position:relative;width:745px;max-width:100%;max-height:100%;overflow-y:auto;padding:26px;border-radius:6px;background:#fff}" +
    ".ub-modal:focus{outline:none}" +
    ".ub-modal h2{margin:0 36px 20px 0;font-size:24px;font-weight:700;line-height:1.3}" +
    ".ub-close{position:absolute;top:18px;right:18px;display:flex;align-items:center;justify-content:center;width:32px;height:32px;" +
    "padding:0;border:0;border-radius:50%;background:none;color:#1e1e1e;font-size:24px;line-height:1;cursor:pointer}" +
    ".ub-close:hover{background:#f0f0f0}" +
    ".ub-check{display:flex;align-items:flex-start;gap:12px;font-weight:700;cursor:pointer}" +
    ".ub-check input{flex:none;width:22px;height:22px;margin:1px 0 0;accent-color:#324dc7;cursor:pointer}" +
    ".ub-laptop{margin:16px 0 0}" +
    ".ub-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:26px}" +
    ".ub-pill{min-height:44px;padding:9px 24px;border:1px solid #000;border-radius:999px;background:#fff;color:#000;" +
    "font-size:16px;font-weight:700;cursor:pointer}" +
    ".ub-pill:hover{background:#f3f4f6}" +
    ".ub-take{background:#ffd414}" +
    ".ub-take:hover{background:#f5c800}" +
    ".ub-take:disabled{border-color:#e2e2e2;background:#e2e2e2;color:#999;cursor:not-allowed}" +
    ".ub-overlay button:focus-visible,.ub-check input:focus-visible,.ub-break button:focus-visible{outline:2px solid #324dc7;outline-offset:2px}" +
    ".ub-break{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;overflow-y:auto;padding:40px;" +
    "background:#1e1e1e;color:#fff;font-size:16px;line-height:1.5}" +
    ".ub-break:focus{outline:none}" +
    ".ub-columns{display:flex;flex:1 0 auto;align-items:center}" +
    ".ub-col{display:flex;flex:1 1 50%;flex-direction:column;min-width:0}" +
    ".ub-col-left{align-items:center;text-align:center}" +
    ".ub-section{margin:0 0 20px;font-size:24px;font-weight:700;line-height:1.3}" +
    ".ub-timer{display:flex;flex-direction:column;align-items:center;justify-content:center;width:305px;max-width:100%;height:165px;" +
    "border:2px solid #fff;border-radius:8px}" +
    ".ub-timer-label{margin:0;font-weight:700}" +
    ".ub-time{font-size:76px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}" +
    ".ub-col-right h2{margin:0 0 14px;font-size:28px;font-weight:700;line-height:1.25}" +
    ".ub-col-right p{max-width:440px;margin:0 0 24px}" +
    ".ub-resume{width:162px;height:50px;padding:0;border:0;border-radius:999px;background:#ffd414;color:#000;font-size:16px;font-weight:700;cursor:pointer}" +
    ".ub-resume:hover{background:#f5c800}" +
    ".ub-student{flex:none;margin-top:24px;font-size:20px;font-weight:700}" +
    "@media (max-width:760px){" +
    ".ub-modal{padding:20px}.ub-modal h2{font-size:20px}" +
    ".ub-actions{flex-direction:column-reverse}.ub-pill{width:100%}" +
    ".ub-break{padding:24px 16px}" +
    ".ub-columns{flex-direction:column;align-items:stretch;justify-content:center;gap:28px}" +
    ".ub-col{flex:none}.ub-col-right{align-items:center;text-align:center}" +
    ".ub-section{font-size:20px}.ub-col-right h2{font-size:22px}.ub-time{font-size:64px}" +
    ".ub-student{text-align:center}}";

  var page = PAGES[location.pathname.replace(/(\.html|\/)$/, "")];
  if (!page) return;

  // "idle", "confirming" or "on-break". Every action checks this first, so
  // repeated clicks can't start a break or send a notification twice.
  var state = "idle";
  var root = null;
  var refreshTimer = null;
  var notifications = Promise.resolve();

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else if (key === "class") node.className = props[key];
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), props[key]);
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function secondsLeft() {
    return window.__examSecondsLeft;
  }

  function examIsRunning() {
    return typeof secondsLeft() === "number";
  }

  // Same format as the exam's own timer.
  function formatTime(seconds) {
    var rest = seconds % 60;
    return Math.floor(seconds / 60) + ":" + (rest < 10 ? "0" : "") + rest;
  }

  function storedName(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function setActiveBreak(active) {
    try {
      if (active) sessionStorage.setItem(ACTIVE_BREAK_KEY, location.pathname);
      else sessionStorage.removeItem(ACTIVE_BREAK_KEY);
    } catch (e) {}
  }

  function newEventId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  // Queued so that "resumed" can't reach the chat before "started". Failures are
  // deliberately ignored: the server logs them, and the break doesn't depend on them.
  function notify(event) {
    var body = JSON.stringify({
      event: event,
      page: location.pathname.replace(/(\.html|\/)$/, ""),
      firstName: storedName("firstName"),
      lastName: storedName("lastName"),
      secondsLeft: secondsLeft(),
      eventId: newEventId()
    });
    notifications = notifications.then(function () {
      return fetch("/api/exam-break-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true
      });
    }).catch(function () {});
  }

  function clearScreen() {
    if (root) root.remove();
    root = null;
    clearInterval(refreshTimer);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function showScreen(node, focusTarget) {
    clearScreen();
    root = node;
    document.body.appendChild(root);
    document.addEventListener("keydown", onKeyDown, true);
    focusTarget.focus();
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && state === "confirming") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Tab") return;
    // Keep keyboard focus out of the exam underneath.
    var focusable = root.querySelectorAll("button:not(:disabled),input");
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!root.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function cancel() {
    if (state !== "confirming") return;
    state = "idle";
    clearScreen();
  }

  function openConfirmation() {
    if (state !== "idle" || !examIsRunning()) return;
    state = "confirming";

    var take = el("button", { type: "button", class: "ub-pill ub-take", id: "ub-take", disabled: "", text: "Take Unscheduled Break", onclick: takeBreak });
    var checkbox = el("input", {
      type: "checkbox",
      id: "ub-confirm",
      onchange: function () { take.disabled = !checkbox.checked; }
    });
    var modal = el("div", { class: "ub-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "ub-title", tabindex: "-1" }, [
      el("button", { type: "button", class: "ub-close", id: "ub-close", "aria-label": "Close", text: "×", onclick: cancel }),
      el("h2", { id: "ub-title", text: "You'll Lose Testing Time During This Break" }),
      el("label", { class: "ub-check" }, [
        checkbox,
        el("span", { text: "I need to take a break, and I understand that I’ll lose testing time." })
      ]),
      el("p", { class: "ub-laptop", text: "If you’re testing with a laptop, do not close it." }),
      el("div", { class: "ub-actions" }, [
        el("button", { type: "button", class: "ub-pill", id: "ub-cancel", text: "Cancel", onclick: cancel }),
        take
      ])
    ]);
    showScreen(el("div", { class: "ub-overlay", id: "ub-overlay" }, [modal]), modal);
  }

  function takeBreak() {
    if (state !== "confirming" || !root.querySelector("#ub-confirm").checked) return;
    state = "on-break";
    setActiveBreak(true);
    notify("break_started");
    showBreakScreen();
  }

  function resume() {
    if (state !== "on-break") return;
    state = "idle";
    setActiveBreak(false);
    notify("test_resumed");
    clearScreen();
  }

  function showBreakScreen() {
    var time = el("div", { class: "ub-time", id: "ub-time", role: "timer", text: formatTime(secondsLeft()) });
    var resumeButton = el("button", { type: "button", class: "ub-resume", id: "ub-resume", text: "Resume Testing", onclick: resume });
    var student = (storedName("firstName") + " " + storedName("lastName")).trim() || "Guest";

    var screen = el("div", { class: "ub-break", id: "ub-break", role: "dialog", "aria-modal": "true", "aria-labelledby": "ub-break-title" }, [
      el("div", { class: "ub-columns" }, [
        el("div", { class: "ub-col ub-col-left" }, [
          el("p", { class: "ub-section" }, [
            document.createTextNode(page.section),
            el("br"),
            document.createTextNode(page.name)
          ]),
          el("div", { class: "ub-timer" }, [
            el("p", { class: "ub-timer-label", text: "Time Remaining in Module:" }),
            time
          ])
        ]),
        el("div", { class: "ub-col ub-col-right" }, [
          el("h2", { id: "ub-break-title", text: "Unscheduled Break: Do Not Close Your Device" }),
          el("p", { text: "If this module ends while you're on break, you'll be taken to the next module." }),
          resumeButton
        ])
      ]),
      el("div", { class: "ub-student", text: student })
    ]);
    showScreen(screen, resumeButton);

    // Only repaints the exam timer's value.
    refreshTimer = setInterval(function () {
      var text = formatTime(secondsLeft());
      if (time.textContent !== text) time.textContent = text;
    }, 250);
  }

  // After a page reload during a break, put the break screen back. This waits for
  // React to finish loading, since nodes added earlier would disturb hydration.
  function restoreBreak() {
    var active = null;
    try {
      active = sessionStorage.getItem(ACTIVE_BREAK_KEY);
    } catch (e) {}
    if (!active) return;
    if (active !== location.pathname) {
      // The module ended during the break, so that break is over.
      setActiveBreak(false);
      return;
    }
    var wait = setInterval(function () {
      if (!examIsRunning()) return;
      clearInterval(wait);
      state = "on-break";
      showBreakScreen();
    }, 100);
  }

  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  window.__openUnscheduledBreak = openConfirmation;
  restoreBreak();
})();
