/**
 * Bluebook-style "Cross Out" for the answer choices on /test, /test2, /test3
 * and /test4.
 *
 * Self-contained, like battery-status.js and calculator-widget.js: the source
 * of the Next.js bundles is not in this repo, so this script adds its button to
 * the labels React renders and never touches flags or the timer.
 *
 * A crossed-out choice can't be the answer. The test bundles' answer handler, which
 * every way of selecting a choice ends up in, asks window.__isChoiceCrossedOut first
 * and ignores crossed-out choices, so React puts the radio back. If the selected
 * choice gets crossed out, sync() clears it through window.__clearExamAnswer, which
 * the bundles provide. That also covers answers saved before this rule existed.
 *
 * How it stays compatible with React:
 * - Buttons are only added once React has finished hydrating the label. An extra
 *   node in server-rendered markup would otherwise cause a hydration mismatch.
 *   Check the label, not the radio: hydration is time-sliced and a child finishes
 *   before its parent, so a hydrated radio doesn't mean the label's children have
 *   all been matched yet.
 * - React reuses the same <label> elements between questions (they are keyed by
 *   choice index), so the question is re-read from the radio's `name` on every
 *   DOM change.
 * - React rewrites label.className when an answer is selected, so state lives in
 *   data-* attributes, which React leaves alone.
 * - Crossed-out choices are saved per section as { questionId: ["A", "C"] },
 *   next to the existing <section>_answers and <section>_flagged keys.
 */
