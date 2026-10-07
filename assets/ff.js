/* Flow Formula — ff-* section interactions
   1. Header — mobile / tablet navigation panel, live cart count
   2. Carousels — reviews, UGC (arrows, dots, active card)
   3. UGC videos (play while on screen, pause / sound buttons)
   4. FAQ accordion
   5. Newsletter form (client-side validation; Shopify handles the submit)
   6. Product page — gallery, buy form, details accordion, ingredients

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

  /* Keep the header cart badge in sync. Dawn's cart scripts (and dizzy.js)
     publish cartUpdate after every change; pubsub.js loads before this file. */
  function renderCartCount(count) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ff-cart]"), function (link) {
      var badge = link.querySelector("[data-ff-cart-count]");
      var template = count === 1 ? link.dataset.labelOne : link.dataset.labelOther;
      link.setAttribute("aria-label", count > 0 ? link.dataset.label + ", " + template.replace("[count]", count) : link.dataset.label);
      if (badge) {
        badge.textContent = String(Math.min(count, 99));
        badge.hidden = count === 0;
      }
    });
  }

  function watchCart() {
    if (typeof subscribe !== "function" || typeof PUB_SUB_EVENTS === "undefined") return;
    subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
      fetch(((window.routes && window.routes.cart_url) || "/cart") + ".js", { headers: { Accept: "application/json" } })
        .then(function (res) { return res.json(); })
        .then(function (cart) { renderCartCount(cart.item_count); })
        .catch(function () { /* badge keeps its last value */ });
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

  /* ------------------------------------------------------------------ *
   * 6. Product page
   * ------------------------------------------------------------------ */
  var mobile = window.matchMedia("(max-width: 767px)");

  function scrollBehavior() {
    return reduceMotion.matches ? "auto" : "smooth";
  }

  // Gallery: swipeable track of the product's images, with prev/next arrows
  function initGallery(root) {
    var track = root.querySelector("[data-gallery-track]");
    var prev = root.querySelector("[data-gallery-prev]");
    var next = root.querySelector("[data-gallery-next]");
    if (!track) return;

    var slides = Array.prototype.slice.call(track.children);
    var ticking = false;
    if (slides.length < 2) return;

    function currentIndex() {
      return Math.round(track.scrollLeft / track.clientWidth);
    }

    function goTo(index, behavior) {
      index = Math.max(0, Math.min(slides.length - 1, index));
      track.scrollTo({ left: index * track.clientWidth, behavior: behavior || scrollBehavior() });
    }

    if (prev) prev.addEventListener("click", function () { goTo(currentIndex() - 1); });
    if (next) next.addEventListener("click", function () { goTo(currentIndex() + 1); });

    function update() {
      ticking = false;
      var index = currentIndex();
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === slides.length - 1;
    }

    track.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });

    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(currentIndex() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(currentIndex() - 1); }
    });

    update();
  }

  /* Buy form: plan cards mirror their radio, the hidden selling_plan input
     follows the chosen plan (so the dynamic checkout button agrees), and the
     add goes through the AJAX cart into Dawn's popup / drawer. */
  function initBuyForm(section) {
    var form = section.querySelector("[data-ff-buy-form]");
    var configEl = section.querySelector("[data-ff-product-config]");
    if (!form || !configEl) return;

    var config = JSON.parse(configEl.textContent);
    var plans = Array.prototype.slice.call(form.querySelectorAll(".plan"));
    var planInput = form.querySelector("[data-ff-plan]");
    var qty = form.querySelector(".qty__input");
    var dec = form.querySelector("[data-qty-dec]");
    var inc = form.querySelector("[data-qty-inc]");
    var submit = form.querySelector('button[type="submit"]');
    var errorEl = form.querySelector("[data-ff-buy-error]");
    var sticky = section.querySelector("[data-ff-sticky-atc]");
    var stickyQty = sticky && sticky.querySelector(".qty__input");
    var stickyDec = sticky && sticky.querySelector("[data-qty-dec]");
    var stickyInc = sticky && sticky.querySelector("[data-qty-inc]");
    var stickyAdd = sticky && sticky.querySelector("[data-ff-sticky-add]");
    var min = parseInt(qty.min, 10) || 1;
    var max = parseInt(qty.max, 10) || 99;
    var busy = false;

    function syncPlans() {
      var plan = "";
      plans.forEach(function (card) {
        var input = card.querySelector(".plan__input");
        card.classList.toggle("is-selected", input.checked);
        if (input.checked) plan = input.value;
      });
      if (planInput) {
        planInput.value = plan;
        planInput.disabled = !plan;
      }
    }

    function setQty(value) {
      var n = parseInt(value, 10);
      if (isNaN(n)) n = min;
      n = Math.min(max, Math.max(min, n));
      qty.value = n;
      dec.disabled = busy || n <= min;
      inc.disabled = busy || n >= max;
      if (sticky) {
        stickyQty.value = n;
        stickyDec.disabled = dec.disabled;
        stickyInc.disabled = inc.disabled;
      }
    }

    function setBusy(state) {
      busy = state;
      submit.disabled = busy || !config.available;
      submit.setAttribute("aria-busy", String(busy));
      submit.textContent = !config.available ? config.soldOutLabel : busy ? config.addingLabel : config.addLabel;
      if (stickyAdd) {
        stickyAdd.disabled = submit.disabled;
        stickyAdd.setAttribute("aria-busy", String(busy));
        stickyAdd.textContent = submit.textContent;
      }
      setQty(qty.value);
    }

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
    }

    form.addEventListener("change", function (e) {
      if (e.target.classList.contains("plan__input")) syncPlans();
    });
    dec.addEventListener("click", function () { setQty(+qty.value - 1); });
    inc.addEventListener("click", function () { setQty(+qty.value + 1); });
    qty.addEventListener("change", function () { setQty(qty.value); });

    if (sticky) {
      stickyDec.addEventListener("click", function () { setQty(+qty.value - 1); });
      stickyInc.addEventListener("click", function () { setQty(+qty.value + 1); });
      stickyQty.addEventListener("change", function () { setQty(stickyQty.value); });
      // Submit the real form so plan, quantity and errors all go through one path
      stickyAdd.addEventListener("click", function () {
        if (form.requestSubmit) form.requestSubmit(submit);
        else submit.click();
      });
      initStickyAtc(sticky, form.querySelector(".buy-form__row"));
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy || !config.available) return;
      showError("");
      setBusy(true);

      var cart = document.querySelector("cart-drawer") || document.querySelector("cart-notification");
      var item = { id: Number(form.querySelector('[name="id"]').value), quantity: Number(qty.value) };
      if (planInput && !planInput.disabled) item.selling_plan = Number(planInput.value);
      var body = { items: [item] };
      if (cart && cart.getSectionsToRender) {
        body.sections = cart.getSectionsToRender().map(function (s) { return s.id; });
        body.sections_url = window.location.pathname;
        if (cart.setActiveElement) cart.setActiveElement(document.activeElement);
      }

      var routes = window.routes || {};
      fetch((routes.cart_add_url || "/cart/add") + ".js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body)
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.status) throw new Error(data.description || data.message);
          // Dawn declares these as top-level lexical globals (not window props)
          if (typeof publish === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: "ff-main-product", productVariantId: item.id, cartData: data });
          }

          var cartUrl = routes.cart_url || "/cart";
          if (config.afterAdd === "checkout") {
            window.location.assign(cartUrl.replace(/cart$/, "checkout"));
            return;
          }
          if (!cart || !cart.renderContents) {
            window.location.assign(cartUrl);
            return;
          }
          // Dawn expects a single line item shape (id / key) plus the rendered sections
          var first = (data.items && data.items[0]) || {};
          cart.classList.remove("is-empty");
          cart.renderContents(Object.assign({}, first, { sections: data.sections }));
          setBusy(false);
        })
        .catch(function (error) {
          setBusy(false);
          showError(error.message || "Something went wrong. Please try again.");
        });
    });

    // Back from checkout (bfcache): reset the button
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) setBusy(false);
    });

    syncPlans();
    setQty(qty.value);
  }

  /* Sticky add to basket: shown only while neither the buy form's own
     button row nor the footer is in the viewport. */
  function initStickyAtc(sticky, row) {
    var footer = document.querySelector(".site-footer") || document.querySelector("footer");
    var onScreen = new Map();

    function update() {
      var show = !Array.from(onScreen.values()).some(Boolean);
      sticky.classList.toggle("is-visible", show);
      sticky.setAttribute("aria-hidden", String(!show));
      sticky.inert = !show;
    }

    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { onScreen.set(entry.target, entry.isIntersecting); });
      update();
    });
    [row, footer].forEach(function (el) {
      if (el) observer.observe(el);
    });
  }

  /* Details accordion: items toggle independently. Items marked
     data-open-from="768" start open only at or above that width. */
  function initDetails(root) {
    var items = Array.prototype.slice.call(root.querySelectorAll(".pdp-acc__item"));

    function setItem(item, open) {
      item.classList.toggle("is-open", open);
      item.querySelector(".pdp-acc__q").setAttribute("aria-expanded", String(open));
    }

    items.forEach(function (item) {
      var button = item.querySelector(".pdp-acc__q");
      if (!button) return;
      var from = item.getAttribute("data-open-from");
      if (from) setItem(item, window.matchMedia("(min-width: " + from + "px)").matches);
      button.addEventListener("click", function () {
        setItem(item, !item.classList.contains("is-open"));
      });
    });

    root.addEventListener("shopify:block:select", function (e) {
      if (items.indexOf(e.target) > -1) setItem(e.target, true);
    });
  }

  /* Ingredients: a continuous marquee the visitor can still take over by hand
     (same behaviour as the gumdum PDP ingredient cards).

     The drift advances the track's scrollLeft rather than animating a
     transform, so the track stays a real scroller: touch swipe, trackpad and
     keyboard keep working, and a drag moves the same scrollLeft the loop
     reads, so the two never disagree about where the cards are.

     The card set is cloned (as often as the screen width needs); whenever the
     scroll passes one copy it is rewound by exactly one copy, which lands on
     an identical frame. */
  function initIngredients(track) {
    var RESUME_DELAY = 500; // ms after the visitor lets go
    var cards = Array.prototype.slice.call(track.children);
    var cycle = 0;
    var carry = 0; // sub-pixel remainder; scrollLeft is integer in some browsers
    var lastTime = null;
    var interacting = false;
    var visible = true;
    var resumeTimer;
    if (!cards.length) return;

    // Clones are hidden from assistive tech and the tab order, and carry no
    // block attributes so the theme editor only targets the real cards
    function addCopy() {
      cards.forEach(function (card) {
        var clone = card.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        clone.removeAttribute("data-shopify-editor-block");
        clone.removeAttribute("id");
        clone.inert = true;
        track.appendChild(clone);
      });
    }

    // One cycle is the distance from a card to its first clone. With only a
    // few cards one clone isn't enough on wide screens: the track must be able
    // to scroll a full cycle past the viewport, or the drift parks at the end
    // before it ever reaches the wrap point.
    function measure() {
      cycle = track.children[cards.length].offsetLeft - cards[0].offsetLeft;
      while (cycle > 0 && track.scrollWidth - track.clientWidth <= cycle) addCopy();
    }

    addCopy();

    function interactStart() {
      interacting = true;
      clearTimeout(resumeTimer);
    }

    function interactEnd() {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () {
        interacting = false;
        lastTime = null;
      }, RESUME_DELAY);
    }

    ["pointerdown", "mouseenter", "focusin"].forEach(function (type) {
      track.addEventListener(type, interactStart);
    });
    ["pointerup", "pointercancel", "mouseleave", "focusout"].forEach(function (type) {
      track.addEventListener(type, interactEnd);
    });
    track.addEventListener("touchstart", interactStart, { passive: true });
    track.addEventListener("touchend", interactEnd, { passive: true });
    // A wheel has no natural end, so each event is a fresh pause
    track.addEventListener("wheel", function () { interactStart(); interactEnd(); }, { passive: true });

    // Keep the scroll inside the first copy however it was moved (drift,
    // drag, momentum, keyboard), so the visitor never reaches an end
    track.addEventListener("scroll", function () {
      if (cycle <= 0) return;
      if (track.scrollLeft >= cycle) track.scrollLeft -= cycle;
      else if (track.scrollLeft < 0) track.scrollLeft += cycle;
    }, { passive: true });

    // Theme editor: bring the selected ingredient into view and hold it there
    track.addEventListener("shopify:block:select", function (e) {
      interactStart();
      track.scrollLeft = e.target.offsetLeft - (track.clientWidth - e.target.offsetWidth) / 2;
    });
    track.addEventListener("shopify:block:deselect", interactEnd);

    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(track);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { rootMargin: "200px" }).observe(track);
    }
    // A backgrounded tab throttles rAF; reset the clock so cards don't jump
    document.addEventListener("visibilitychange", function () { lastTime = null; });

    function tick(time) {
      window.requestAnimationFrame(tick);
      if (lastTime === null) { lastTime = time; return; }
      var delta = (time - lastTime) / 1000;
      lastTime = time;
      if (interacting || !visible || cycle <= 0 || reduceMotion.matches) return;

      var speed = Number(track.dataset.speed) || 40;
      var step = Math.min(delta, 0.1) * speed + carry;
      var whole = Math.trunc(step);
      carry = step - whole;
      if (!whole) return;

      // Wrap before writing: a scrollLeft past the maximum is silently clamped
      var next = track.scrollLeft + whole;
      track.scrollLeft = next >= cycle ? next - cycle : next;
    }

    measure();
    window.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ */
  function init(scope) {
    each(scope, "[data-ff-header]", initNav);
    each(scope, "[data-carousel]", initCarousel);
    each(scope, "[data-ugc]", initVideos);
    each(scope, "[data-accordion]", initAccordion);
    each(scope, "[data-join-form]", initJoinForm);
    each(scope, "[data-ff-gallery]", initGallery);
    each(scope, "[data-ff-product]", initBuyForm);
    each(scope, "[data-ff-details]", initDetails);
    each(scope, "[data-ff-ingredients]", initIngredients);
  }

  window.FlowFormula = { init: init };

  watchCart();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); });
  } else {
    init(document);
  }

  document.addEventListener("shopify:section:load", function (e) {
    init(e.target);
  });
})();
