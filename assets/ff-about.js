/* Flow Formula — About page (ff-about-hero, ff-about-story, ff-about-values)
   1. Hero — fades the image in once loaded, and blends the background from
      the top colour into the bottom one as the page scrolls
   2. Story — desktop: stretches the section into a scroll track so the card
      stays pinned while the text moves up through it; mobile: scrolls the
      text inside a short window. Both drive the artwork (--p, 0 → 1).
      Falls back to showing all the text when motion is reduced.
   3. Values — plays the artwork loops only while the section is on screen

   Included by each section, so it can load more than once per page: the
   global guard keeps it to a single run, and sections mark themselves once
   initialised. Sections removed by the theme editor drop out of the scroll
   loop on their own. */

(function () {
  "use strict";

  if (window.FlowFormulaAbout) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var desktop = window.matchMedia("(min-width: 1024px)");
  var hasObserver = "IntersectionObserver" in window;

  var heroes = [];
  var stories = [];

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function viewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight;
  }

  /* ------------------------------------------------------------------ *
   * 1. Hero
   * ------------------------------------------------------------------ */
  function initHero(section) {
    Array.prototype.forEach.call(section.querySelectorAll("img.about-hero__img"), function (img) {
      if (img.complete && img.naturalWidth > 0) return;
      img.classList.add("is-loading");
      function done() {
        img.classList.remove("is-loading");
      }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });

    if (section.classList.contains("about-hero--bg-scroll")) {
      heroes.push(section);
      updateHero(section);
    }
  }

  function updateHero(section) {
    var rect = section.getBoundingClientRect();
    var top = rect.top + window.scrollY;
    // Starts blending once the page scrolls (or as the hero comes into view
    // if it sits lower down the page), finished after 80% of its height
    var start = Math.max(0, top - viewportHeight() / 2);
    var progress = clamp((window.scrollY - start) / (rect.height * 0.8 || 1));
    section.style.setProperty("--ah-hint", (100 - progress * 40).toFixed(1) + "%");
  }

  /* ------------------------------------------------------------------ *
   * 2. Story
   * ------------------------------------------------------------------ */
  function Story(section) {
    this.section = section;
    this.frame = section.querySelector("[data-story-frame]");
    this.clip = section.querySelector("[data-story-clip]");
    this.text = section.querySelector("[data-story-text]");
    this.animateArt = section.classList.contains("about-story--animate");
    this.mode = "static";
  }

  Story.prototype.reset = function () {
    this.section.classList.remove("is-pinned", "is-windowed");
    this.frame.style.height = "";
    this.text.style.transform = "";
    this.text.style.transition = "";
    this.section.style.removeProperty("--p");
    this.mode = "static";
  };

  Story.prototype.layout = function () {
    this.reset();
    if (!this.frame || !this.clip || !this.text) return;
    if (!this.section.classList.contains("about-story--scroll") || reduceMotion.matches) return;

    var vh = viewportHeight();

    if (desktop.matches) {
      this.section.classList.add("is-pinned");
      var clipHeight = this.clip.clientHeight;
      var overflow = Math.max(0, this.text.offsetHeight - clipHeight);
      // The text starts a third of the way down the window and leaves the
      // same distance above it, so it enters and exits through the fades
      var pad = Math.round(clipHeight * 0.35);
      var framePad = parseFloat(getComputedStyle(this.frame).paddingTop) || 0;
      this.frame.style.height = vh + pad + overflow + pad + framePad + "px";
      this.startY = pad;
      this.endY = -(overflow + pad);
      this.frameTop = this.frame.getBoundingClientRect().top + window.scrollY;
      this.range = this.frame.offsetHeight - vh;
      this.mode = "pinned";
    } else {
      this.section.classList.add("is-windowed");
      this.overflow = Math.max(0, this.text.offsetHeight - this.clip.clientHeight);
      if (this.overflow <= 0) {
        // Short story: nothing to scroll, so show it as it is
        this.section.classList.remove("is-windowed");
      } else {
        this.text.style.transition = "transform 0.15s linear";
        this.mode = "windowed";
      }
    }

    this.update();
  };

  Story.prototype.update = function () {
    var progress;

    if (this.mode === "pinned") {
      if (this.range <= 0) return;
      progress = clamp((window.scrollY - this.frameTop) / this.range);
      var y = this.startY + (this.endY - this.startY) * progress;
      this.text.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
    } else if (this.mode === "windowed") {
      var rect = this.clip.getBoundingClientRect();
      var vh = viewportHeight();
      var startAt = vh * 0.65;
      var endAt = vh * 0.05;
      progress = clamp((startAt - rect.top) / (startAt - endAt));
      this.text.style.transform = "translate3d(0," + (-this.overflow * progress).toFixed(1) + "px,0)";
    } else {
      return;
    }

    if (this.animateArt) this.section.style.setProperty("--p", progress.toFixed(3));
  };

  function initStory(section) {
    var story = new Story(section);
    stories.push(story);
    story.layout();
  }

  /* ------------------------------------------------------------------ *
   * 3. Values
   * ------------------------------------------------------------------ */
  var valuesObserver = hasObserver
    ? new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            entry.target.toggleAttribute("data-playing", entry.isIntersecting);
          });
        },
        { threshold: 0.05 }
      )
    : null;

  function initValues(section) {
    if (!section.classList.contains("about-values--animate")) return;
    if (valuesObserver) valuesObserver.observe(section);
    else section.setAttribute("data-playing", "");
  }

  /* ------------------------------------------------------------------ *
   * Shared scroll / resize loop
   * ------------------------------------------------------------------ */
  function prune() {
    heroes = heroes.filter(function (el) {
      return el.isConnected;
    });
    stories = stories.filter(function (story) {
      return story.section.isConnected;
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      prune();
      heroes.forEach(updateHero);
      stories.forEach(function (story) {
        story.update();
      });
    });
  }

  var resizeTimer;
  function relayout() {
    prune();
    stories.forEach(function (story) {
      story.layout();
    });
    heroes.forEach(updateHero);
  }
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 200);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  // Text height changes once web fonts and images arrive
  window.addEventListener("load", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", relayout);

  /* ------------------------------------------------------------------ */
  function init(scope) {
    var map = [
      ["[data-ff-about-hero]", initHero],
      ["[data-ff-about-story]", initStory],
      ["[data-ff-about-values]", initValues]
    ];
    map.forEach(function (pair) {
      Array.prototype.forEach.call(scope.querySelectorAll(pair[0]), function (section) {
        if (section.ffAboutReady) return;
        section.ffAboutReady = true;
        pair[1](section);
      });
    });
  }

  window.FlowFormulaAbout = { init: init, relayout: relayout };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }

  // Theme editor re-renders a section in place when its settings change;
  // the new section changes the page height, so every story re-measures
  document.addEventListener("shopify:section:load", function (event) {
    init(event.target);
    relayout();
  });
  document.addEventListener("shopify:section:unload", function () {
    setTimeout(relayout, 0);
  });
})();
