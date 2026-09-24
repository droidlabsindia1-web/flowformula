/* LML PDP sections. Each root with [data-lml-section] gets its initializer.
   Loaded by snippets/lml-assets.liquid, possibly more than once per page. */
(() => {
  'use strict';
  if (window.LML) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Money (mirrors Shopify's money_format placeholders) ---------- */
  function formatMoney(cents, format) {
    const value = Number(cents) / 100;
    const withDelimiters = (n, decimals, thousands = ',', decimal = '.') => {
      const [whole, frac] = n.toFixed(decimals).split('.');
      return whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (frac ? decimal + frac : '');
    };
    return (format || '${{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
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
  async function addToCart(items) {
    const cart = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
    const body = { items };
    if (cart && cart.getSectionsToRender) {
      body.sections = cart.getSectionsToRender().map((s) => s.id);
      body.sections_url = window.location.pathname;
      if (cart.setActiveElement) cart.setActiveElement(document.activeElement);
    }
    const root = (window.routes && window.routes.cart_add_url) || '/cart/add';
    const res = await fetch(`${root}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status) throw new Error(data.description || data.message || 'Could not add to cart');

    // Dawn declares these as top-level lexical globals (not window props).
    if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'lml-pdp', productVariantId: items[0].id, cartData: data });
    }
    if (!cart) {
      window.location = (window.routes && window.routes.cart_url) || '/cart';
      return data;
    }
    // Dawn expects a single line item shape (id / key) plus the rendered sections.
    const first = (data.items && data.items[0]) || {};
    cart.classList.remove('is-empty');
    cart.renderContents({ ...first, sections: data.sections });
    return data;
  }

  /* ---------- Shared bits ---------- */
  function buildDots(container, count, onClick) {
    if (!container) return [];
    container.innerHTML = '';
    return Array.from({ length: count }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lml-dot';
      b.setAttribute('aria-label', `Go to slide ${i + 1}`);
      b.addEventListener('click', () => onClick(i));
      container.appendChild(b);
      return b;
    });
  }
  const syncDots = (dots, index) => dots.forEach((d, i) => d.classList.toggle('is-active', i === index));

  function whenSwiper(cb) {
    if (window.Swiper) return cb();
    window.addEventListener('load', () => window.Swiper && cb(), { once: true });
  }

  function openModal(m) {
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lml-locked');
  }
  function closeModal(m) {
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
    if (!$('.lml-modal.is-open')) document.body.classList.remove('lml-locked');
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.lml-modal.is-open').forEach(closeModal);
  });

  function initMarquee(root) {
    const track = $('.lml-marquee__track', root);
    const content = $('.lml-marquee__content', track);
    if (track && content && track.children.length === 1) track.appendChild(content.cloneNode(true));
  }

  /* ==========================================================
     Main product
     ========================================================== */
  function initMainProduct(root) {
    const data = JSON.parse($('[data-lml-product]', root).textContent);
    const form = $('[data-lml-form]', root);
    const atc = $('[data-lml-atc]', root);
    const errorEl = $('[data-lml-error]', root);
    const sticky = $('[data-lml-sticky]', root);
    let mainSwiper = null;

    /* Gallery */
    whenSwiper(() => {
      const thumbsEl = $('[data-lml-thumbs]', root);
      const thumbs = thumbsEl && new Swiper(thumbsEl, {
        direction: 'vertical', slidesPerView: 'auto', spaceBetween: 14, watchSlidesProgress: true, freeMode: true, mousewheel: true,
      });
      mainSwiper = new Swiper($('[data-lml-gallery]', root), {
        speed: 450,
        spaceBetween: 20,
        thumbs: thumbs ? { swiper: thumbs } : undefined,
        navigation: { prevEl: $('[data-lml-gallery-prev]', root), nextEl: $('[data-lml-gallery-next]', root) },
      });
      const dots = buildDots($('[data-lml-gallery-dots]', root), mainSwiper.slides.length, (i) => mainSwiper.slideTo(i));
      syncDots(dots, 0);
      mainSwiper.on('slideChange', () => syncDots(dots, mainSwiper.activeIndex));
    });

    const zoomModal = $('[data-lml-modal="zoom"]', root);
    const zoomBtn = $('[data-lml-zoom-open]', root);
    if (zoomBtn) zoomBtn.addEventListener('click', () => {
      const slide = mainSwiper ? mainSwiper.slides[mainSwiper.activeIndex] : $('[data-lml-gallery] .swiper-slide', root);
      $('[data-lml-zoom-img]', zoomModal).src = slide.dataset.zoom || '';
      openModal(zoomModal);
    });
    const badgeClose = $('[data-lml-badge-close]', root);
    if (badgeClose) badgeClose.addEventListener('click', () => $('[data-lml-badge]', root).remove());

    /* Tabs + benefits + FAQ modals */
    $$('[data-lml-tab]', root).forEach((btn) => btn.addEventListener('click', () => {
      $$('[data-lml-tab]', root).forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('[data-lml-panel]', root).forEach((p) => p.classList.toggle('is-active', p.dataset.lmlPanel === btn.dataset.lmlTab));
    }));
    $$('[data-lml-benefits-toggle]', root).forEach((toggle) => toggle.addEventListener('click', () => {
      const open = toggle.previousElementSibling.classList.toggle('is-open');
      toggle.textContent = open ? toggle.dataset.openLabel : toggle.dataset.closedLabel;
    }));
    $$('[data-lml-modal-open]', root).forEach((b) => b.addEventListener('click', () => {
      openModal($(`[data-lml-modal="${b.dataset.lmlModalOpen}"]`, root));
    }));
    $$('.lml-modal', root).forEach((m) => m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-lml-modal-close]')) closeModal(m);
    }));

    /* Purchase state */
    const variantInputs = $$('input[name="id"]', form);
    const planInputs = $$('input[name="selling_plan"]', form);
    const onceInput = $('[data-lml-once]', form);
    const buyOnce = $('[data-lml-buy-once]', root);

    const currentVariant = () => {
      const checked = variantInputs.find((i) => i.type === 'hidden' || i.checked) || variantInputs[0];
      return data.variants.find((v) => String(v.id) === checked.value) || data.variants[0];
    };
    const currentPlanInput = () => planInputs.find((i) => i.checked) || null;

    function priceFor(variant, planId) {
      const plan = planId && variant.plans[planId];
      return plan ? { price: plan.price, compare: plan.compare } : { price: variant.price, compare: variant.compare };
    }
    const state = () => {
      const variant = currentVariant();
      const planInput = currentPlanInput();
      const planId = planInput ? planInput.value : '';
      return { variant, planId, label: planInput ? planInput.dataset.label : data.onceLabel, ...priceFor(variant, planId) };
    };

    function render() {
      const s = state();
      // Option cards: selected style + per-variant prices.
      planInputs.forEach((input) => {
        const card = input.closest('.lml-option');
        if (!card) return;
        card.classList.toggle('is-selected', input.checked);
        const p = priceFor(s.variant, input.value);
        const saved = p.compare - p.price;
        const priceEl = $('[data-lml-opt-price]', card);
        const compareEl = $('[data-lml-opt-compare]', card);
        const badgeEl = $('[data-lml-opt-badge]', card);
        if (priceEl) priceEl.textContent = formatMoney(p.price, data.moneyFormat);
        if (compareEl) { compareEl.textContent = formatMoney(p.compare, data.moneyFormat); compareEl.hidden = saved <= 0; }
        if (badgeEl) {
          const pct = p.compare > 0 ? Math.floor((saved * 100) / p.compare) : 0;
          badgeEl.textContent = pct + data.badgeSuffix;
          badgeEl.hidden = pct <= 0;
        }
      });

      const label = s.variant.available
        ? data.atcTemplate.replace('{price}', formatMoney(s.price, data.moneyFormat))
        : data.soldOut;
      atc.disabled = !s.variant.available;
      $('[data-lml-atc-label]', root).textContent = label;
      if (sticky) {
        $('[data-lml-sticky-label]', sticky).textContent = label;
        $('[data-lml-sticky-plan]', sticky).textContent = s.label;
        $('[data-lml-sticky-add]', sticky).disabled = !s.variant.available;
      }
      if (buyOnce) {
        buyOnce.textContent = onceInput && onceInput.checked
          ? buyOnce.dataset.subscribeLabel
          : `${buyOnce.dataset.onceLabel} ${formatMoney(s.variant.price, data.moneyFormat)}`;
      }
      renderBundle(s);
    }

    form.addEventListener('change', (e) => {
      if (e.target.name === 'id') {
        const v = currentVariant();
        if (v.media && mainSwiper) {
          const idx = mainSwiper.slides.findIndex((sl) => sl.dataset.mediaId === String(v.media));
          if (idx > -1) mainSwiper.slideTo(idx);
        }
      }
      render();
    });

    if (buyOnce && onceInput) {
      const firstPlan = planInputs.find((i) => i !== onceInput);
      buyOnce.addEventListener('click', () => {
        (onceInput.checked ? firstPlan : onceInput).checked = true;
        render();
      });
    }

    async function submit(extraItems = []) {
      const s = state();
      const item = { id: s.variant.id, quantity: 1 };
      if (s.planId) item.selling_plan = Number(s.planId);
      errorEl.hidden = true;
      atc.classList.add('is-loading');
      try {
        await addToCart([item, ...extraItems]);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        atc.classList.remove('is-loading');
      }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    if (sticky) $('[data-lml-sticky-add]', sticky).addEventListener('click', () => submit());

    /* Bundle */
    const bundle = $('[data-lml-bundle]', root);
    const addons = bundle ? $$('[data-lml-addon]', bundle) : [];
    function renderBundle(s) {
      if (!bundle) return;
      const addonTotal = addons.filter((a) => a.checked && !a.disabled).reduce((sum, a) => sum + Number(a.dataset.price), 0);
      const fmt = (c) => formatMoney(c, data.moneyFormat);
      $('[data-lml-bundle-plan]', bundle).textContent = s.label;
      $('[data-lml-bundle-main-price]', bundle).textContent = fmt(s.price);
      const mainCompare = $('[data-lml-bundle-main-compare]', bundle);
      mainCompare.textContent = fmt(s.compare);
      mainCompare.hidden = s.compare <= s.price;
      $('[data-lml-bundle-total]', bundle).textContent = fmt(s.price + addonTotal);
      const compare = $('[data-lml-bundle-compare]', bundle);
      compare.textContent = fmt(s.compare + addonTotal);
      compare.hidden = s.compare <= s.price;
    }
    if (bundle) {
      addons.forEach((a) => a.addEventListener('change', () => renderBundle(state())));
      $('[data-lml-bundle-add]', bundle).addEventListener('click', () => {
        submit(addons.filter((a) => a.checked && !a.disabled).map((a) => ({ id: Number(a.dataset.variantId), quantity: 1 })));
      });
    }

    /* Sticky bar appears once the main button scrolls above the viewport */
    if (sticky) {
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', show);
        sticky.setAttribute('aria-hidden', String(!show));
      }).observe(atc);
    }

    render();
  }

  /* ==========================================================
     Other sections
     ========================================================== */
  function initIngredients(root) {
    whenSwiper(() => {
      const sw = new Swiper($('[data-lml-carousel]', root), {
        slidesPerView: 1.15,
        spaceBetween: 16,
        navigation: { prevEl: $('[data-lml-carousel-prev]', root), nextEl: $('[data-lml-carousel-next]', root) },
        breakpoints: {
          640: { slidesPerView: 2, spaceBetween: 20 },
          1025: { slidesPerView: 3, spaceBetween: 22, allowTouchMove: false },
        },
      });
      const dots = buildDots($('[data-lml-carousel-dots]', root), sw.slides.length, (i) => sw.slideTo(i));
      syncDots(dots, 0);
      sw.on('slideChange', () => syncDots(dots, sw.activeIndex));
    });
  }

  function initLeaveOut(root) {
    const list = $('[data-lml-strike]', root);
    if (!list) return;
    new IntersectionObserver(([entry], obs) => {
      if (entry.isIntersecting) { list.classList.add('is-struck'); obs.disconnect(); }
    }, { threshold: 0.5 }).observe(list);
  }

  function initFaq(root) {
    $$('[data-lml-accordion-item]', root).forEach((item) => {
      const btn = $('.lml-accordion__toggle', item);
      btn.addEventListener('click', () => btn.setAttribute('aria-expanded', String(item.classList.toggle('is-open'))));
    });
  }

  function initReviews(root) {
    const list = $('[data-lml-review-list]', root);
    if (!list) return;
    const cards = $$('[data-lml-review]', list);
    const more = $('[data-lml-review-more]', root);
    const sortSel = $('[data-lml-review-sort]', root);
    let shown = Number(list.dataset.initial) || 4;
    const num = (el, key) => Number(el.dataset[key]) || 0;
    const sorters = {
      recent: (a, b) => num(a, 'index') - num(b, 'index'),
      highest: (a, b) => num(b, 'rating') - num(a, 'rating'),
      lowest: (a, b) => num(a, 'rating') - num(b, 'rating'),
      helpful: (a, b) => num(b, 'helpful') - num(a, 'helpful'),
    };
    const render = () => {
      [...cards].sort(sorters[sortSel.value]).forEach((card, i) => {
        list.appendChild(card);
        card.hidden = i >= shown;
      });
      if (more) more.hidden = shown >= cards.length;
    };
    sortSel.addEventListener('change', render);
    if (more) more.addEventListener('click', () => { shown += 4; render(); });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lml-vote]');
      if (!btn || btn.classList.contains('is-voted')) return;
      btn.classList.add('is-voted');
      const span = $('span', btn);
      span.textContent = Number(span.textContent) + 1;
      if (btn.dataset.lmlVote === 'up') {
        const card = btn.closest('[data-lml-review]');
        card.dataset.helpful = num(card, 'helpful') + 1;
      }
    });

    $$('[data-lml-rtab]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-lml-rtab]', root).forEach((x) => x.classList.toggle('is-active', x === b));
      $$('[data-lml-rpanel]', root).forEach((p) => { p.hidden = p.dataset.lmlRpanel !== b.dataset.lmlRtab; });
    }));
  }

  async function initRecs(root) {
    const url = root.dataset.url;
    if (!url) return;
    try {
      const html = await (await fetch(url)).text();
      const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-lml-recs-grid]');
      const grid = $('[data-lml-recs-grid]', root);
      if (fresh && fresh.children.length) grid.replaceWith(fresh);
      else root.hidden = true;
    } catch (err) {
      console.error('[lml] recommendations', err);
    }
  }

  const INITIALIZERS = {
    'main-product': initMainProduct,
    ingredients: initIngredients,
    'leave-out': initLeaveOut,
    faq: initFaq,
    marquee: initMarquee,
    reviews: initReviews,
    recs: initRecs,
  };

  function initAll(scope = document) {
    $$('[data-lml-section]', scope).forEach((el) => {
      if (el.dataset.lmlReady) return;
      el.dataset.lmlReady = 'true';
      const init = INITIALIZERS[el.dataset.lmlSection];
      if (init) init(el);
    });
  }

  window.LML = { initAll, formatMoney, addToCart };
  initAll();
  document.addEventListener('shopify:section:load', (e) => initAll(e.target));
})();
