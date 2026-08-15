/**
 * Wires the existing hardcoded "98%" + charging-battery icon (top-right
 * corner status indicator, present identically on test.html, test2.html,
 * test3.html, test4.html — clearly one shared Header/StatusBar component
 * in the original source) to the real device battery state via the
 * Battery Status API (navigator.getBattery()).
 *
 * Single shared implementation referenced from all pages that show this
 * indicator, so the logic is not duplicated per page.
 *
 * Behavior:
 * - battery.level -> replaces the "98%" text with the real rounded percent.
 * - battery.charging === true  -> keeps the existing charging-bolt icon
 *   (the icon already baked into the page), so appearance is unchanged
 *   whenever the device actually is charging.
 * - battery.charging === false -> swaps to a plain battery icon (no bolt).
 * - 'levelchange' / 'chargingchange' keep the UI live, no reload needed.
 * - No Battery API support, or getBattery() rejects -> the original
 *   static markup is left exactly as it was (neutral fallback, no crash,
 *   no invented values).
 */
(function () {
  "use strict";

  function findIndicator() {
    var spans = document.querySelectorAll("span.ordinary-font");
    for (var i = 0; i < spans.length; i++) {
      if (/^\d{1,3}%$/.test(spans[i].textContent.trim())) {
        return spans[i];
      }
    }
    return null;
  }

  function buildPlainBatteryIcon(referenceSvg) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", referenceSvg.getAttribute("class") || "text-xl");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.style.display = "none";

    var outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outline.setAttribute("x", "2");
    outline.setAttribute("y", "7");
    outline.setAttribute("width", "18");
    outline.setAttribute("height", "10");
    outline.setAttribute("rx", "2");
    outline.setAttribute("stroke-width", "1.6");

    var nub = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    nub.setAttribute("x", "21");
    nub.setAttribute("y", "10");
    nub.setAttribute("width", "1.6");
    nub.setAttribute("height", "4");
    nub.setAttribute("rx", "0.8");
    nub.setAttribute("fill", "currentColor");
    nub.setAttribute("stroke", "none");

    var fill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    fill.setAttribute("x", "4");
    fill.setAttribute("y", "9");
    fill.setAttribute("width", "14");
    fill.setAttribute("height", "6");
    fill.setAttribute("rx", "1");
    fill.setAttribute("fill", "currentColor");
    fill.setAttribute("stroke", "none");

    svg.appendChild(outline);
    svg.appendChild(nub);
    svg.appendChild(fill);

    return { svg: svg, fill: fill };
  }

  function initBattery() {
    var percentEl = findIndicator();
    if (!percentEl) return;

    var container = percentEl.parentElement;
    var chargingIconEl = container.querySelector("svg");
    if (!chargingIconEl) return;

    if (!("getBattery" in navigator)) {
      // Battery API unsupported: leave the existing static markup as-is.
      return;
    }

    navigator
      .getBattery()
      .then(function (battery) {
        var plain = buildPlainBatteryIcon(chargingIconEl);
        chargingIconEl.parentNode.insertBefore(plain.svg, chargingIconEl.nextSibling);

        function render() {
          var pct = Math.round(battery.level * 100);
          percentEl.textContent = pct + "%";

          if (battery.charging) {
            chargingIconEl.style.display = "";
            plain.svg.style.display = "none";
          } else {
            chargingIconEl.style.display = "none";
            plain.svg.style.display = "";
            var fillWidth = Math.max(0, Math.min(14, (14 * pct) / 100));
            plain.fill.setAttribute("width", fillWidth.toFixed(2));
          }
        }

        render();
        battery.addEventListener("levelchange", render);
        battery.addEventListener("chargingchange", render);
      })
      .catch(function (err) {
        // getBattery() rejected: leave existing static markup untouched.
        console.error("[battery-status] getBattery() failed:", err);
      });
  }

  // Wait for the window "load" event (fires after the Next.js client
  // bundles have been fetched and executed, i.e. after React hydration's
  // initial synchronous pass) before touching any server-rendered DOM.
  // Mutating this span/svg any earlier races React's hydrateRoot() walk
  // over the same nodes and throws a hydration-mismatch error (React #418).
  if (document.readyState === "complete") {
    initBattery();
  } else {
    window.addEventListener("load", initBattery);
  }
})();
