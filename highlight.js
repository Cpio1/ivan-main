/**
 * Text highlighting for /test, /test2, /test3 and /test4.
 *
 * Highlights are drawn with the CSS Custom Highlight API, which colours text ranges
 * without changing the DOM. React and MathJax both own these text nodes, so wrapping
 * parts of them in <span>s would break when either one updates. Browsers without the
 * API (before Safari 17.2 or Firefox 140) simply don't get this feature.
 *
 * Saved per section as { questionNumber: { regionId: [{ start, end, color }] } }. The
 * start and end are character offsets within a region (the passage, the question, or
 * one answer choice), so repeated words can't be confused with each other. Regions
 * never overlap and segments within a region never overlap; a new colour replaces
 * whatever it covers.
 */
(function () {
  "use strict";

  var SECTIONS = {
    "/test": "verbal1_highlights",
    "/test2": "verbal2_highlights",
    "/test3": "math1_highlights",
    "/test4": "math2_highlights"
  };
  var COLORS = {
    yellow: { swatch: "#F9E27D", fill: "rgba(249, 226, 125, 0.75)" },
    blue: { swatch: "#B9DEFA", fill: "rgba(185, 222, 250, 0.75)" },
    pink: { swatch: "#F3C4DF", fill: "rgba(243, 196, 223, 0.75)" }
  };
  var LETTERS = ["A", "B", "C", "D"];
  var MATH_TAG = "MJX-CONTAINER";
  var PANEL_GAP = 8;
  var VIEWPORT_MARGIN = 8;

  var storageKey = SECTIONS[location.pathname.replace(/(\.html|\/)$/, "")];
  if (!storageKey || !window.CSS || !CSS.highlights || typeof Highlight !== "function") return;

  var COLOR_NAMES = Object.keys(COLORS);
  var highlights = {};
  var paintedMath = [];
  var saved = loadSaved();
  var panel = null;
  var pendingSelection = null; // What the panel will act on: { question, parts, range }.
  var pointerIsDown = false;
  var renderQueued = false;

  /* ---------- Storage ---------- */

  function loadSaved() {
    var data = null;
    try {
      data = JSON.parse(localStorage.getItem(storageKey));
    } catch (e) {}
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch (e) {}
  }

  function validSegments(question, regionId) {
    var regions = saved[question];
    var list = regions && typeof regions === "object" ? regions[regionId] : null;
    if (!Array.isArray(list)) return [];
    return list.filter(function (segment) {
      return segment && Number.isInteger(segment.start) && Number.isInteger(segment.end) &&
        segment.start >= 0 && segment.start < segment.end && Object.prototype.hasOwnProperty.call(COLORS, segment.color);
    });
  }

  /* ---------- Finding what's on screen ---------- */

  // The footer button is the only place that shows the current question, and it's
  // absent on the Check Your Work screen, where there's nothing to highlight.
  function currentQuestion() {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var match = /^Question (\d+) of \d+/.exec(buttons[i].textContent);
      if (match) return match[1];
    }
    return null;
  }

  function findRegions() {
    var regions = [];
    var blockCount = 0;
    var choiceCount = 0;
    var nodes = document.querySelectorAll(".minion-pro, label");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.tagName === "INPUT" || node.closest(".z-50")) continue;
      if (node.parentElement.closest(".minion-pro")) continue;
      if (node.tagName === "LABEL") {
        if (!node.querySelector('input[type="radio"]')) continue;
        regions.push({ id: "choice-" + LETTERS[choiceCount++], node: node });
      } else {
        regions.push({ id: "block-" + blockCount++, node: node });
      }
    }
    return regions;
  }

  // Lists the region's text in order. A formula counts as one character, since its
  // inner markup isn't text the reader sees, and the answer's letter circle and
  // cross-out button aren't part of the answer.
  function unitsOf(region) {
    var units = [];
    var length = 0;
    function walk(parent) {
      for (var child = parent.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.nodeValue.length) {
            units.push({ node: child, start: length, end: length + child.nodeValue.length, isMath: false });
            length += child.nodeValue.length;
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === MATH_TAG) {
            units.push({ node: child, start: length, end: length + 1, isMath: true });
            length += 1;
          } else if (!isExcluded(region, child)) {
            walk(child);
          }
        }
      }
    }
    walk(region.node);
    return { list: units, length: length };
  }

  function isExcluded(region, element) {
    var tag = element.tagName;
    if (tag === "BUTTON" || tag === "INPUT" || tag === "SVG" || tag === "svg" || tag === "IMG") return true;
    // The letter circle: the first <div> directly inside an answer's label.
    return region.node.tagName === "LABEL" && element.parentNode === region.node && element === region.node.querySelector(":scope > div");
  }

  /* ---------- Offsets and ranges ---------- */

  function offsetOfBoundary(units, container, offset, isEnd) {
    var mathParent = container.nodeType === Node.ELEMENT_NODE ? container.closest(MATH_TAG) : container.parentElement && container.parentElement.closest(MATH_TAG);
    var probe = document.createRange();
    probe.setStart(container, offset);
    probe.collapse(true);
    for (var i = 0; i < units.list.length; i++) {
      var unit = units.list[i];
      if (unit.node === mathParent) return isEnd ? unit.end : unit.start;
      if (unit.node === container) return unit.start + offset;
      // The first unit at or after the boundary.
      if (probe.comparePoint(unit.node, 0) >= 0) return unit.start;
    }
    return units.length;
  }

  // The part of a range that falls within a region, as offsets.
  function intersect(range, region) {
    var regionRange = document.createRange();
    regionRange.selectNodeContents(region.node);
    if (range.compareBoundaryPoints(Range.END_TO_START, regionRange) >= 0) return null;
    if (range.compareBoundaryPoints(Range.START_TO_END, regionRange) <= 0) return null;

    var units = unitsOf(region);
    var startsInside = range.compareBoundaryPoints(Range.START_TO_START, regionRange) > 0;
    var endsInside = range.compareBoundaryPoints(Range.END_TO_END, regionRange) < 0;
    var start = startsInside ? offsetOfBoundary(units, range.startContainer, range.startOffset, false) : 0;
    var end = endsInside ? offsetOfBoundary(units, range.endContainer, range.endOffset, true) : units.length;
    return start < end ? { regionId: region.id, start: start, end: end } : null;
  }

  function rangeFor(units, start, end) {
    var range = document.createRange();
    var hasStart = false;
    for (var i = 0; i < units.list.length; i++) {
      var unit = units.list[i];
      if (!hasStart && start < unit.end) {
        if (unit.isMath) range.setStartBefore(unit.node);
        else range.setStart(unit.node, Math.max(0, start - unit.start));
        hasStart = true;
      }
      if (hasStart && end <= unit.end) {
        if (unit.isMath) range.setEndAfter(unit.node);
        else range.setEnd(unit.node, end - unit.start);
        return range;
      }
    }
    if (!hasStart || !units.list.length) return null;
    var last = units.list[units.list.length - 1];
    if (last.isMath) range.setEndAfter(last.node);
    else range.setEnd(last.node, last.node.nodeValue.length);
    return range;
  }

  /* ---------- Drawing ---------- */

  function render() {
    renderQueued = false;
    COLOR_NAMES.forEach(function (name) { highlights[name].clear(); });

    var mathColors = new Map();
    var question = currentQuestion();
    if (question) {
      findRegions().forEach(function (region) {
        var segments = validSegments(question, region.id);
        // Offsets only apply once MathJax has replaced the raw TeX; it triggers another
        // render when it does.
        if (!segments.length || region.node.textContent.indexOf("\\(") !== -1) return;
        var units = unitsOf(region);
        segments.forEach(function (segment) {
          var range = rangeFor(units, segment.start, Math.min(segment.end, units.length));
          if (range) highlights[segment.color].add(range);
          units.list.forEach(function (unit) {
            if (unit.isMath && unit.start >= segment.start && unit.end <= segment.end) mathColors.set(unit.node, segment.color);
          });
        });
      });
    }
    paintMath(mathColors);
  }

  // ::highlight doesn't reach MathJax's glyphs, which are CSS generated content.
  function paintMath(mathColors) {
    paintedMath.forEach(function (node) {
      if (!mathColors.has(node)) node.style.backgroundColor = "";
    });
    paintedMath = [];
    mathColors.forEach(function (color, node) {
      if (node.style.backgroundColor !== COLORS[color].fill) node.style.backgroundColor = COLORS[color].fill;
      paintedMath.push(node);
    });
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  /* ---------- Editing segments ---------- */

  function cut(list, start, end) {
    var result = [];
    list.forEach(function (segment) {
      if (segment.end <= start || segment.start >= end) {
        result.push(segment);
        return;
      }
      if (segment.start < start) result.push({ start: segment.start, end: start, color: segment.color });
      if (segment.end > end) result.push({ start: end, end: segment.end, color: segment.color });
    });
    return result;
  }

  function mergeTouching(list) {
    var sorted = list.slice().sort(function (a, b) { return a.start - b.start; });
    var result = [];
    sorted.forEach(function (segment) {
      var last = result[result.length - 1];
      if (last && last.color === segment.color && last.end === segment.start) last.end = segment.end;
      else result.push({ start: segment.start, end: segment.end, color: segment.color });
    });
    return result;
  }

  function applyToSelection(color) {
    if (!pendingSelection) return;
    var question = pendingSelection.question;
    pendingSelection.parts.forEach(function (part) {
      var list = cut(validSegments(question, part.regionId), part.start, part.end);
      if (color) list.push({ start: part.start, end: part.end, color: color });
      if (!saved[question] || typeof saved[question] !== "object") saved[question] = {};
      if (list.length) saved[question][part.regionId] = mergeTouching(list);
      else delete saved[question][part.regionId];
    });
    if (saved[question] && !Object.keys(saved[question]).length) delete saved[question];
    persist();
    var selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    hidePanel();
    render();
  }

  function selectionHasHighlight(question, parts) {
    return parts.some(function (part) {
      return validSegments(question, part.regionId).some(function (segment) {
        return segment.start < part.end && segment.end > part.start;
      });
    });
  }

  /* ---------- Panel ---------- */

  var TRASH_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>';

  function createPanel() {
    panel = document.createElement("div");
    panel.className = "hl-panel";
    panel.id = "hl-panel";
    panel.setAttribute("role", "toolbar");
    panel.setAttribute("aria-label", "Highlight");

    COLOR_NAMES.forEach(function (name) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "hl-color";
      button.dataset.color = name;
      button.style.backgroundColor = COLORS[name].swatch;
      button.setAttribute("aria-label", "Highlight " + name);
      button.addEventListener("click", function () { applyToSelection(name); });
      panel.appendChild(button);
    });

    var trash = document.createElement("button");
    trash.type = "button";
    trash.className = "hl-trash";
    trash.id = "hl-trash";
    trash.setAttribute("aria-label", "Remove highlight");
    trash.innerHTML = TRASH_ICON;
    trash.addEventListener("click", function () { applyToSelection(null); });
    panel.appendChild(trash);

    // Pressing a panel button must not clear the text selection.
    panel.addEventListener("mousedown", function (event) { event.preventDefault(); });
    document.body.appendChild(panel);
  }

  function hidePanel() {
    pendingSelection = null;
    if (panel) panel.classList.remove("hl-visible");
  }

  function positionPanel() {
    if (!pendingSelection || !panel) return;
    var rects = pendingSelection.range.getClientRects();
    if (!rects.length) return;
    var first = rects[0];
    var last = rects[rects.length - 1];

    var view = window.visualViewport;
    var left = view ? view.offsetLeft : 0;
    var top = view ? view.offsetTop : 0;
    var width = view ? view.width : document.documentElement.clientWidth;
    var height = view ? view.height : window.innerHeight;
    var panelWidth = panel.offsetWidth;
    var panelHeight = panel.offsetHeight;

    // Touch browsers put their own selection menu above the text.
    var isTouch = window.matchMedia("(pointer: coarse)").matches;
    var y = first.top - panelHeight - PANEL_GAP;
    if (isTouch || y < top + VIEWPORT_MARGIN) y = last.bottom + PANEL_GAP;
    y = Math.max(top + VIEWPORT_MARGIN, Math.min(y, top + height - panelHeight - VIEWPORT_MARGIN));

    var anchor = rects.length === 1 ? (first.left + first.right) / 2 : first.left + panelWidth / 2;
    var x = Math.max(left + VIEWPORT_MARGIN, Math.min(anchor - panelWidth / 2, left + width - panelWidth - VIEWPORT_MARGIN));

    panel.style.left = Math.round(x) + "px";
    panel.style.top = Math.round(y) + "px";
  }

  function updateFromSelection() {
    var selection = window.getSelection();
    var question = currentQuestion();
    // Waiting for React's first commit keeps the panel out of the page during hydration.
    if (!question || !selection || selection.isCollapsed || !selection.rangeCount || typeof window.__examSecondsLeft !== "number") {
      hidePanel();
      return;
    }
    var range = selection.getRangeAt(0);
    var parts = [];
    findRegions().forEach(function (region) {
      var part = intersect(range, region);
      if (part) parts.push(part);
    });
    if (!parts.length) {
      hidePanel();
      return;
    }

    if (!panel) createPanel();
    pendingSelection = { question: question, parts: parts, range: range.cloneRange() };
    panel.querySelector("#hl-trash").disabled = !selectionHasHighlight(question, parts);
    positionPanel();
    panel.classList.add("hl-visible");
  }

  /* ---------- Events ---------- */

  document.addEventListener("selectionchange", function () {
    // With a mouse, wait for the button's release instead of following the drag.
    if (pointerIsDown) return;
    updateFromSelection();
  });

  document.addEventListener("mousedown", function (event) {
    if (panel && panel.contains(event.target)) return;
    pointerIsDown = true;
    hidePanel();
  }, true);

  document.addEventListener("mouseup", function () {
    pointerIsDown = false;
    // The selection only settles after this event.
    setTimeout(updateFromSelection, 0);
  }, true);

  // A drag that selects text inside an answer ends in a click on its label, which
  // would otherwise also choose that answer.
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target.closest || target.closest("button")) return;
    var label = target.closest("label");
    var selection = window.getSelection();
    if (!label || !selection || selection.isCollapsed || !selection.rangeCount) return;
    if (selection.getRangeAt(0).intersectsNode(label)) event.preventDefault();
  }, true);

  window.addEventListener("scroll", positionPanel, true);
  window.addEventListener("resize", positionPanel);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && pendingSelection) hidePanel();
  });

  /* ---------- Start ---------- */

  var style = document.createElement("style");
  var css =
    ".hl-panel{position:fixed;left:0;top:0;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:7px 12px;" +
    "border-radius:999px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.22);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(3px);" +
    "transition:opacity 140ms ease,transform 140ms ease,visibility 0s linear 140ms;user-select:none;-webkit-user-select:none}" +
    ".hl-panel.hl-visible{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity 140ms ease,transform 140ms ease}" +
    ".hl-color{width:28px;height:28px;padding:0;border:1px solid rgba(0,0,0,.18);border-radius:50%;cursor:pointer;touch-action:manipulation}" +
    ".hl-color:hover{box-shadow:0 0 0 2px #324dc7}" +
    ".hl-trash{display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin-left:2px;padding:0;border:0;border-radius:50%;" +
    "background:none;color:#1e1e1e;cursor:pointer;touch-action:manipulation}" +
    ".hl-trash:hover{background:#f0f0f0}" +
    ".hl-trash:disabled{color:#b5b5b5;background:none;cursor:not-allowed}" +
    ".hl-panel button:focus-visible{outline:2px solid #324dc7;outline-offset:2px}" +
    "@media (prefers-reduced-motion:reduce){.hl-panel,.hl-panel.hl-visible{transition:none}}";
  COLOR_NAMES.forEach(function (name) {
    highlights[name] = new Highlight();
    CSS.highlights.set("hl-" + name, highlights[name]);
    css += "::highlight(hl-" + name + "){background-color:" + COLORS[name].fill + "}";
  });
  style.textContent = css;
  document.head.appendChild(style);

  // Question changes and MathJax typesetting both change these nodes, which invalidates
  // the ranges. Drawing doesn't change the DOM, so this can't loop.
  new MutationObserver(queueRender).observe(document.body, { childList: true, subtree: true, characterData: true });
  queueRender();
})();
