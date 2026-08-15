/**
 * Floating Desmos-style graphing calculator, wired to the existing
 * "Calculator" toolbar button on /test3 and /test4.
 *
 * This script is intentionally self-contained and does not touch the
 * Next.js/React bundle: it only listens for clicks on the existing
 * "Calculator" button (via event delegation) and mounts its own DOM
 * subtree appended to <body>. It never reads or mutates any test state
 * (answers, timer, navigation), so existing test logic is unaffected.
 *
 * Desmos integration:
 * Uses the official Desmos Graphing Calculator API (calculator.js) rather
 * than embedding the College Board /testing/collegeboard/graphing iframe
 * directly, since that endpoint is intended for College Board's own
 * authenticated Bluebook app and is not a stable/public embedding target.
 * The Desmos API key below is Desmos's own published "demo/testing" key
 * used throughout their public API documentation and examples
 * (https://www.desmos.com/api/v1.11/docs/index.html). Desmos API keys are
 * domain-restricted, non-secret identifiers by design (similar to a Google
 * Maps API key), not private credentials, so it is safe to ship client-side.
 * For production/higher usage, register a free key at
 * https://www.desmos.com/api/v1.11/docs and swap the constant below.
 */
(function () {
  "use strict";

  var DESMOS_API_KEY = "dcb31709b452b1cf9dc26972add0fda6";
  var DESMOS_SRC =
    "https://www.desmos.com/api/v1.11/calculator.js?apiKey=" + DESMOS_API_KEY;

  var root = null; // wrapper element, created once
  var calculatorInstance = null;
  var desmosLoadPromise = null;
  var expanded = false;

  function loadDesmos() {
    if (window.Desmos) return Promise.resolve(window.Desmos);
    if (desmosLoadPromise) return desmosLoadPromise;

    desmosLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = DESMOS_SRC;
      script.async = true;
      script.onload = function () {
        if (window.Desmos) resolve(window.Desmos);
        else reject(new Error("Desmos failed to initialize"));
      };
      script.onerror = function () {
        reject(new Error("Desmos script failed to load"));
      };
      document.head.appendChild(script);
    });

    return desmosLoadPromise;
  }

  function injectStyles() {
    if (document.getElementById("satcalc-styles")) return;
    var style = document.createElement("style");
    style.id = "satcalc-styles";
    style.textContent = [
      "#satcalc-root{position:fixed;top:64px;right:16px;width:380px;height:600px;",
      "max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);",
      "background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);",
      "z-index:2147483000;display:none;flex-direction:column;overflow:hidden;",
      "font-family:Arial,Helvetica,sans-serif;}",

      "#satcalc-root.satcalc-open{display:flex;}",
      "#satcalc-root.satcalc-expanded{width:min(760px,calc(100vw - 16px));height:min(760px,calc(100vh - 16px));}",

      "#satcalc-header{flex:0 0 auto;background:#1c1c1e;color:#fff;",
      "display:flex;align-items:center;justify-content:space-between;",
      "padding:10px 12px;cursor:move;user-select:none;}",

      "#satcalc-title{font-size:14px;font-weight:600;letter-spacing:.2px;}",

      "#satcalc-actions{display:flex;align-items:center;gap:6px;}",

      ".satcalc-btn{background:transparent;border:none;color:#fff;",
      "font-size:12px;padding:6px 10px;border-radius:6px;cursor:pointer;",
      "display:flex;align-items:center;gap:4px;}",
      ".satcalc-btn:hover{background:rgba(255,255,255,.15);}",

      "#satcalc-close{font-size:16px;line-height:1;padding:6px 9px;}",

      "#satcalc-graph{flex:1 1 auto;min-height:0;position:relative;background:#fff;}",

      "#satcalc-graph-el{position:absolute;inset:0;}",

      "#satcalc-status{position:absolute;inset:0;display:flex;align-items:center;",
      "justify-content:center;text-align:center;padding:20px;color:#555;font-size:13px;}",

      "@media (max-width:480px){",
      "#satcalc-root{top:auto;bottom:8px;left:8px;right:8px;width:auto;",
      "height:min(560px,calc(100vh - 16px));}",
      "#satcalc-root.satcalc-expanded{width:auto;height:min(80vh,700px);}",
      "}",
    ].join("");
    document.head.appendChild(style);
  }

  function setExpandLabel(btn) {
    btn.innerHTML = expanded ? "&#8722; Collapse" : "&#8599; Expand";
    btn.setAttribute("aria-label", expanded ? "Collapse calculator" : "Expand calculator");
  }

  function buildWidget() {
    injectStyles();

    root = document.createElement("div");
    root.id = "satcalc-root";

    var header = document.createElement("div");
    header.id = "satcalc-header";

    var title = document.createElement("div");
    title.id = "satcalc-title";
    title.textContent = "Calculator";

    var actions = document.createElement("div");
    actions.id = "satcalc-actions";

    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "satcalc-btn";
    expandBtn.id = "satcalc-expand";
    setExpandLabel(expandBtn);
    expandBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      expanded = !expanded;
      root.classList.toggle("satcalc-expanded", expanded);
      setExpandLabel(expandBtn);
      if (calculatorInstance) calculatorInstance.resize();
    });

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "satcalc-btn";
    closeBtn.id = "satcalc-close";
    closeBtn.innerHTML = "&#10005;";
    closeBtn.setAttribute("aria-label", "Close calculator");
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeCalculator();
    });

    actions.appendChild(expandBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    var graphWrap = document.createElement("div");
    graphWrap.id = "satcalc-graph";

    var graphEl = document.createElement("div");
    graphEl.id = "satcalc-graph-el";
    graphWrap.appendChild(graphEl);

    root.appendChild(header);
    root.appendChild(graphWrap);
    document.body.appendChild(root);

    enableDrag(header, root);

    return { graphEl: graphEl, graphWrap: graphWrap };
  }

  function enableDrag(handle, panel) {
    var dragging = false;
    var startX, startY, startLeft, startTop;

    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".satcalc-btn")) return;
      dragging = true;
      var rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var maxLeft = window.innerWidth - panel.offsetWidth;
      var maxTop = window.innerHeight - panel.offsetHeight;
      var newLeft = Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft));
      var newTop = Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop));
      panel.style.left = newLeft + "px";
      panel.style.top = newTop + "px";
    });

    function stopDrag(e) {
      dragging = false;
      if (handle.hasPointerCapture && e && handle.hasPointerCapture(e.pointerId)) {
        handle.releasePointerCapture(e.pointerId);
      }
    }
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointercancel", stopDrag);
  }

  function showStatus(graphWrap, message) {
    var el = document.getElementById("satcalc-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "satcalc-status";
      graphWrap.appendChild(el);
    }
    el.textContent = message;
    el.style.display = "flex";
  }

  function hideStatus() {
    var el = document.getElementById("satcalc-status");
    if (el) el.style.display = "none";
  }

  function ensureCalculator() {
    if (calculatorInstance) return Promise.resolve(calculatorInstance);

    var built = buildWidget();
    showStatus(built.graphWrap, "Loading calculator…");

    return loadDesmos()
      .then(function (Desmos) {
        hideStatus();
        calculatorInstance = Desmos.GraphingCalculator(built.graphEl, {
          keypad: true,
          expressions: true,
          settingsMenu: false,
          zoomButtons: true,
          expressionsTopbar: true,
          border: false,
          lockViewport: false,
          images: false,
          folders: false,
          notes: false,
          autosize: true,
        });
        return calculatorInstance;
      })
      .catch(function (err) {
        showStatus(
          built.graphWrap,
          "Couldn't load the calculator. Check your internet connection and try again."
        );
        console.error("[calculator-widget] Desmos failed to load:", err);
      });
  }

  function openCalculator() {
    ensureCalculator().then(function () {
      root.classList.add("satcalc-open");
      if (calculatorInstance) {
        // Desmos needs a resize nudge once it becomes visible/sized.
        setTimeout(function () {
          calculatorInstance.resize();
        }, 0);
      }
    });
  }

  function closeCalculator() {
    if (root) root.classList.remove("satcalc-open");
  }

  function toggleCalculator() {
    if (root && root.classList.contains("satcalc-open")) {
      closeCalculator();
    } else {
      openCalculator();
    }
  }

  function isCalculatorToolbarButton(button) {
    if (!button) return false;
    var text = (button.textContent || "").trim();
    return text === "Calculator";
  }

  document.addEventListener("click", function (e) {
    var button = e.target.closest("button");
    if (isCalculatorToolbarButton(button)) {
      toggleCalculator();
    }
  });
})();
