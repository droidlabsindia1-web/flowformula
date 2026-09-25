/* DIZZY sections. Each root with [data-dizzy-section] gets its initializer.
   Loaded by snippets/dizzy-assets.liquid, possibly more than once per page. */
(function () {
  'use strict';
  if (window.DIZZY) return;

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- Money (mirrors Shopify's money_format placeholders) ---------- */
  function formatMoney(cents, format) {
    var value = Number(cents) / 100;
    function withDelimiters(n, decimals, thousands, decimal) {
      var parts = n.toFixed(decimals).split('.');
      return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands || ',') + (parts[1] ? (decimal || '.') + parts[1] : '');
    }
    return (format || '{{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals': return withDelimiters(value, 0);
        case 'amount_with_comma_separator': return withDelimiters(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return withDelimiters(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator': return withDelimiters(value, 2, "'", '.');
        default: return withDelimiters(value, 2);
      }
    });
  }

  /* ---------- Cart: add via AJAX and hand the result to Dawn's drawer / notification ---------- */
  function addToCart(item) {
    var cart = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
    var body = { items: [item] };
    if (cart && cart.getSectionsToRender) {
      body.sections = cart.getSectionsToRender().map(function (s) { return s.id; });
      body.sections_url = window.location.pathname;
      if (cart.setActiveElement) cart.setActiveElement(document.activeElement);
    }
    var root = (window.routes && window.routes.cart_add_url) || '/cart/add';
    return fetch(root + '.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status) throw new Error(data.description || data.message || 'Could not add to cart');
        // Dawn declares these as top-level lexical globals (not window props).
        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'dizzy', productVariantId: item.id, cartData: data });
        }
        refreshCartCount();
        return { data: data, cart: cart };
      });
  }

  function refreshCartCount() {
    fetch(((window.routes && window.routes.cart_url) || '/cart') + '.js', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (cart) { renderCartCount(cart.item_count); })
      .catch(function () { /* count stays as rendered */ });
  }

  function renderCartCount(count) {
    var label = 'Open cart with ' + count + ' ' + (count === 1 ? 'item' : 'items');
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = String(count); });
    document.querySelectorAll('.site-header .bag-trigger, .site-header .mobile-bag-trigger').forEach(function (el) {
      el.setAttribute('aria-label', label);
    });
  }

  /* ---------- Site header ---------- */
  function scrollToTopInstantly() {
    var root = document.documentElement;
    root.style.setProperty('scroll-behavior', 'auto', 'important');
    window.scrollTo(0, 0);
    window.requestAnimationFrame(function () { root.style.removeProperty('scroll-behavior'); });
  }

  function initHeader(header) {
    // Condensed, fixed header once the page has scrolled.
    var condensed = null;
    function onScroll() {
      var next = window.scrollY > 48;
      if (next === condensed) return;
      condensed = next;
      header.classList.toggle('is-condensed', next);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Keep the badge in sync with carts updated elsewhere (Dawn drawer, quick add).
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function (event) {
        if (event && event.source !== 'dizzy') refreshCartCount();
      });
    }

    var trigger = header.querySelector('.mobile-nav-trigger');
    var control = header.querySelector('.mobile-nav-control');
    var menu = header.querySelector('.mobile-navigation');
    var open = false;

    function onPointerDown(event) {
      if (!header.contains(event.target)) closeMenu();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeMenu();
        trigger.focus();
      }
    }
    function openMenu() {
      if (open) return;
      open = true;
      control.appendChild(menu);
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-label', 'Close navigation');
      document.body.classList.add('mobile-menu-open');
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('keydown', onKeyDown);
      var first = menu.querySelector('a');
      if (first) first.focus();
    }
    function closeMenu() {
      if (!open) return;
      open = false;
      menu.remove();
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Open navigation');
      document.body.classList.remove('mobile-menu-open');
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    }

    // Links back to this page scroll to the top instead of reloading.
    header.querySelectorAll('[data-scroll-top]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        closeMenu();
        if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
        scrollToTopInstantly();
      });
    });

    // Mobile navigation: only in the DOM while open.
    if (!trigger || !control || !menu) return;
    menu.removeAttribute('hidden');
    menu.remove();

    trigger.addEventListener('click', function () {
      if (open) closeMenu(); else openMenu();
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu();
    });
    window.matchMedia('(min-width: 1051px)').addEventListener('change', function (event) {
      if (event.matches) closeMenu();
    });
  }

  /* ---------- Main product: purchase panel + mobile shop bar ---------- */
  function initMainProduct(root) {
    var configEl = root.querySelector('[data-dizzy-product]');
    var panel = root.querySelector('.purchase-panel');
    var form = root.querySelector('[data-dizzy-form]');
    if (!configEl || !panel || !form) return;
    var config = JSON.parse(configEl.textContent);

    var priceEl = panel.querySelector('[data-dizzy-price]');
    var perServingEl = panel.querySelector('[data-dizzy-per-serving]');
    var choices = Array.prototype.slice.call(panel.querySelectorAll('.purchase-options .choice'));
    var decreaseBtn = form.querySelector('[data-dizzy-decrease]');
    var increaseBtn = form.querySelector('[data-dizzy-increase]');
    var qtyOutput = form.querySelector('.quantity-control output');
    var addButton = form.querySelector('.add-button');
    var qtyInput = form.querySelector('[data-dizzy-quantity]');
    var planInput = form.querySelector('[data-dizzy-plan]');
    var errorEl = form.querySelector('[data-dizzy-error]');
    if (!addButton || choices.length !== config.options.length) return;

    // The benefit list only lives inside the selected subscription choice.
    var details = panel.querySelector('.purchase-options .choice-details');
    if (!details) {
      var template = panel.querySelector('[data-choice-details-template]');
      if (template) details = template.content.firstElementChild.cloneNode(true);
    }
    var detailLine = details ? details.querySelector('[data-choice-detail]') : null;

    var initial = choices.findIndex(function (choice) { return choice.querySelector('input').checked; });
    var state = { option: Math.max(0, initial), quantity: 1, busy: false };

    function currentOption() { return config.options[state.option]; }
    function units() { return state.quantity * currentOption().units; }
    function total() { return currentOption().price * units(); }

    function render() {
      var option = currentOption();
      var totalText = formatMoney(total(), config.moneyFormat);

      if (priceEl) priceEl.textContent = totalText;
      if (perServingEl) perServingEl.textContent = formatMoney(option.price / config.servings, config.moneyFormat) + config.perServingSuffix;

      choices.forEach(function (choice, index) {
        var selected = index === state.option;
        choice.classList.toggle('is-selected', selected);
        choice.querySelector('input').checked = selected;
      });

      if (details) {
        if (option.plan) {
          choices[state.option].appendChild(details);
          if (detailLine) {
            detailLine.textContent = option.detail;
            // `hidden` loses to `.choice-details small { display: inline-flex }`.
            detailLine.style.display = option.detail ? '' : 'none';
          }
        } else {
          details.remove();
        }
      }

      // Hidden inputs drive both the AJAX add and the native dynamic checkout button.
      qtyInput.value = String(units());
      planInput.value = option.plan ? String(option.plan) : '';
      planInput.disabled = !option.plan;

      qtyOutput.textContent = String(state.quantity);
      decreaseBtn.disabled = state.quantity <= 1 || state.busy;
      increaseBtn.disabled = state.busy;
      addButton.disabled = state.busy || !config.available;
      if (!config.available) addButton.textContent = config.soldOutLabel;
      else addButton.textContent = state.busy ? config.addingLabel : config.addLabel + ' · ' + totalText;
    }

    choices.forEach(function (choice, index) {
      var input = choice.querySelector('input');
      input.addEventListener('change', function () {
        if (!input.checked) return;
        state.option = index;
        render();
      });
    });

    decreaseBtn.addEventListener('click', function () {
      state.quantity = Math.max(1, state.quantity - 1);
      render();
    });
    increaseBtn.addEventListener('click', function () {
      state.quantity += 1;
      render();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.busy || !config.available) return;
      state.busy = true;
      if (errorEl) errorEl.hidden = true;
      render();

      var option = currentOption();
      var item = { id: config.variantId, quantity: units() };
      if (option.plan) item.selling_plan = option.plan;

      addToCart(item)
        .then(function (result) {
          if (config.afterAdd === 'checkout') {
            var cartUrl = (window.routes && window.routes.cart_url) || '/cart';
            window.location.assign(cartUrl.replace(/cart$/, 'checkout'));
            return;
          }
          if (!result.cart) {
            window.location.assign((window.routes && window.routes.cart_url) || '/cart');
            return;
          }
          // Dawn expects a single line item shape (id / key) plus the rendered sections.
          var first = (result.data.items && result.data.items[0]) || {};
          result.cart.classList.remove('is-empty');
          result.cart.renderContents(Object.assign({}, first, { sections: result.data.sections }));
          state.busy = false;
          render();
        })
        .catch(function (error) {
          state.busy = false;
          render();
          if (errorEl) {
            errorEl.textContent = error.message;
            errorEl.hidden = false;
          }
        });
    });

    // Restore the panel if the user navigates back from checkout (bfcache).
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      state.busy = false;
      render();
    });

    render();
    initMobileShopBar(root);
  }

  /* Mobile shop bar: appears (≤700px, via CSS) once the buy panel has been seen
     and scrolled away, hidden again over the comparison section and footer. */
  function initMobileShopBar(root) {
    var bar = root.querySelector('.mobile-shop-bar');
    var panel = root.querySelector('.purchase-panel');
    if (!bar || !panel || !('IntersectionObserver' in window)) return;

    var seen = { panel: false, positioning: false, footer: false };
    var panelEverSeen = false;

    function update() {
      var visible = panelEverSeen && !seen.panel && !seen.positioning && !seen.footer;
      bar.classList.toggle('is-visible', visible);
      bar.setAttribute('aria-hidden', String(!visible));
      bar.tabIndex = visible ? 0 : -1;
    }

    function watch(el, key, threshold) {
      if (!el) return;
      new IntersectionObserver(function (entries) {
        seen[key] = entries[0].isIntersecting;
        if (key === 'panel' && seen.panel) panelEverSeen = true;
        update();
      }, { threshold: threshold }).observe(el);
    }

    watch(panel, 'panel', 0.15);
    watch(document.querySelector('.dizzy .product-positioning'), 'positioning', 0.05);
    watch(document.querySelector('footer.footer, .site-footer'), 'footer', 0.05);
  }

  /* ---------- Ingredient carousel: CSS marquee that switches to manual,
     snap-scrolling mode once an arrow is used. ---------- */
  function initIngredients(root) {
    var scroller = root.querySelector('.ingredient-card-scroller');
    if (!scroller) return;
    var prev = root.querySelector('.ingredient-carousel-arrow--previous');
    var next = root.querySelector('.ingredient-carousel-arrow--next');

    function step(direction) {
      scroller.classList.add('is-manual');
      window.requestAnimationFrame(function () {
        var card = scroller.querySelector('.ingredient-card');
        var set = scroller.querySelector('.ingredient-card-set');
        if (!card || !set) return;
        var gap = parseFloat(window.getComputedStyle(set).columnGap) || 16;
        var distance = card.getBoundingClientRect().width + gap;
        var max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        var behavior = prefersReducedMotion() ? 'auto' : 'smooth';

        if (direction === 1 && scroller.scrollLeft >= max - 2) {
          scroller.scrollTo({ left: 0, behavior: behavior });
        } else if (direction === -1 && scroller.scrollLeft <= 2) {
          scroller.scrollTo({ left: max, behavior: behavior });
        } else {
          scroller.scrollBy({ left: direction * distance, behavior: behavior });
        }
      });
    }

    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
  }

  var initializers = {
    header: initHeader,
    'main-product': initMainProduct,
    ingredients: initIngredients
  };

  function initAll(scope) {
    (scope || document).querySelectorAll('[data-dizzy-section]').forEach(function (root) {
      if (root.dataset.dizzyReady) return;
      var init = initializers[root.dataset.dizzySection];
      if (!init) return;
      root.dataset.dizzyReady = 'true';
      init(root);
    });
  }

  window.DIZZY = { initAll: initAll, formatMoney: formatMoney };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    initAll();
  }
  document.addEventListener('shopify:section:load', function (event) { initAll(event.target); });
})();
