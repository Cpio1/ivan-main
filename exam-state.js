/**
 * The exam's saved state, kept in localStorage so that it survives reloads and
 * closed tabs. Each timed page's end time is the single source of truth for its
 * timer: the time left is always deadline - now, so reloading gives no extra time.
 *
 * This loads in <head>, before React, so that a reload can hide the page until the
 * saved state is back. The static HTML always contains the full time and question 1.
 *
 * Saved under "examState":
 *   { version, examId, examStatus, section, module, isUnscheduledBreak, breakPage,
 *     modules: { "/test": { deadline, question }, ... } }
 * Answers, Mark for Review and cross-outs keep their existing per-section keys,
 * listed in EXAM_DATA_KEYS. They're removed together with the state above.
 */
(function () {
  "use strict";

  var STATE_KEY = "examState";
  var VERSION = 1;
  var SECTIONS = ["verbal1", "verbal2", "math1", "math2"];
  var EXAM_DATA_KEYS = [];
  SECTIONS.forEach(function (name) {
    EXAM_DATA_KEYS.push(name + "_answers", name + "_flagged", name + "_crossed");
  });
  var LAST_MODULE_PAGE = "/test4";
  var FINISH_PAGE = "/bluebook";
  var MODULE_INFO = {
    "/test": { section: "Reading and Writing", module: 1 },
    "/test2": { section: "Reading and Writing", module: 2 },
    "/test3": { section: "Math", module: 1 },
    "/test4": { section: "Math", module: 2 }
  };
  var RESTORING_CLASS = "exam-restoring";
  var REVEAL_FAILSAFE_MS = 5000;
  // Allows for small clock corrections when checking a saved deadline.
  var CLOCK_TOLERANCE_MS = 60000;
  var MATH_PAGES = ["/test3", "/test4"];
  var MATH_ROOT = ".h-screen";
  var TYPESET_WAIT_MS = 3000;

  var page = location.pathname.replace(/(\.html|\/)$/, "");
  var state = null;

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // Returns null for anything damaged, which then starts a clean state.
  function readState() {
    var saved = null;
    try {
      saved = JSON.parse(storageGet(STATE_KEY));
    } catch (e) {}
    var isValid =
      saved && typeof saved === "object" && saved.version === VERSION &&
      saved.modules && typeof saved.modules === "object" && !Array.isArray(saved.modules);
    return isValid ? saved : null;
  }

  // Re-reads first so that a second open tab's changes aren't overwritten.
  function updateState(change) {
    state = readState() || state;
    change(state);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function currentExamId() {
    var name = (storageGet("firstName") || "guest") + " " + (storageGet("lastName") || "");
    return "bluebook-sat:" + name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  function newState() {
    return { version: VERSION, examId: currentExamId(), examStatus: "in_progress", isUnscheduledBreak: false, breakPage: null, modules: {} };
  }

  function removeSavedExam() {
    storageRemove(STATE_KEY);
    EXAM_DATA_KEYS.forEach(storageRemove);
  }

  function hasValidDeadline(entry) {
    return !!entry && typeof entry.deadline === "number" && isFinite(entry.deadline);
  }

  function currentEntry() {
    return state.modules[page];
  }

  // Removing math from the page while MathJax is still typesetting it makes MathJax
  // throw. This waits until no untypeset math is left and the queue is finished, or
  // gives up after a while in case MathJax can't load.
  function afterTypesetting(root, done) {
    var waited = 0;
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      done();
    }
    var timer = setInterval(function () {
      waited += 50;
      var mathJax = window.MathJax;
      var queue = mathJax && mathJax.startup && mathJax.startup.promise;
      var content = document.querySelector(root);
      if (queue && content && content.textContent.indexOf("\\(") === -1) {
        clearInterval(timer);
        queue.then(finish, finish);
      } else if (waited >= TYPESET_WAIT_MS) {
        clearInterval(timer);
        finish();
      }
    }, 50);
  }

  /* ---------- Hiding the page while a reload restores its state ---------- */

  function reveal() {
    document.documentElement.classList.remove(RESTORING_CLASS);
  }

  function hideUntilRestored() {
    var style = document.createElement("style");
    style.textContent = "html." + RESTORING_CLASS + " body{visibility:hidden}";
    document.head.appendChild(style);
    document.documentElement.classList.add(RESTORING_CLASS);
    setTimeout(reveal, REVEAL_FAILSAFE_MS);
  }

  /* ---------- Finish page ---------- */

  // The finish page can be opened by URL, so opening it isn't proof of finishing.
  // Only clear the exam once the last module's time has really run out; otherwise
  // visiting this page would be a way to restart with full time.
  function finishExamIfComplete() {
    var saved = readState();
    if (!saved) return;
    var last = saved.modules[LAST_MODULE_PAGE];
    if (hasValidDeadline(last) && last.deadline <= Date.now()) removeSavedExam();
  }

  if (page === FINISH_PAGE) {
    finishExamIfComplete();
    return;
  }

  /* ---------- Timed pages ---------- */

  state = readState();
  if (state && state.examId !== currentExamId()) {
    // A different student on this device starts their own exam.
    removeSavedExam();
    state = null;
  }
  if (!state) {
    storageRemove(STATE_KEY);
    state = newState();
  }

  var isResuming = hasValidDeadline(currentEntry());
  // A break flag from another page means that module ended during the break.
  var breakHasEnded = state.isUnscheduledBreak && state.breakPage !== page;

  updateState(function (s) {
    if (breakHasEnded) {
      s.isUnscheduledBreak = false;
      s.breakPage = null;
    }
    if (MODULE_INFO[page]) {
      s.section = MODULE_INFO[page].section;
      s.module = MODULE_INFO[page].module;
    }
  });

  if (isResuming) hideUntilRestored();

  // Question restoring has to survive React's first render, when the question is
  // still 0, and effects running twice: nothing is saved until the question has
  // been restored and React has reached it.
  var questionRestored = false;
  var questionTarget = null;
  var viewPending = false;

  function revealWhenPainted() {
    requestAnimationFrame(function () { requestAnimationFrame(reveal); });
  }

  window.__examClock = {
    // Returns this page's deadline, creating it only the first time.
    deadline: function (durationSeconds) {
      var now = Date.now();
      updateState(function (s) {
        var entry = s.modules[page];
        var isUsable = hasValidDeadline(entry) && entry.deadline - now <= durationSeconds * 1000 + CLOCK_TOLERANCE_MS;
        if (!isUsable) s.modules[page] = { deadline: now + durationSeconds * 1000, question: entry ? entry.question : 0 };
      });
      // A restored break reveals the page itself, once its screen is in place.
      if (!this.isOnBreak() && !viewPending) revealWhenPainted();
      return currentEntry().deadline;
    },

    secondsLeft: function () {
      var entry = currentEntry();
      if (!hasValidDeadline(entry)) return null;
      return Math.max(0, Math.ceil((entry.deadline - Date.now()) / 1000));
    },

    // Puts back the saved question and keeps the Directions popup, which opens by
    // default, closed. Math pages do this one step at a time while the page is hidden,
    // because changing what's on screen during typesetting makes MathJax throw.
    restoreView: function (questionCount, showQuestion, setDirectionsOpen) {
      var entry = currentEntry();
      var saved = entry ? entry.question : 0;
      var question = Number.isInteger(saved) && saved >= 0 && saved < questionCount ? saved : 0;
      questionRestored = true;
      // React starts on question 0, so only a later question has a change to wait for.
      questionTarget = question > 0 ? question : null;
      if (!isResuming) return;

      if (MATH_PAGES.indexOf(page) === -1) {
        showQuestion(question);
        setDirectionsOpen(false);
        return;
      }
      var clock = this;
      viewPending = true;
      afterTypesetting(MATH_ROOT, function () {
        showQuestion(question);
        setDirectionsOpen(false);
        afterTypesetting(MATH_ROOT, function () {
          viewPending = false;
          if (!clock.isOnBreak()) revealWhenPainted();
        });
      });
    },

    saveQuestion: function (index) {
      if (!questionRestored) return;
      if (questionTarget !== null) {
        if (index !== questionTarget) return;
        questionTarget = null;
      }
      updateState(function (s) {
        if (s.modules[page]) s.modules[page].question = index;
      });
    },

    isOnBreak: function () {
      return state.isUnscheduledBreak === true && state.breakPage === page;
    },

    setBreak: function (active) {
      updateState(function (s) {
        s.isUnscheduledBreak = active;
        s.breakPage = active ? page : null;
      });
    },

    reveal: reveal,

    // Explicitly discards the saved exam.
    reset: function () {
      removeSavedExam();
      state = newState();
    }
  };
})();
