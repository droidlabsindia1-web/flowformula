/* Flow Formula — Daily timeline (sections/ff-daily-timeline.liquid)
   1. Reveal — step descriptions after the first start hidden and appear as
      visitors scroll. "pin" holds the row still (a tall wrapper with a
      sticky inner box) and reveals one step per --dt-reveal-step of scroll;
      "scroll" reveals each one as it enters the screen.
   2. Highlight — marks the step in view (or the latest revealed one while
      pinned) as active, so CSS can fade the others.

   Can be included once per section on a page: the global guard keeps it to
   a single run, and each section marks itself once initialised. */

(function () {
  "use strict";

  if (window.FlowFormulaTimeline) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var desktop = window.matchMedia("(min-width: 768px)");
  var designMode = !!(window.Shopify && window.Shopify.designMode);

  function setActive(steps, active) {
    steps.forEach(function (step) {
      step.classList.toggle("is-active", step === active);
    });
  }

  function revealUpTo(state, count) {
    if (count === state.revealed) return;
    state.revealed = count;
    state.steps.forEach(function (step, i) {
      step.classList.toggle("is-revealed", i < count);
    });
    setActive(state.steps, state.steps[count - 1]);
  }

  /* ------------------------------------------------------------------ *
   * 1a. Pin and reveal
   * ------------------------------------------------------------------ */
  function unpin(state) {
    state.pins.forEach(function (pin) {
      var inner = pin.firstElementChild;
      pin.classList.remove("is-pinned");
      pin.style.height = "";
      inner.style.top = "";
      inner.style.minHeight = "";
    });
    state.pin = null;
  }

  // Height of the box with every description open. Hidden ones are
  // collapsed, so open them all for a moment without animating, then put
  // them back (is-settling keeps the collapse from animating either).
  function measureOpen(state, inner) {
    var section = state.section;
    section.classList.add("is-measuring");
    var height = inner.offsetHeight;
    section.classList.add("is-settling");
    section.classList.remove("is-measuring");
    void section.offsetHeight;
    section.classList.remove("is-settling");
    return height;
  }

  // Sizes the active wrapper so the inner box sticks for one "distance" of
  // scroll per hidden step, plus half a step so the last one can be read.
  // The box keeps its fully open height so nothing around it moves as the
  // descriptions open. Returns false when it's too tall to hold still.
  function layoutPin(state) {
    unpin(state);

    var useDesktop = desktop.matches;
    if (!useDesktop && !state.pinMobile) return false;

    var pin = state.section.querySelector('[data-ff-pin="' + (useDesktop ? "desktop" : "mobile") + '"]');
    if (!pin) return false;

    var inner = pin.firstElementChild;
    var height = measureOpen(state, inner);
    var viewport = window.innerHeight;
    if (height > viewport - 40) return false;

    state.pin = pin;
    state.top = Math.round((viewport - height) / 2);
    inner.style.top = state.top + "px";
    inner.style.minHeight = height + "px";
    pin.style.height = height + state.distance * (state.steps.length - 0.5) + "px";
    pin.classList.add("is-pinned");
    return true;
  }

  function updatePin(state) {
    if (!state.pin) return;
    var scrolled = state.top - state.pin.getBoundingClientRect().top;
    var count = 1 + Math.floor((scrolled + state.distance / 2) / state.distance);
    revealUpTo(state, Math.max(1, Math.min(state.steps.length, count)));
  }

  /* ------------------------------------------------------------------ *
   * 1b. Reveal as each step scrolls into view (no pin)
   * ------------------------------------------------------------------ */
  function watchSteps(state) {
    if (state.watcher) return;
    if (!("IntersectionObserver" in window)) {
      revealUpTo(state, state.steps.length);
      return;
    }
    state.watcher = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var index = state.steps.indexOf(entry.target);
          if (index + 1 > state.revealed) revealUpTo(state, index + 1);
        });
      },
      { rootMargin: "0px 0px -25% 0px", threshold: 0 }
    );
    state.steps.forEach(function (step) {
      state.watcher.observe(step);
    });
  }

  function stopWatching(state) {
    if (!state.watcher) return;
    state.watcher.disconnect();
    state.watcher = null;
  }

  // Chooses pin or plain reveal for the current screen size
  function setupReveal(state) {
    if (state.mode === "pin" && layoutPin(state)) {
      stopWatching(state);
      updatePin(state);
    } else {
      watchSteps(state);
    }
  }

  function initReveal(state) {
    var section = state.section;
    state.mode = section.getAttribute("data-reveal");
    if (state.mode !== "pin" && state.mode !== "scroll") return false;
    if (designMode || reduceMotion.matches || state.steps.length < 2) return false;

    state.distance = parseInt(section.getAttribute("data-reveal-distance"), 10) || 300;
    state.pinMobile = section.hasAttribute("data-pin-mobile");
    state.pins = Array.prototype.slice.call(section.querySelectorAll("[data-ff-pin]"));
    state.revealed = 0;
    revealUpTo(state, 1);
    section.setAttribute("data-reveal-ready", "");

    setupReveal(state);

    if (state.mode !== "pin") return true;

    // One rect read per scroll event; classes only change when the count does
    window.addEventListener(
      "scroll",
      function () {
        updatePin(state);
      },
      { passive: true }
    );

    // Re-measure when the screen or the content (fonts, images) changes size
    var timer;
    function relayout() {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        setupReveal(state);
      }, 150);
    }
    window.addEventListener("resize", relayout);
    window.addEventListener("load", relayout);
    if (desktop.addEventListener) desktop.addEventListener("change", relayout);
    if ("ResizeObserver" in window) {
      var lastWidth = 0;
      new ResizeObserver(function (entries) {
        // Width changes only: the wrapper's own height changes on relayout
        var width = Math.round(entries[0].contentRect.width);
        if (width === lastWidth) return;
        lastWidth = width;
        relayout();
      }).observe(section);
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 2. Highlight the step in view
   * ------------------------------------------------------------------ */
  function initHighlight(state) {
    var steps = state.steps;
    setActive(steps, steps[0]);
    state.section.setAttribute("data-ready", "");

    if (!("IntersectionObserver" in window)) return;

    // A thin band 30–40% down the viewport: whichever step is in it wins.
    // While pinned, revealUpTo() drives the active step instead.
    var observer = new IntersectionObserver(
      function (entries) {
        if (state.pin) return;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(steps, entry.target);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    steps.forEach(function (step) {
      observer.observe(step);
    });
  }

  /* ------------------------------------------------------------------ */
  function initTimeline(section) {
    if (section.ffTimeline) return;

    var steps = Array.prototype.slice.call(section.querySelectorAll("[data-ff-timeline-step]"));
    if (!steps.length) return;

    var state = (section.ffTimeline = { section: section, steps: steps, pin: null, watcher: null });
    initHighlight(state);
    initReveal(state);
  }

  function init(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-ff-timeline]"), initTimeline);
  }

  window.FlowFormulaTimeline = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }

  // Theme editor: re-init re-rendered sections, show the step being edited
  document.addEventListener("shopify:section:load", function (event) {
    init(event.target);
  });
  document.addEventListener("shopify:block:select", function (event) {
    var step = event.target.closest && event.target.closest("[data-ff-timeline-step]");
    var section = step && step.closest("[data-ff-timeline]");
    if (section && section.ffTimeline) setActive(section.ffTimeline.steps, step);
  });
})();
