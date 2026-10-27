/* ORÉE — small interactions, no dependencies */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* Hide only truly broken images so the warm placeholder shows instead of a broken icon.
     Lazy images that have not loaded yet also report naturalWidth 0 (Safari even reports
     complete = true), so they are never hidden up front, and any image that loads is shown. */
  $$('img').forEach((img) => {
    img.addEventListener('error', () => img.classList.add('is-missing'));
    img.addEventListener('load', () => img.classList.remove('is-missing'));
    if (img.loading !== 'lazy' && img.complete && img.naturalWidth === 0 && img.currentSrc) {
      img.classList.add('is-missing');
    }
  });

  /* Keep the scroll position when coming back to a page (e.g. from a journal article).
     Browsers usually do this, but smooth scrolling and late-loading media can make Safari
     land at the top — so we remember the position ourselves and restore it if needed. */
  const scrollKey = 'oree_scroll:' + location.pathname;
  const saveScroll = () => { try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch (e) {} };
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveScroll(); });
  const restoreScroll = () => {
    let saved = 0;
    try { saved = parseInt(sessionStorage.getItem(scrollKey) || '0', 10); } catch (e) {}
    if (!saved || location.hash) return;
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'back_forward') return;
    const jump = () => { if (Math.abs(window.scrollY - saved) > 40) window.scrollTo({ top: saved, behavior: 'instant' }); };
    jump();
    requestAnimationFrame(jump);
    window.addEventListener('load', jump, { once: true });
  };
  restoreScroll();
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    let saved = 0;
    try { saved = parseInt(sessionStorage.getItem(scrollKey) || '0', 10); } catch (e2) {}
    if (saved && window.scrollY < 40) window.scrollTo({ top: saved, behavior: 'instant' });
  });

  /* Smooth scrolling only for in-page anchor links (not for the browser's own restore) */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.pushState(null, '', url.hash);
  });

  /* Hero video: play only when allowed, fade in when frames are ready */
  const heroVideo = $('[data-hero-video]');
  if (heroVideo) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (reduce || saveData) {
      heroVideo.remove();
    } else {
      heroVideo.addEventListener('playing', () => heroVideo.classList.add('is-playing'), { once: true });
      const tryPlay = () => heroVideo.play().catch(() => {});
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          entries.forEach((e) => (e.isIntersecting ? tryPlay() : heroVideo.pause()));
        }).observe(heroVideo);
      } else {
        tryPlay();
      }
    }
  }

  /* Mobile menu */
  const burger = $('.nav__burger');
  const menu = $('#mobile-menu');
  if (burger && menu) {
    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.hidden = !open;
    };
    burger.addEventListener('click', () => setOpen(menu.hidden));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    window.addEventListener('resize', () => { if (window.innerWidth > 1024) setOpen(false); });
  }

  /* Search bar toggle */
  const searchBtn = $('[data-search-toggle]');
  const searchBar = $('[data-search]');
  if (searchBtn && searchBar) {
    searchBtn.addEventListener('click', () => {
      searchBar.hidden = !searchBar.hidden;
      if (!searchBar.hidden) $('input', searchBar)?.focus();
    });
  }

  /* Toast */
  const toast = $('[data-toast]');
  let toastTimer;
  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  };

  /* ---------- Cart (demo store: kept in this browser only) ---------- */
  const KEY = 'oree_cart';
  const money = (n) => '€' + (Math.round(n * 100) / 100).toLocaleString('en-IE', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = (items) => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} };
  let cart = load();
  const count = () => cart.reduce((n, i) => n + i.qty, 0);
  const subtotal = () => cart.reduce((n, i) => n + i.qty * i.price, 0);

  const drawer = $('#cart');
  const overlay = $('[data-cart-overlay]');
  const openBtn = $('[data-cart-open]');
  const freeFrom = drawer ? parseFloat(drawer.dataset.freeFrom || '80') : 80;
  let lastFocus = null;

  const itemHTML = (i, editable) => `
    <li class="line-item" data-id="${esc(i.id)}">
      <div class="line-item__img media">${i.image ? `<img src="${esc(i.image)}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="line-item__body">
        <p class="line-item__name">${esc(i.name)}</p>
        <p class="line-item__meta">${esc(i.meta || '')}</p>
        ${editable ? `<div class="qty">
          <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
          <span aria-live="polite">${i.qty}</span>
          <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
        </div>` : `<p class="line-item__meta">Qty ${i.qty}</p>`}
      </div>
      <div class="line-item__end">
        <span class="line-item__price">${money(i.price * i.qty)}</span>
        ${editable ? '<button type="button" class="line-item__remove" data-remove>Remove</button>' : ''}
      </div>
    </li>`;

  const render = () => {
    $$('[data-bag-count]').forEach((el) => (el.textContent = count()));
    if (!drawer) return;
    const empty = cart.length === 0;
    $('[data-cart-count]', drawer).textContent = empty ? '' : `(${count()})`;
    $('[data-cart-items]', drawer).innerHTML = cart.map((i) => itemHTML(i, true)).join('');
    $('[data-cart-empty]', drawer).hidden = !empty;
    $('[data-cart-foot]', drawer).hidden = empty;
    $('[data-cart-subtotal]', drawer).textContent = money(subtotal());
    const left = freeFrom - subtotal();
    const del = $('[data-cart-delivery]', drawer);
    del.hidden = empty;
    del.innerHTML = left > 0
      ? `You are <strong>${money(left)}</strong> away from complimentary delivery.`
      : 'Your delivery is <strong>complimentary</strong>.';
    del.style.setProperty('--progress', Math.min(1, subtotal() / freeFrom));
    renderCheckout();
  };

  const openCart = () => {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false; overlay.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('is-open'); overlay.classList.add('is-open'); });
    document.documentElement.classList.add('has-drawer');
    openBtn && openBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => $('.cart__close', drawer).focus(), 50);
  };
  const closeCart = () => {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open'); overlay.classList.remove('is-open');
    document.documentElement.classList.remove('has-drawer');
    openBtn && openBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { drawer.hidden = true; overlay.hidden = true; }, 450);
    lastFocus && lastFocus.focus && lastFocus.focus();
  };

  $$('[data-add]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const d = btn.dataset;
      if (!d.id) return;
      const found = cart.find((i) => i.id === d.id);
      if (found) found.qty += 1;
      else cart.push({ id: d.id, name: d.name, price: parseFloat(d.price) || 0, meta: d.meta || '', image: d.image || '', qty: 1 });
      save(cart); render(); openCart();
    });
  });
  openBtn && openBtn.addEventListener('click', openCart);
  overlay && overlay.addEventListener('click', closeCart);
  drawer && drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-cart-close]')) { closeCart(); return; }
    const li = e.target.closest('.line-item');
    if (!li) return;
    const item = cart.find((i) => i.id === li.dataset.id);
    if (!item) return;
    if (e.target.closest('[data-remove]')) cart = cart.filter((i) => i !== item);
    const q = e.target.closest('[data-qty]');
    if (q) { item.qty += parseInt(q.dataset.qty, 10); if (item.qty < 1) cart = cart.filter((i) => i !== item); }
    save(cart); render();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cart = load(); render(); } });

  /* ---------- Checkout page ---------- */
  const checkout = $('[data-checkout]');
  function shippingCost() {
    if (!checkout) return 0;
    const r = $('input[name="shipping"]:checked', checkout);
    if (!r) return 0;
    const free = parseFloat(r.dataset.shipFree || 'NaN');
    if (!isNaN(free) && subtotal() >= free) return 0;
    return parseFloat(r.dataset.shipPrice || '0');
  }
  function renderCheckout() {
    if (!checkout || checkout.classList.contains('is-done')) return;
    const empty = cart.length === 0;
    $('[data-checkout-empty]', checkout).hidden = !empty;
    $('[data-checkout-main]', checkout).hidden = empty;
    if (empty) return;
    $('[data-summary-items]', checkout).innerHTML = cart.map((i) => itemHTML(i, false)).join('');
    const ship = shippingCost();
    const std = $('[data-ship-label="standard"]', checkout);
    if (std) std.textContent = subtotal() >= 80 ? 'Complimentary' : '€6';
    $('[data-summary-subtotal]', checkout).textContent = money(subtotal());
    $('[data-summary-shipping]', checkout).textContent = ship ? money(ship) : 'Complimentary';
    const fifties = cart.filter((i) => /50\s*ml/i.test(i.meta)).reduce((n, i) => n + i.qty, 0);
    $('[data-summary-samples]', checkout).textContent = fifties ? `${fifties * 2} × 2 ml` : '—';
    $('[data-summary-total]', checkout).textContent = money(subtotal() + ship);
  }
  if (checkout) {
    const form = $('[data-checkout-form]', checkout);
    form.addEventListener('change', renderCheckout);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const done = $('[data-checkout-done]', checkout);
      const first = String(data.get('first_name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const title = $('[data-done-title]', done);
      title.textContent = first ? title.dataset.named.replace('%s', first) : title.dataset.plain;
      const banner = $('[data-checkout-banner]', checkout);
      if (banner) banner.hidden = true;
      $('[data-done-email]', done).textContent = email;
      $('[data-done-email-line]', done).hidden = !email;
      $('[data-done-number]', done).textContent = 'ORE-' + String(Date.now()).slice(-6);
      $('[data-done-items]', done).innerHTML = cart.map((i) => itemHTML(i, false)).join('');
      checkout.classList.add('is-done');
      $('[data-checkout-main]', checkout).hidden = true;
      $('.checkout__head', checkout).hidden = true;
      done.hidden = false; done.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cart = []; save(cart); render();
    });
  }
  render();

  /* ---------- Scroll reveal ---------- */
  const reveals = $$('[data-reveal]');
  if (reveals.length) {
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveals.forEach((el) => el.classList.add('is-visible'));
    } else {
      document.documentElement.classList.add('js-reveal');
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
      }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach((el) => io.observe(el));
    }
  }

  /* ---------- Contact form (demo) ---------- */
  $$('[data-demo-form]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      f.innerHTML = '<p class="demo-sent">Thank you — your note has reached the atelier. We usually reply within one working day.</p>';
    });
  });

  /* Testimonials: dots are generated from the number of quotes */
  const quotes = $$('.quote');
  const dots = $('.quotes__dots');
  if (quotes.length && dots) {
    let current = 0;
    let timer;
    const go = (i) => {
      current = (i + quotes.length) % quotes.length;
      quotes.forEach((q, n) => q.classList.toggle('is-active', n === current));
      $$('button', dots).forEach((d, n) => d.setAttribute('aria-selected', String(n === current)));
    };
    quotes.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Quote ${i + 1}`);
      b.addEventListener('click', () => { go(i); restart(); });
      dots.appendChild(b);
    });
    const restart = () => {
      clearInterval(timer);
      if (quotes.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = setInterval(() => go(current + 1), 6000);
      }
    };
    go(0);
    restart();
  }

  /* Newsletter */
  const form = $('.newsletter__form');
  if (form) {
    const field = $('.field', form);
    const input = $('input', form);
    const note = $('[data-note]', form);
    if (!field || !input || !note) return;
    const original = note.innerHTML;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      field.classList.toggle('is-error', !ok);
      note.classList.toggle('is-error', !ok);
      note.classList.toggle('is-success', ok);
      if (!ok) {
        note.textContent = 'Please enter a valid email address.';
        input.focus();
        return;
      }
      note.textContent = 'Thank you. Your first note is on its way.';
      form.reset();
    });
    input.addEventListener('input', () => {
      if (field.classList.contains('is-error')) {
        field.classList.remove('is-error');
        note.classList.remove('is-error');
        note.innerHTML = original;
      }
    });
  }
})();
