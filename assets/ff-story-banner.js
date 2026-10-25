/* Flow Formula — Story banner (sections/ff-story-banner.liquid)
   1. Background video — pause / play button, stops while off screen, and
      stays paused for visitors who prefer reduced motion
   2. Parallax — the background drifts slower than the page while in view
   3. Optional fade in when the section scrolls into view

   Can be included once per section on a page: the global guard keeps it to
   a single run, and each section marks itself once initialised. */

(function () {
  "use strict";

  if (window.FlowFormulaStoryBanner) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var designMode = !!(window.Shopify && window.Shopify.designMode);
  var hasObserver = "IntersectionObserver" in window;

  /* ------------------------------------------------------------------ *
   * 1. Background video
   * ------------------------------------------------------------------ */
  function initVideo(section) {
    var video = section.querySelector(".story-banner__video");
    if (!video) return;
    var button = section.querySelector("[data-ff-story-pause]");
    var userPaused = reduceMotion.matches;
    var inView = true;

    function render() {
      if (!button) return;
      button.classList.toggle("is-paused", video.paused);
      button.setAttribute(
        "aria-label",
        button.getAttribute(video.paused ? "data-label-play" : "data-label-pause")
      );
    }

    function sync() {
      if (userPaused || !inView) {
        video.pause();
      } else {
        var playing = video.play();
        // Autoplay can be refused (low power mode); leave it paused quietly
        if (playing && playing.catch) playing.catch(render);
      }
      render();
    }

    video.addEventListener("play", render);
    video.addEventListener("pause", render);

    if (button) {
      button.addEventListener("click", function () {
        userPaused = !video.paused;
        sync();
      });
    }

    if (hasObserver) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }).observe(section);
    }

    sync();
  }

  /* ------------------------------------------------------------------ *
   * 2. Parallax
   * ------------------------------------------------------------------ */
  function initParallax(section) {
    if (!section.classList.contains("story-banner--parallax")) return;
    var frame = section.querySelector(".story-banner__frame");
    var media = section.querySelector(".story-banner__media");
    if (!frame || !media) return;

    var ticking = false;
    var active = !hasObserver;

    function update() {
      ticking = false;
      if (reduceMotion.matches) {
        media.style.setProperty("--sb-shift", "0px");
        return;
      }
      var rect = frame.getBoundingClientRect();
      var viewport = window.innerHeight || document.documentElement.clientHeight;
      // -1 as the frame enters at the bottom, 1 as it leaves at the top
      var progress = (viewport / 2 - (rect.top + rect.height / 2)) / ((viewport + rect.height) / 2);
      progress = Math.max(-1, Math.min(1, progress));
      // The media is 12% taller at each end, so shift up to 10% of the frame
      media.style.setProperty("--sb-shift", (progress * rect.height * 0.1).toFixed(1) + "px");
    }

    function request() {
      if (!active || ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    if (hasObserver) {
      new IntersectionObserver(function (entries) {
        active = entries[0].isIntersecting;
        request();
      }).observe(frame);
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
  }

  /* ------------------------------------------------------------------ *
   * 3. Fade in
   * ------------------------------------------------------------------ */
  var revealObserver = hasObserver
    ? new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.setAttribute("data-reveal", "shown");
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -20% 0px" }
      )
    : null;

  function initReveal(section) {
    if (!section.classList.contains("story-banner--reveal")) return;
    // Show straight away in the theme editor or when motion is reduced
    if (!revealObserver || designMode || reduceMotion.matches) return;
    section.setAttribute("data-reveal", "pending");
    revealObserver.observe(section);
  }

  /* ------------------------------------------------------------------ */
  function init(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-ff-story-banner]"), function (section) {
      if (section.ffStoryBannerReady) return;
      section.ffStoryBannerReady = true;

      initVideo(section);
      initParallax(section);
      initReveal(section);
    });
  }

  window.FlowFormulaStoryBanner = { init: init };

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
