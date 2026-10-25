/* Flow Formula — Ingredient list (sections/ff-ingredient-list.liquid)
   1. Accordion — one ingredient open at a time, or several when the section
      allows it (data-multiple). The first may start open from the server.
   2. Optional fade in when the section scrolls into view

   Can be included once per section on a page: the global guard keeps it to
   a single run, and each section marks itself once initialised. */

(function () {
  "use strict";

  if (window.FlowFormulaIngredientList) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var designMode = !!(window.Shopify && window.Shopify.designMode);

  /* ------------------------------------------------------------------ *
   * 1. Accordion
   * ------------------------------------------------------------------ */
  function setItem(item, open) {
    var button = item.querySelector(".ingredient-list__toggle");
    if (!button) return;
    item.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  function initAccordion(section) {
    var items = Array.prototype.slice.call(section.querySelectorAll(".ingredient-list__item"));
    var multiple = section.getAttribute("data-multiple") === "true";

    function toggle(item, open) {
      if (open && !multiple) {
        items.forEach(function (other) {
          if (other !== item) setItem(other, false);
        });
      }
      setItem(item, open);
    }

    items.forEach(function (item) {
      var button = item.querySelector(".ingredient-list__toggle");
      if (!button) return;
      button.addEventListener("click", function () {
        toggle(item, !item.classList.contains("is-open"));
      });
    });

    // Theme editor: open the ingredient picked in the sidebar
    section.addEventListener("shopify:block:select", function (event) {
      if (items.indexOf(event.target) > -1) toggle(event.target, true);
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Fade in
   * ------------------------------------------------------------------ */
  var observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              entry.target.setAttribute("data-reveal", "shown");
              observer.unobserve(entry.target);
            });
          },
          { rootMargin: "0px 0px -15% 0px" }
        )
      : null;

  function initReveal(section) {
    if (!section.classList.contains("ingredient-list--reveal")) return;
    // Show straight away in the theme editor or when motion is reduced
    if (!observer || designMode || reduceMotion.matches) return;
    section.setAttribute("data-reveal", "pending");
    observer.observe(section);
  }

  /* ------------------------------------------------------------------ */
  function init(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-ff-ingredient-list]"), function (section) {
      if (section.ffIngredientListReady) return;
      section.ffIngredientListReady = true;

      initAccordion(section);
      initReveal(section);
    });
  }

  window.FlowFormulaIngredientList = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }

  // Theme editor re-renders a section in place when its settings change
  document.addEventListener("shopify:section:load", function (event) {
    init(event.target);
  });
})();
