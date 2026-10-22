/* Flow Formula — Daily timeline (sections/ff-daily-timeline.liquid)
   Marks the timeline step crossing the middle of the screen as active, so
   CSS can fade the others (only when the "Highlight" setting is on).

   Can be included once per section on a page: the global guard keeps it to
   a single run, and each section marks itself once initialised. */

(function () {
  "use strict";

  if (window.FlowFormulaTimeline) return;

  function setActive(steps, active) {
    steps.forEach(function (step) {
      step.classList.toggle("is-active", step === active);
    });
  }

  function initTimeline(section) {
    if (section.ffTimelineReady) return;
    section.ffTimelineReady = true;

    var steps = Array.prototype.slice.call(section.querySelectorAll("[data-ff-timeline-step]"));
    if (!steps.length) return;

    section.ffTimelineSteps = steps;
    setActive(steps, steps[0]);
    section.setAttribute("data-ready", "");

    if (!("IntersectionObserver" in window)) return;

    // A thin band 30–40% down the viewport: whichever step is in it wins
    var observer = new IntersectionObserver(
      function (entries) {
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
    if (section && section.ffTimelineSteps) setActive(section.ffTimelineSteps, step);
  });
})();