(function () {
  "use strict";

  var STORAGE_KEYS = {
    "/test": "verbal1_crossed",
    "/test2": "verbal2_crossed",
    "/test3": "math1_crossed",
    "/test4": "math2_crossed"
  };
  var LETTERS = ["A", "B", "C", "D"];
  var RADIO_SELECTOR = 'label > input[type="radio"][name^="question-"]';
  var ANIMATION_MS = 180;

  var CSS =
    "label[data-crossout-ready]{position:relative;margin-right:36px}" +
    // Don't suggest the answer will be selected while hovering the button.
    "label[data-crossout-ready]:has(>.crossout-btn:hover){background-color:transparent}" +
    // The strike is a drawn line rather than text-decoration, which cannot reach
    // into MathJax output or the bare text nodes of the verbal sections.
    "label[data-crossout-ready]::after{content:'';position:absolute;left:6px;right:6px;top:50%;" +
    "height:2px;margin-top:-1px;background:#1f2937;pointer-events:none;" +
    "transform:scaleX(0);transform-origin:left center}" +
    "label[data-crossed]{color:#9ca3af}" +
    "label[data-crossed]::after{transform:scaleX(1)}" +
    "label[data-crossed]>div{opacity:.5}" +
    "label[data-crossout-animate]{transition:color " + ANIMATION_MS + "ms ease}" +
    "label[data-crossout-animate]::after{transition:transform " + ANIMATION_MS + "ms ease}" +
    "label[data-crossout-animate]>div{transition:opacity " + ANIMATION_MS + "ms ease}" +
    ".crossout-btn{position:absolute;top:50%;right:-32px;width:24px;height:24px;margin-top:-12px;" +
    "padding:0;display:flex;align-items:center;justify-content:center;overflow:visible;" +
    "border:1px solid #6b7280;border-radius:50%;background:#fff;color:#374151;" +
    "font-size:12px;font-weight:700;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none;" +
    "touch-action:manipulation;-webkit-tap-highlight-color:transparent;" +
    "transition:color " + ANIMATION_MS + "ms ease,border-color " + ANIMATION_MS + "ms ease,background-color " + ANIMATION_MS + "ms ease}" +
    // Larger touch target without changing how big the button looks.
    ".crossout-btn::before{content:'';position:absolute;inset:-7px -6px}" +
    // The diagonal line through the letter.
    ".crossout-btn::after{content:'';position:absolute;left:-2px;right:-2px;top:50%;height:1px;margin-top:-.5px;" +
    "background:currentColor;transform:rotate(-45deg);pointer-events:none}" +
    "@media (hover:hover){.crossout-btn:hover{background:#f3f4f6}}" +
    ".crossout-btn:focus-visible{outline:2px solid #334dc8;outline-offset:2px}" +
    ".crossout-btn[aria-pressed='true']{color:#334dc8;border-color:#334dc8;background:#eef0fb}" +
    // The desktop layouts don't fit a phone, which would leave the button covering
    // the answer or off screen. Math: the 768px container overflows the viewport,
    // so cap the answer's width. Verbal: the 80px column padding leaves an answer
    // box about 35px wide, so let it extend into that padding.
    "@media (max-width:640px){label[data-crossout-ready]{max-width:calc(100vw - 72px)}" +
    ".px-20>label[data-crossout-ready]{margin-left:-68px;margin-right:-44px}}" +
    "@media (prefers-reduced-motion:reduce){label[data-crossout-animate],label[data-crossout-animate]::after," +
    "label[data-crossout-animate]>div,.crossout-btn{transition:none}}";

  // In-memory copy, so crossing out still works for the rest of the page's life
  // if localStorage is unavailable.
  var memory = {};
  var retryTimer = null;

  function storageKey() {
    var path = location.pathname.replace(/(\.html|\/)$/, "");
    return STORAGE_KEYS[path] || null;
  }

  function loadState(key) {
    if (memory[key]) return memory[key];
    var state = null;
    try {
      state = JSON.parse(localStorage.getItem(key));
    } catch (e) {}
    memory[key] = state && typeof state === "object" && !Array.isArray(state) ? state : {};
    return memory[key];
  }

  function saveState(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  function isHydrated(node) {
    return Object.keys(node).some(function (k) {
      return k.indexOf("__reactProps$") === 0;
    });
  }

  function questionIdOf(radio) {
    return radio.name.slice("question-".length);
  }

  function letterOf(radio) {
    var group = document.getElementsByName(radio.name);
    return LETTERS[Array.prototype.indexOf.call(group, radio)] || null;
  }

  function isChoiceCrossedOut(questionId, value) {
    var key = storageKey();
    if (!key) return false;
    var crossed = loadState(key)[questionId] || [];
    return Array.prototype.some.call(document.getElementsByName("question-" + questionId), function (radio, index) {
      return radio.value === String(value) && crossed.indexOf(LETTERS[index]) !== -1;
    });
  }

  function toggle(button) {
    var key = storageKey();
    var label = button.parentNode;
    var radio = label.querySelector('input[type="radio"]');
    if (!key || !radio) return;

    var letter = letterOf(radio);
    var id = questionIdOf(radio);
    var state = loadState(key);
    var crossed = (state[id] || []).filter(function (l) {
      return l !== letter;
    });
    if (crossed.length === (state[id] || []).length) crossed.push(letter);
    if (crossed.length) state[id] = crossed;
    else delete state[id];
    saveState(key, state);

    // Animate only on an explicit toggle, not when a question is displayed.
    label.setAttribute("data-crossout-animate", "");
    clearTimeout(label.crossoutAnimationTimer);
    label.crossoutAnimationTimer = setTimeout(function () {
      label.removeAttribute("data-crossout-animate");
    }, ANIMATION_MS + 50);

    sync();
  }

  function createButton() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "crossout-btn ordinary-font";
    // Pressing a button inside a label doesn't activate the label's radio, but
    // preventDefault makes that explicit, and stopPropagation keeps the click
    // away from React's root listener.
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggle(button);
    });
    return button;
  }

  function setAttr(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function sync() {
    var key = storageKey();
    if (!key) return;
    var radios = document.querySelectorAll(RADIO_SELECTOR);
    var state = loadState(key);
    var waitingForReact = false;

    Array.prototype.forEach.call(radios, function (radio) {
      var label = radio.parentNode;
      if (!isHydrated(label)) {
        waitingForReact = true;
        return;
      }
      var letter = letterOf(radio);
      var button = label.querySelector(":scope > .crossout-btn");

      if (!letter) {
        if (button) label.removeChild(button);
        label.removeAttribute("data-crossout-ready");
        label.removeAttribute("data-crossed");
        return;
      }
      if (!button) {
        button = createButton();
        label.appendChild(button);
        label.setAttribute("data-crossout-ready", "");
      }

      var crossed = (state[questionIdOf(radio)] || []).indexOf(letter) !== -1;
      if (crossed) setAttr(label, "data-crossed", "");
      else if (label.hasAttribute("data-crossed")) label.removeAttribute("data-crossed");
      if (crossed && radio.checked && window.__clearExamAnswer) window.__clearExamAnswer(questionIdOf(radio));

      if (button.textContent !== letter) button.textContent = letter;
      setAttr(button, "aria-pressed", String(crossed));
      setAttr(button, "aria-label", (crossed ? "Undo cross out of answer " : "Cross out answer ") + letter);
    });

    // Hydration itself doesn't change the DOM, so the observer can't report it.
    if (waitingForReact && !retryTimer) {
      retryTimer = setTimeout(function () {
        retryTimer = null;
        sync();
      }, 100);
    }
  }

  function init() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    window.__isChoiceCrossedOut = isChoiceCrossedOut;

    // "class" because that's the only DOM change when saved answers are restored.
    new MutationObserver(sync).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["name", "class"]
    });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
