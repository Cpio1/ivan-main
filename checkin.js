/**
 * Check-in wizard shown between the name page ("/") and the start code page
 * ("/start"). It's plain JS because the source of the Next.js bundles isn't in
 * this repo. It reads the name from localStorage, keeps its own progress in
 * sessionStorage, and doesn't touch codes, answers or test state.
 *
 * To change a step, edit its entry in STEPS. Each entry has a title, a render
 * function and an optional isComplete(state), which controls the Next button.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "checkinProgress";
  var NAME_PAGE = "/?editName=1";
  var CODE_PAGE = "/start";
  var TEST_PAGES = ["/test", "/test2", "/test3", "/test4"];
  var REQUEST_TIMEOUT_MS = 15000;

  var PLEDGE =
    "I am the person who is supposed to take this exam. I agree to follow the rules above and understand what will happen if I break them.";

  var DEVICE_OPTIONS = [
    { value: "own", label: "I own this device (or I borrowed it from someone I know)." },
    { value: "college-board", label: "I borrowed this device from College Board." },
    { value: "school", label: "My school or test center owns this device." }
  ];

  /* ---------- Icons ---------- */

  function svg(body) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>"
    );
  }

  var ICONS = {
    laptop: svg('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18l-2-4H5z"/>'),
    calculator: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01M15.5 17h.01"/>'),
    mouse: svg('<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3"/>'),
    pencil: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
    files: svg('<path d="M9 3h7l4 4v11H9z"/><path d="M16 3v4h4M6 7H4v14h11v-3"/>'),
    id: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.6-2.2 3-2.2s2.4.6 3 2.2M14 10h4M14 14h4"/>'),
    plug: svg('<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>'),
    food: svg('<path d="M7 8h10l-1 13H8zM6 8h12M12 8l1-5h3"/>'),
    smartDevices: svg('<rect x="3.5" y="3" width="9" height="18" rx="1.5"/><path d="M7 18h2"/><rect x="15" y="9" width="6" height="6" rx="1.5"/><path d="M16.5 9V6.5h3V9M16.5 15v2.5h3V15"/>'),
    book: svg('<path d="M12 6c-2-1.5-5-2-8-2v15c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v15"/>'),
    headphones: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
    check: svg('<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-7"/>'),
    warning: svg('<circle cx="12" cy="12" r="9.5"/><path d="M12 7v6M12 16.5h.01"/>'),
    prohibition:
      '<svg class="prohibition-sign" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="22" cy="22" r="20.5"/><path d="M7.5 7.5l29 29"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3l16 9-16 9z"/></svg>',
    laptopLock:
      '<svg class="lock-art" viewBox="0 0 170 110" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="30" y="10" width="110" height="74" rx="6"/><path d="M12 98h146l-14-14H26z"/>' +
      '<rect x="68" y="42" width="34" height="26" rx="4" fill="currentColor"/><path d="M74 42v-8a11 11 0 0 1 22 0v8"/></svg>'
  };

  /* ---------- Reusable pieces ---------- */

  // Creates an element. `text` is set as textContent, so user input stays inert.
  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else if (key === "class") node.className = props[key];
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), props[key]);
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function icon(name) {
    var node = el("span", { class: "icon" });
    node.innerHTML = ICONS[name];
    return node;
  }

  function card(children, extraClass) {
    return el("section", { class: "card" + (extraClass ? " " + extraClass : "") }, children);
  }

  // Items are [icon, bold text, optional regular text].
  function deskList(items, makeIcon) {
    return el("ul", { class: "desk-list" }, items.map(function (item) {
      var text = el("p", {}, [el("strong", { text: item[1] })]);
      if (item[2]) text.appendChild(document.createTextNode(" " + item[2]));
      return el("li", {}, [makeIcon(item[0]), text]);
    }));
  }

  function allowedIcon(name) {
    return el("span", { class: "desk-icon allowed" }, [icon(name)]);
  }

  function prohibitedIcon(name) {
    var sign = el("span", { class: "desk-icon prohibited" }, [icon(name)]);
    sign.insertAdjacentHTML("beforeend", ICONS.prohibition);
    return sign;
  }

  function radioGroup(name, options, selected, onChange) {
    return el("div", { role: "radiogroup" }, options.map(function (option) {
      var input = el("input", {
        type: "radio",
        name: name,
        value: option.value,
        onchange: function () { onChange(option.value); }
      });
      input.checked = selected === option.value;
      return el("label", { class: "radio-option" }, [
        input,
        el("span", { class: "radio-mark" }),
        el("span", { text: option.label })
      ]);
    }));
  }

  function statusCard(iconNode, variant, children) {
    var iconWrap = el("div", { class: "status-icon " + variant }, [iconNode]);
    return card([iconWrap].concat(children), "status-card");
  }

  /* ---------- Storage ---------- */

  function currentName() {
    var first, last;
    try {
      first = localStorage.getItem("firstName");
      last = localStorage.getItem("lastName");
    } catch (e) {}
    if (!first || !last) return null;
    return first.trim() + " " + last.trim();
  }

  function loadState(name) {
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    } catch (e) {}
    if (!saved || typeof saved !== "object") saved = {};
    var loaded = {
      step: Number.isInteger(saved.step) ? saved.step : 1,
      name: saved.name,
      info: saved.info,
      device: saved.device,
      pledge: typeof saved.pledge === "string" ? saved.pledge : "",
      examReady: saved.examReady === true
    };
    // The Yes/No answer was about the old name, but the other answers still hold.
    if (loaded.name !== name) loaded.info = null;
    loaded.name = name;
    return loaded;
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function normalizeSpaces(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  /* ---------- Step 7: a real check that the test files can be fetched ---------- */

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: controller.signal }, options)).finally(function () {
      clearTimeout(timer);
    });
  }

  function assetsIn(html) {
    var found = [];
    var pattern = /(?:src|href)="(\/?[^"':]+\.(?:js|css))"/g;
    var match;
    while ((match = pattern.exec(html))) found.push("/" + match[1].replace(/^\//, ""));
    return found;
  }

  // vercel.json sends unknown paths to index.html with a 200, so a status check
  // isn't enough: each test page must contain questions, and each asset must not
  // come back as HTML.
  function checkExamFiles() {
    return Promise.all(TEST_PAGES.map(function (page) {
      return fetchWithTimeout(page).then(function (response) {
        if (!response.ok) throw new Error("Unavailable: " + page);
        return response.text();
      }).then(function (html) {
        if (html.indexOf('name="question-') === -1) throw new Error("No questions: " + page);
        return assetsIn(html);
      });
    })).then(function (lists) {
      var unique = Array.from(new Set([].concat.apply([], lists)));
      return Promise.all(unique.map(function (url) {
        return fetchWithTimeout(url, { method: "HEAD" }).then(function (response) {
          var type = response.headers.get("content-type") || "";
          if (!response.ok || type.indexOf("text/html") !== -1) throw new Error("Unavailable: " + url);
        });
      }));
    });
  }

  /* ---------- Steps ---------- */

  var STEPS = [
    {
      title: "Confirm Your Personal Information",
      narrow: true,
      isComplete: function (s) { return s.info === "yes"; },
      render: function () {
        var notice = el("div");
        function showNotice() {
          notice.textContent = "";
          if (state.info !== "no") return;
          notice.appendChild(el("div", { class: "notice" }, [
            el("p", { text: "Go back to the previous page to edit your first and last name. Your other check-in answers will be kept." }),
            el("button", { type: "button", class: "pill pill-back", text: "Edit Name", onclick: goToNamePage })
          ]));
        }
        showNotice();
        return [card([
          el("div", { class: "columns" }, [
            el("div", {}, [el("p", { class: "label", text: "First and Last Name" }), el("p", { id: "checkin-name", text: state.name })]),
            el("div", {}, [el("p", { class: "label", text: "Accommodations" }), el("p", { text: "You don't have any approved digital testing accommodations." })])
          ]),
          el("hr", { class: "divider" }),
          el("p", { class: "muted", text: "Please make sure your name is spelled the way you entered it on the previous page." }),
          el("p", { class: "question", style: "margin-top:16px", text: "Is this information correct?" }),
          radioGroup("info", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }], state.info, function (value) {
            update({ info: value });
            showNotice();
          }),
          notice
        ])];
      }
    },
    {
      title: "Confirm Device Information",
      narrow: true,
      isComplete: function (s) {
        return DEVICE_OPTIONS.some(function (option) { return option.value === s.device; });
      },
      render: function () {
        return [card([
          el("p", { class: "question", text: "Who owns this device?" }),
          radioGroup("device", DEVICE_OPTIONS, state.device, function (value) { update({ device: value }); }),
          el("p", { class: "note", text: "This information helps us resolve issues faster if you have a problem with your device." })
        ])];
      }
    },
    {
      title: "Test Overview",
      narrow: true,
      render: function () {
        // Each block is [heading or null, paragraphs].
        var blocks = [
          [null, ["The digital SAT, PSAT/NMSQT, PSAT 10, and PSAT 8/9 each include two main parts: Reading and Writing, and Math."]],
          ["Section 1: Reading and Writing (54 Questions)", [
            "This section is divided into two modules, and each module contains 27 questions.",
            "Each question may include one or more passages, and some questions may also include a table or graph. Read the passage(s) and question carefully, then choose the best answer based on the information provided. All questions in this section are multiple-choice with four answer options, and only one answer is correct."
          ]],
          ["Section 2: Math (44 Questions)", ["This section is also divided into two modules, and each module contains 22 questions."]],
          ["Modules", ["The two modules in each section are timed separately. If you still have time left, you may review your answers within the current module. When time runs out, the test automatically moves you to the next module or section."]],
          ["Section Directions", ["Additional directions for both Reading and Writing and Math are available in the Help section under More at the top-right corner of the screen."]]
        ];
        return [card([
          el("div", { class: "scroll-region", tabindex: "0", role: "region", "aria-label": "Test overview" }, blocks.map(function (block) {
            var heading = block[0] ? el("h2", { text: block[0] }) : null;
            var paragraphs = block[1].map(function (text) { return el("p", { text: text }); });
            return el("div", { class: "overview-block" }, [heading].concat(paragraphs));
          }))
        ])];
      }
    },
    {
      title: "Testing Tools",
      pageClass: "tools-page",
      render: function () {
        // Placeholder cover: there's no video yet, so this isn't a button.
        var play = el("div", { class: "video-play" });
        play.innerHTML = ICONS.play;
        var tools = [
          ["Section Directions:", "Directions are at the top left of each test screen."],
          ["Testing Timer:", "Use the timer to pace yourself. You can hide it until 5 minutes remain."],
          ["Annotate:", "Select some text, then click Annotate to highlight text or leave yourself a note."],
          ["Line Reader:", "Use the line reader to help you focus as you're reading test content."],
          ["Mark for Review:", "Flag a question to come back to it within the module."],
          ["Cross Out:", "Cross out answer choices you want to eliminate."],
          ["Calculator:", "Use the graphing calculator in the Math section."]
        ];
        return [el("section", { class: "tools-panel" }, [
          el("div", { class: "video-cover", role: "img", "aria-label": "Testing Tools video cover" }, [
            play,
            el("div", { class: "video-title", text: "Testing Tools" })
          ]),
          el("div", { class: "tools-text" }, [el("h2", { text: "Testing Tools" })].concat(tools.map(function (tool) {
            return el("p", {}, [el("strong", { text: tool[0] }), document.createTextNode(" " + tool[1])]);
          })))
        ])];
      }
    },
    {
      title: "Get Your Desk Ready",
      pageClass: "desk-page",
      render: function () {
        return [el("div", { class: "columns" }, [
          card([
            el("h2", { class: "card-title", text: "Put these items on your desk:" }),
            deskList([
              ["laptop", "Your testing device"],
              ["calculator", "Your personal calculator", "if you brought one. There's also a graphing calculator built into the app."],
              ["mouse", "An external mouse or keyboard.", "You can use an external keyboard with a tablet\u2014not with a laptop."],
              ["pencil", "A pencil or pen"],
              ["files", "The scratch paper", "your proctor provided you. Write your full name at the top of each sheet."],
              ["id", "Your photo ID"]
            ], allowedIcon)
          ], "desk-card"),
          card([
            el("h2", { class: "card-title", text: "Put these items under your desk:" }),
            deskList([
              ["plug", "Power cord/portable charger.", "But if you need to plug in during testing, you may."],
              ["food", "Food and drink.", "You can eat and drink during the break but not in the test room (unless you have an approved accommodation)."]
            ], prohibitedIcon),
            el("h2", { class: "card-title desk-subheading", text: "Your proctor will collect these items:" }),
            deskList([
              ["smartDevices", "Smart glasses, a smartphone, smartwatch,", "or any other connected device including cameras, recording devices, or timers."],
              ["book", "Notes, books, or any other reference materials."],
              ["headphones", "Headphones or earbuds", "unless you have an approved accommodation."]
            ], prohibitedIcon)
          ], "desk-card")
        ])];
      }
    },
    {
      title: "Digital Test Security",
      pageClass: "security-page",
      isComplete: function (s) { return normalizeSpaces(s.pledge) === PLEDGE; },
      render: function () {
        var input = el("textarea", {
          class: "pledge-input",
          id: "pledge-input",
          "aria-labelledby": "pledge-input-label",
          spellcheck: "false",
          autocomplete: "off",
          oninput: function () { update({ pledge: input.value }); }
        });
        input.value = state.pledge;
        return [
          el("h2", { class: "security-heading", text: "You're bound by the following rules for today's exam:" }),
          el("ul", { class: "rules" }, [
            "You may not give or receive help during the exam. You may not share or post anything related to this exam.",
            "Your answers must be entirely your own. College Board will review your responses.",
            "If you attempt to cheat, your score will be canceled, college admissions offices may be notified, and you will be disqualified from taking any AP Exams, SAT or PSAT-related assessments, or CLEP exams."
          ].map(function (rule) { return el("li", { text: rule }); })),
          // These rules mirror the real exam, but this site is only a practice tool.
          el("p", { class: "note", text: "This is a practice simulation. No official organization reviews your answers here, and nothing you do here can affect a real score." }),
          el("div", { class: "pledge-columns" }, [
            el("div", {}, [
              el("h2", { class: "security-heading pledge-heading", text: "Test Security Pledge" }),
              el("p", { class: "pledge-text", text: PLEDGE })
            ]),
            el("div", {}, [
              el("h2", { class: "security-heading", id: "pledge-input-label", text: "Retype the Test Security Pledge:" }),
              input
            ])
          ])
        ];
      }
    },
    {
      title: "Exam Download",
      narrow: true,
      isComplete: function (s) { return s.examReady; },
      render: function () {
        var box = el("div");
        var run = runToken;
        function runCheck() {
          update({ examReady: false });
          box.textContent = "";
          box.appendChild(statusCard(el("div", { class: "spinner" }), "", [el("p", { role: "status", text: "Checking that the exam is available..." })]));
          checkExamFiles().then(function () {
            if (run !== runToken) return;
            box.textContent = "";
            box.appendChild(statusCard(icon("check"), "ok", [el("p", { id: "exam-ready", role: "status", text: "The exam has been loaded onto your device. Click Next to continue." })]));
            update({ examReady: true });
          }).catch(function () {
            if (run !== runToken) return;
            box.textContent = "";
            box.appendChild(statusCard(icon("warning"), "bad", [
              el("p", { role: "alert", text: "We couldn't reach the exam files. Check your internet connection and try again." }),
              el("button", { type: "button", class: "pill pill-back", text: "Try Again", onclick: runCheck })
            ]));
          });
        }
        runCheck();
        return [box];
      }
    },
    {
      title: "We're About to Lock Your Device",
      narrow: true,
      render: function () {
        var art = el("div");
        art.innerHTML = ICONS.laptopLock;
        return [card([
          art,
          el("p", { class: "emphasis", text: "If you have any other apps or software running, please exit out of them now." }),
          el("p", { class: "note", text: "This is a practice interface: the rules of this practice test still apply, but this site doesn't actually lock your device or close your apps." }),
          el("p", { style: "margin-top:20px", text: "Click Next now to complete check-in." })
        ], "status-card")];
      }
    },
    // Temporary final screen. To replace it, change only this entry.
    {
      title: "Ready to Continue",
      narrow: true,
      nextLabel: "Continue",
      render: function () {
        return [statusCard(icon("check"), "ok", [
          el("p", { class: "emphasis", text: "You've finished preparing for your test." }),
          el("p", { style: "margin-top:8px", text: "Click Continue to enter your start code." })
        ])];
      }
    }
  ];

  /* ---------- Wizard ---------- */

  var state;
  var runToken = 0; // Lets a slow exam check notice that the user has changed step.
  var content = document.getElementById("wizard-content");
  var main = document.getElementById("wizard-main");
  var nextButton = document.getElementById("wizard-next");
  var backButton = document.getElementById("wizard-back");

  function stepIsComplete(number) {
    var step = STEPS[number - 1];
    return !step.isComplete || step.isComplete(state);
  }

  function update(changes) {
    Object.assign(state, changes);
    saveState();
    nextButton.disabled = !stepIsComplete(state.step);
  }

  function goToNamePage() {
    location.href = NAME_PAGE;
  }

  function render(moveFocus) {
    var step = STEPS[state.step - 1];
    runToken++;

    var title = el("h1", { class: "wizard-title", tabindex: "-1", text: step.title });
    main.className = "wizard-main" + (step.pageClass ? " " + step.pageClass : "");
    content.className = "wizard-content" + (step.narrow ? " narrow" : "");
    content.textContent = "";
    content.appendChild(title);
    step.render().forEach(function (node) { content.appendChild(node); });

    document.getElementById("wizard-step-label").textContent = "Step " + state.step + " of " + STEPS.length;
    document.getElementById("wizard-bar-fill").style.width = (state.step / STEPS.length) * 100 + "%";
    document.getElementById("wizard-bar").setAttribute("aria-valuenow", state.step);
    document.title = step.title + " - Check-in";
    nextButton.textContent = step.nextLabel || "Next";
    nextButton.disabled = !stepIsComplete(state.step);

    main.scrollTop = 0;
    if (moveFocus) title.focus();
    saveState();
  }

  function goTo(number) {
    state.step = number;
    render(true);
  }

  nextButton.addEventListener("click", function () {
    if (!stepIsComplete(state.step)) return;
    if (state.step < STEPS.length) {
      goTo(state.step + 1);
      return;
    }
    // Check-in is done. Replacing the history entry means the browser's Back
    // button leads to the name page rather than a finished wizard.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    location.replace(CODE_PAGE);
  });

  backButton.addEventListener("click", function () {
    if (state.step > 1) goTo(state.step - 1);
    else goToNamePage();
  });

  function start() {
    var name = currentName();
    if (!name) {
      location.replace("/");
      return;
    }
    state = loadState(name);
    // A restored step is only valid if every step before it is complete. This
    // covers a changed name as well as edited sessionStorage.
    var limit = Math.min(Math.max(state.step, 1), STEPS.length);
    for (var i = 1; i < limit; i++) {
      if (!stepIsComplete(i)) {
        limit = i;
        break;
      }
    }
    state.step = limit;
    render(false);
  }

  start();
})();
