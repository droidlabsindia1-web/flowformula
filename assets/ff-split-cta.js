/* Flow Formula — Split CTA (sections/ff-split-cta.liquid)
   1. Button with no link scrolls to the product page's add to cart form
   2. Optional fade in when the section scrolls into view

   Can be included once per section on a page: the global guard keeps it to
   a single run, and each section marks itself once initialised. */

(function () {
  "use strict";

  if (window.FlowFormulaSplitCta) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var designMode = !!(window.Shopify && window.Shopify.designMode);

  /* ------------------------------------------------------------------ *
   * 1. Scroll to the buy form
   * ------------------------------------------------------------------ */
  function findBuyForm() {
    return (
      document.querySelector("[data-ff-product] .buybox") ||
      document.querySelector("[data-ff-product]") ||
      document.querySelector('form[action*="/cart/add"]')
    );
  }

  // Height of a sticky / fixed header, so the form isn't tucked under it
  function headerOffset() {
    var header = document.querySelector(".site-header, sticky-header, .section-header");
    if (!header) return 0;
    var position = window.getComputedStyle(header).position;
    if (position !== "sticky" && position !== "fixed") return 0;
    return header.getBoundingClientRect().height;
  }

  function scrollToBuy(event) {
    var target = findBuyForm();
    if (!target) return; // No form on this page, let the link behave normally

    event.preventDefault();
    var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset() - 16;
    window.scrollTo({ top: Math.max(top, 0), behavior: reduceMotion.matches ? "auto" : "smooth" });

    var button = target.querySelector('[name="add"], button[type="submit"]');
    if (button) button.focus({ preventScroll: true });
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
    if (!section.classList.contains("split-cta--reveal")) return;
    // Show straight away in the theme editor or when motion is reduced
    if (!observer || designMode || reduceMotion.matches) return;
    section.setAttribute("data-reveal", "pending");
    observer.observe(section);
  }

  /* ------------------------------------------------------------------ */
  function init(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-ff-split-cta]"), function (section) {
      if (section.ffSplitCtaReady) return;
      section.ffSplitCtaReady = true;

      var button = section.querySelector("[data-ff-scroll-to-buy]");
      if (button) button.addEventListener("click", scrollToBuy);

      initReveal(section);
    });
  }

  window.FlowFormulaSplitCta = { init: init };

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
