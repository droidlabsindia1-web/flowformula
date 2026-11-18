/* Flow Formula cart drawer (sections/ff-cart-drawer.liquid).

   Implements the same interface Dawn's cart drawer exposes, which ff.js's
   buy form already calls after adding to the cart:
     getSectionsToRender(), renderContents(parsedState), setActiveElement(el)

   Also opens from the header cart icon ([data-ff-cart]) and removes lines
   through /cart/change.js. There's no quantity control by design. */

if (!customElements.get("ff-cart-drawer")) {
  customElements.define(
    "ff-cart-drawer",
    class FFCartDrawer extends HTMLElement {
      connectedCallback() {
        this.dialog = this.querySelector("[data-ff-cart-dialog]");
        if (!this.dialog) return;
        this.sectionId = this.dataset.sectionId;
        this.activeElement = null;

        this.onClick = this.onClick.bind(this);
        this.onHeaderCartClick = this.onHeaderCartClick.bind(this);

        this.dialog.addEventListener("click", this.onClick);
        this.dialog.addEventListener("close", () => {
          if (this.activeElement && document.contains(this.activeElement)) this.activeElement.focus();
          this.activeElement = null;
        });
        document.addEventListener("click", this.onHeaderCartClick);

        // Other scripts that change the cart publish cartUpdate (pubsub.js)
        if (typeof subscribe === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
          this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
            var source = event && event.source;
            if (source === "ff-cart-drawer" || source === "ff-main-product") return;
            this.refresh();
          });
        }

        // Back from checkout (bfcache): the cart may have changed
        this.onPageShow = (e) => {
          if (e.persisted) this.refresh();
        };
        window.addEventListener("pageshow", this.onPageShow);
      }

      disconnectedCallback() {
        document.removeEventListener("click", this.onHeaderCartClick);
        window.removeEventListener("pageshow", this.onPageShow);
        if (this.unsubscribe) this.unsubscribe();
      }

      /* ---------- Open / close ---------- */

      open(trigger) {
        if (trigger) this.setActiveElement(trigger);
        if (this.dialog.open) return;
        this.dialog.showModal();
        // Focus the panel, not the close button, so no focus ring shows on
        // open; Tab still reaches the close button first
        this.dialog.focus({ preventScroll: true });
      }

      close() {
        if (this.dialog.open) this.dialog.close();
      }

      setActiveElement(element) {
        this.activeElement = element;
      }

      onHeaderCartClick(e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var link = e.target.closest("[data-ff-cart]");
        if (!link) return;
        e.preventDefault();
        this.open(link);
      }

      onClick(e) {
        // A click on the backdrop lands on the dialog element itself
        if (e.target === this.dialog) {
          this.close();
          return;
        }
        if (e.target.closest("[data-ff-cart-close]")) {
          this.close();
          return;
        }
        var remove = e.target.closest("[data-ff-cart-remove]");
        if (remove) this.removeLine(remove.getAttribute("data-ff-cart-remove"), remove);
      }

      /* ---------- Section rendering ---------- */

      getSectionsToRender() {
        return [{ id: this.sectionId, selector: "[data-ff-cart-inner]" }];
      }

      // Called by ff.js after /cart/add.js with { ...lineItem, sections }
      renderContents(parsedState) {
        this.renderSections(parsedState && parsedState.sections);
        this.open();
      }

      renderSections(sections) {
        var html = sections && sections[this.sectionId];
        if (!html) {
          this.refresh();
          return;
        }
        var doc = new DOMParser().parseFromString(html, "text/html");
        var next = doc.querySelector("[data-ff-cart-inner]");
        var current = this.dialog.querySelector("[data-ff-cart-inner]");
        if (!next || !current) return;

        var hadFocus = current.contains(document.activeElement);
        current.replaceWith(next);
        if (hadFocus || this.dialog.open) this.dialog.focus({ preventScroll: true });
      }

      refresh() {
        var url = window.location.pathname + "?sections=" + encodeURIComponent(this.sectionId);
        return fetch(url, { headers: { Accept: "application/json" } })
          .then((res) => res.json())
          .then((sections) => this.renderSections(sections))
          .catch(() => {
            /* keep what's on screen */
          });
      }

      /* ---------- Remove ---------- */

      removeLine(key, button) {
        var item = button.closest("[data-ff-cart-item]");
        if (item) item.setAttribute("aria-busy", "true");
        this.showError("");

        var routes = window.routes || {};
        fetch((routes.cart_change_url || "/cart/change") + ".js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({
            id: key,
            quantity: 0,
            sections: [this.sectionId],
            sections_url: window.location.pathname
          })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.status) throw new Error(data.description || data.message);
            this.renderSections(data.sections);
            if (typeof publish === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
              publish(PUB_SUB_EVENTS.cartUpdate, { source: "ff-cart-drawer", cartData: data });
            }
          })
          .catch((error) => {
            if (item) item.removeAttribute("aria-busy");
            this.showError((error && error.message) || (window.cartStrings && window.cartStrings.error) || "Something went wrong. Please try again.");
          });
      }

      showError(message) {
        var el = this.dialog.querySelector("[data-ff-cart-error]");
        if (!el) return;
        el.textContent = message;
        el.hidden = !message;
      }
    }
  );
}
