/* Flow Formula — ff-* section interactions
   1. Mobile / tablet navigation panel
   2. Carousels — reviews, UGC (arrows, dots, active card)
   3. UGC videos (play while on screen, pause / sound buttons)
   4. FAQ accordion
   5. Newsletter form (client-side validation; Shopify handles the submit)

   Every ff-* section renders ff-assets, so this file can be included more
   than once per page: the global guard keeps it to a single run, and each
   component marks itself so re-initialising a scope is harmless. */

(function () {
  "use strict";

  if (window.FlowFormula) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Runs fn once per element per component; one element can host several
  // components (the UGC section is both a carousel and a video player).
  function each(scope, selector, fn) {
    Array.prototype.forEach.call(scope.querySelectorAll(selector), function (el) {
      var done = el.ffReady || (el.ffReady = {});
      if (done[selector]) return;
      done[selector] = true;
      fn(el);
    });
  }

  /* ------------------------------------------------------------------ *
   * 1. Navigation
   * ------------------------------------------------------------------ */
  function initNav(header) {
    var toggle = header.querySelector(".nav-toggle");
    var nav = header.querySelector(".primary-nav");
    if (!toggle || !nav) return;

    var desktop = window.matchMedia("(min-width: 1280px)");

    function isOpen() {
      return toggle.getAttribute("aria-expanded") === "true";
    }

    function setOpen(open, returnFocus) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? toggle.dataset.labelClose : toggle.dataset.labelOpen);
      header.classList.toggle("is-nav-open", open);
      if (open) {
        var first = nav.querySelector("a");
        if (first) first.focus({ preventScroll: true });
      } else if (returnFocus) {
        toggle.focus();
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(!isOpen());
    });

    // Close after choosing a link
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a") && isOpen()) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) setOpen(false, true);
    });

    document.addEventListener("click", function (e) {
      if (isOpen() && !header.contains(e.target)) setOpen(false);
    });

    // Close when keyboard focus moves out of the header
    header.addEventListener("focusout", function (e) {
      if (isOpen() && e.relatedTarget && !header.contains(e.relatedTarget)) {
        setOpen(false);
      }
    });

    // The panel doesn't exist on desktop, so reset state when crossing the breakpoint
    desktop.addEventListener("change", function (e) {
      if (e.matches && isOpen()) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Carousel
   *    The track scrolls natively (swipe / trackpad / keyboard); the
   *    arrows and dots just drive and reflect that scroll position.
   * ------------------------------------------------------------------ */
  function initCarousel(root) {
    var track = root.querySelector("[data-carousel-track]");
    var dotsWrap = root.querySelector("[data-carousel-dots]");
    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    var controls = root.querySelector("[data-carousel-controls]");
    var dotLabel = root.dataset.dotLabel || "Show slide [index] of [count]";
    if (!track) return;

    var cards = Array.prototype.slice.call(track.children);
    var pageCount = 0;
    var ticking = false;

    function step() {
      if (cards.length < 2) return track.clientWidth;
      return cards[1].offsetLeft - cards[0].offsetLeft;
    }

    function maxScroll() {
      return Math.max(0, track.scrollWidth - track.clientWidth);
    }

    function currentIndex() {
      var max = maxScroll();
      if (max <= 1) return 0;
      if (track.scrollLeft >= max - 2) return pageCount - 1;
      return Math.min(pageCount - 1, Math.round(track.scrollLeft / step()));
    }

    function goTo(index) {
      var target = Math.min(index * step(), maxScroll());
      track.scrollTo({ left: target, behavior: reduceMotion.matches ? "auto" : "smooth" });
    }

    function buildDots() {
      var max = maxScroll();
      pageCount = max > 1 ? Math.round(max / step()) + 1 : 1;
      if (controls) controls.classList.toggle("is-static", pageCount <= 1);
      if (!dotsWrap) return;

      dotsWrap.textContent = "";
      for (var i = 0; i < pageCount; i++) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", dotLabel.replace("[index]", i + 1).replace("[count]", pageCount));
        dot.addEventListener("click", goTo.bind(null, i));
        dotsWrap.appendChild(dot);
      }
    }

    function update() {
      ticking = false;
      var index = currentIndex();

      if (dotsWrap) {
        Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
          if (i === index) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
      }

      cards.forEach(function (card, i) {
        card.classList.toggle("is-active", i === index);
      });

      if (prev) prev.disabled = track.scrollLeft <= 1;
      if (next) next.disabled = track.scrollLeft >= maxScroll() - 1;
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    if (prev) prev.addEventListener("click", function () { goTo(currentIndex() - 1); });
    if (next) next.addEventListener("click", function () { goTo(currentIndex() + 1); });

    track.addEventListener("scroll", requestUpdate, { passive: true });

    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(currentIndex() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(currentIndex() - 1); }
    });

    // Theme editor: bring the selected block into view
    root.addEventListener("shopify:block:select", function (e) {
      var i = cards.indexOf(e.target);
      if (i > -1) track.scrollTo({ left: Math.min(i * step(), maxScroll()), behavior: "auto" });
    });

    function refresh() {
      buildDots();
      update();
    }

    if ("ResizeObserver" in window) {
      new ResizeObserver(refresh).observe(track);
    } else {
      window.addEventListener("resize", refresh);
    }
    refresh();
  }

  /* ------------------------------------------------------------------ *
   * 3. UGC videos
   *    With autoplay on, each video plays muted while mostly on screen and
   *    pauses when scrolled away. Pressing pause keeps it paused until the
   *    visitor presses play again. Only one video has sound at a time.
   * ------------------------------------------------------------------ */
  function initVideos(root) {
    var labels = root.dataset;
    var autoplay = root.hasAttribute("data-autoplay") && !reduceMotion.matches;
    var players = [];

    Array.prototype.forEach.call(root.querySelectorAll("[data-ugc-video]"), function (item) {
      var video = item.querySelector("video");
      var playButton = item.querySelector("[data-ugc-play]");
      var soundButton = item.querySelector("[data-ugc-sound]");
      if (!video) return;

      var player = {
        item: item,
        userPaused: !autoplay,
        play: function () {
          var attempt = video.play();
          if (attempt && attempt.catch) attempt.catch(function () {});
        },
        pause: function () { video.pause(); },
        setMuted: function (muted) {
          video.muted = muted;
          item.classList.toggle("is-unmuted", !muted);
          if (soundButton) soundButton.setAttribute("aria-label", muted ? labels.labelUnmute : labels.labelMute);
        }
      };

      function syncPlaying() {
        var playing = !video.paused;
        item.classList.toggle("is-playing", playing);
        if (playButton) playButton.setAttribute("aria-label", playing ? labels.labelPause : labels.labelPlay);
      }

      video.addEventListener("play", syncPlaying);
      video.addEventListener("pause", syncPlaying);
      player.setMuted(true);

      if (playButton) playButton.addEventListener("click", function () {
        player.userPaused = !video.paused;
        if (video.paused) player.play();
        else player.pause();
      });

      if (soundButton) soundButton.addEventListener("click", function () {
        var unmute = video.muted;
        if (unmute) {
          players.forEach(function (other) { if (other !== player) other.setMuted(true); });
          player.userPaused = false;
          player.play();
        }
        player.setMuted(!unmute);
      });

      players.push(player);
    });

    if (!players.length) return;

    if (!("IntersectionObserver" in window)) {
      if (autoplay) players.forEach(function (p) { p.play(); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var player = players.filter(function (p) { return p.item === entry.target; })[0];
        if (!player) return;
        if (entry.isIntersecting && !player.userPaused) player.play();
        else if (!entry.isIntersecting) player.pause();
      });
    }, { threshold: 0.6 });

    players.forEach(function (p) { observer.observe(p.item); });
  }

  /* ------------------------------------------------------------------ *
   * 4. FAQ accordion — one open item per list
   * ------------------------------------------------------------------ */
  function initAccordion(root) {
    var items = Array.prototype.slice.call(root.querySelectorAll(".faq__item"));

    function setItem(item, open) {
      var button = item.querySelector(".faq__q");
      item.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
    }

    function openOnly(item, open) {
      items.forEach(function (other) {
        if (other !== item) setItem(other, false);
      });
      setItem(item, open);
    }

    items.forEach(function (item) {
      var button = item.querySelector(".faq__q");
      if (!button) return;
      button.addEventListener("click", function () {
        openOnly(item, !item.classList.contains("is-open"));
      });
    });

    // Theme editor: open the selected question
    root.addEventListener("shopify:block:select", function (e) {
      if (items.indexOf(e.target) > -1) openOnly(e.target, true);
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. Newsletter form
   *    Validates client-side; a valid submit posts to Shopify's customer
   *    form and the section renders the success / error message.
   * ------------------------------------------------------------------ */
  function initJoinForm(form) {
    var input = form.querySelector('input[type="email"]');
    var status = input && document.getElementById(input.getAttribute("aria-describedby"));
    if (!input || !status) return;

    function show(message, type) {
      status.textContent = message;
      status.classList.toggle("is-error", type === "error");
      status.classList.toggle("is-success", type === "success");
    }

    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true" && input.validity.valid) {
        input.removeAttribute("aria-invalid");
        show("", null);
      }
    });

    form.addEventListener("submit", function (e) {
      input.value = input.value.trim();

      if (!input.value || !input.validity.valid) {
        e.preventDefault();
        input.setAttribute("aria-invalid", "true");
        show(form.dataset.errorMessage, "error");
        input.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  function init(scope) {
    each(scope, "[data-ff-header]", initNav);
    each(scope, "[data-carousel]", initCarousel);
    each(scope, "[data-ugc]", initVideos);
    each(scope, "[data-accordion]", initAccordion);
    each(scope, "[data-join-form]", initJoinForm);
  }

  window.FlowFormula = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); });
  } else {
    init(document);
  }

  document.addEventListener("shopify:section:load", function (e) {
    init(e.target);
  });
})();
