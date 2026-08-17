/**
 * ABS FRAGRANCES — main.js (landing page + shared utilities)
 */

/* ─── Toast ─── */
function showToast(msg, type = '') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = 'toast ' + (type || '');
  t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3000);
}

/* ─── Escape HTML ─── */
function escapeHtml(s) {
  const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML;
}

/* ─── Get brand emoji ─── */
function getBrandEmoji(brandId) {
  const emojis = { rasasi: '🌹', lattafa: '🔮', rueBroca: '🌿', frenchAvenue: '🗼', assaf: '🪔', afnan: '💎', rayhaan: '🌸', alHambra: '🏰' };
  return emojis[brandId] || '🧴';
}
function getBrandName(brandId) {
  return (typeof BRANDS !== 'undefined' && BRANDS[brandId]?.name) || brandId || '—';
}

/* ─── Homepage: "Our Signature Scents" (admin-curated featured perfumes) ─── */
let _featuredList = [];
let _featuredStart = 0;
const FEATURED_VISIBLE = 3;

function featuredBgClass(p) {
  if (p.badge === 'Bestseller') return 'type-bestseller-bg';
  if (p.badge === 'New Arrival') return 'type-new-bg';
  return genderBgClass(p.gender);
}

function featuredCardHTML(p) {
  const brandName = getBrandName(p.brand);
  const emoji = getBrandEmoji(p.brand);
  const visual = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover" />`
    : `<div class="product-emoji" style="font-size:3.8rem;filter:drop-shadow(0 6px 20px rgba(22,56,70,.15))">${emoji}</div>`;
  return `
    <div class="product-card fade-up" data-product="${p.id}" onclick="openProductModal('${p.id}')">
      <div class="product-img-wrap ${featuredBgClass(p)}">
        ${p.badge ? `<div class="product-badge ${p.badgeClass || ''}">${escapeHtml(p.badge)}</div>` : ''}
        ${visual}
      </div>
      <div class="product-info">
        <div class="product-collection">${escapeHtml(brandName)} · ${p.gender}</div>
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <p class="product-desc">${escapeHtml(p.shortDesc || '')}</p>
        <div class="product-footer">
          <div class="product-price">${p.price}</div>
          <button class="btn-view-det" onclick="event.stopPropagation();openProductModal('${p.id}')">Details</button>
          <button class="btn-add-cart" onclick="event.stopPropagation();addToCart('${p.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Add
          </button>
        </div>
      </div>
    </div>`;
}

function renderFeaturedWindow() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const total = _featuredList.length;
  if (!total) {
    grid.innerHTML = `<div class="featured-empty">New arrivals coming soon.</div>`;
    document.getElementById('featuredPrevBtn')?.classList.add('is-hidden');
    document.getElementById('featuredNextBtn')?.classList.add('is-hidden');
    return;
  }
  const visible = total <= FEATURED_VISIBLE
    ? _featuredList
    : Array.from({ length: FEATURED_VISIBLE }, (_, i) => _featuredList[(_featuredStart + i) % total]);

  grid.innerHTML = visible.map(featuredCardHTML).join('');
  grid.querySelectorAll('.fade-up').forEach(el => { el.classList.add('visible'); window.fadeUpObserver?.observe(el); });

  const arrows = total > FEATURED_VISIBLE;
  document.getElementById('featuredPrevBtn')?.classList.toggle('is-hidden', !arrows);
  document.getElementById('featuredNextBtn')?.classList.toggle('is-hidden', !arrows);
}

function renderFeaturedSection() {
  if (!document.getElementById('featuredGrid')) return;
  _featuredList = Object.values(PRODUCTS).filter(p => p.isFeatured);
  _featuredStart = 0;
  renderFeaturedWindow();
}

function initFeaturedCarousel() {
  document.getElementById('featuredPrevBtn')?.addEventListener('click', () => {
    const total = _featuredList.length;
    if (!total) return;
    _featuredStart = (_featuredStart - 1 + total) % total;
    renderFeaturedWindow();
  });
  document.getElementById('featuredNextBtn')?.addEventListener('click', () => {
    const total = _featuredList.length;
    if (!total) return;
    _featuredStart = (_featuredStart + 1) % total;
    renderFeaturedWindow();
  });
}

/* ─── Homepage: Customer reviews ─── */
/* Shown reviews are either curated seed data or submitted live by visitors
 * via the form below the grid (published immediately, no moderation queue).
 * Admin can delete any of them from the dashboard's Customer Reviews view. */
let _reviewsList = [];
let _reviewsStart = 0;
const REVIEWS_VISIBLE = 3;

function renderReviewsWindow() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;
  const total = _reviewsList.length;
  const visible = total <= REVIEWS_VISIBLE
    ? _reviewsList
    : Array.from({ length: REVIEWS_VISIBLE }, (_, i) => _reviewsList[(_reviewsStart + i) % total]);

  grid.innerHTML = visible.map((r, i) => `
      <div class="review-card fade-up delay-${(i % 3) + 1}">
        <div class="review-card-inner">
          <div class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
          <p class="review-text">"${escapeHtml(r.review_text)}"</p>
          <div class="review-author">
            <div class="review-avatar">${escapeHtml((r.author_name || '?').charAt(0))}</div>
            <div>
              <div class="review-name">${escapeHtml(r.author_name)}</div>
              ${r.author_location ? `<div class="review-location">${escapeHtml(r.author_location)}</div>` : ''}
            </div>
          </div>
          <div class="review-product">${escapeHtml(r.product_label || '')}</div>
        </div>
      </div>`).join('');
  grid.querySelectorAll('.fade-up').forEach(el => { el.classList.add('visible'); window.fadeUpObserver?.observe(el); });

  const arrows = total > REVIEWS_VISIBLE;
  document.getElementById('reviewPrevBtn')?.classList.toggle('is-hidden', !arrows);
  document.getElementById('reviewNextBtn')?.classList.toggle('is-hidden', !arrows);
}

async function renderReviewsSection() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid || typeof Reviews === 'undefined') return;
  try {
    _reviewsList = await Reviews.fetchAll();
    _reviewsStart = 0;
    renderReviewsWindow();
  } catch (err) {
    console.error('Failed to load reviews:', err);
  }
}

function initReviewsCarousel() {
  document.getElementById('reviewPrevBtn')?.addEventListener('click', () => {
    const total = _reviewsList.length;
    if (!total) return;
    _reviewsStart = (_reviewsStart - 1 + total) % total;
    renderReviewsWindow();
  });
  document.getElementById('reviewNextBtn')?.addEventListener('click', () => {
    const total = _reviewsList.length;
    if (!total) return;
    _reviewsStart = (_reviewsStart + 1) % total;
    renderReviewsWindow();
  });
}

/* ─── Homepage: "Leave a Review" form ─── */
function initReviewForm() {
  const picker = document.getElementById('starPicker');
  const starsInput = document.getElementById('starsInput');
  const form = document.getElementById('reviewForm');
  const brandSel = document.getElementById('reviewBrandSelect');
  const perfumeSel = document.getElementById('reviewPerfumeSelect');
  if (!picker || !starsInput || !form || !brandSel || !perfumeSel) return;

  const starBtns = [...picker.querySelectorAll('.star-btn')];
  const paint = n => starBtns.forEach(s => s.classList.toggle('active', Number(s.dataset.star) <= n));
  starBtns.forEach(s => {
    s.addEventListener('click', () => { starsInput.value = s.dataset.star; paint(Number(s.dataset.star)); });
    s.addEventListener('mouseenter', () => paint(Number(s.dataset.star)));
  });
  picker.addEventListener('mouseleave', () => paint(Number(starsInput.value)));

  brandSel.innerHTML = '<option value="">Select brand…</option>' +
    Object.values(BRANDS).map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');

  brandSel.addEventListener('change', () => {
    const brandId = brandSel.value;
    const options = Object.values(PRODUCTS).filter(p => p.brand === brandId);
    if (!brandId || !options.length) {
      perfumeSel.innerHTML = `<option value="">${brandId ? 'No perfumes for this brand yet' : 'Select brand first…'}</option>`;
      perfumeSel.disabled = true;
      return;
    }
    perfumeSel.innerHTML = '<option value="">Select perfume…</option>' +
      options.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
    perfumeSel.disabled = false;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('reviewFormError');
    const btn = document.getElementById('reviewSubmitBtn');
    errEl.style.display = 'none';

    const stars = Number(starsInput.value);
    const author_name = form.author_name.value.trim();
    const brandId = brandSel.value;
    const brandName = BRANDS[brandId]?.name || '';
    const perfumeName = perfumeSel.value;
    const review_text = form.review_text.value.trim();
    if (!stars) { errEl.textContent = 'Please select a star rating.'; errEl.style.display = 'block'; return; }
    if (!author_name || !brandId || !perfumeName || !review_text) {
      errEl.textContent = 'Name, brand, perfume, and review are required.'; errEl.style.display = 'block'; return;
    }
    const product_label = `${perfumeName} · ${brandName}`;

    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await Reviews.submitReview({ stars, review_text, author_name, product_label });
      form.reset();
      starsInput.value = '0'; paint(0);
      perfumeSel.innerHTML = '<option value="">Select brand first…</option>'; perfumeSel.disabled = true;
      showToast('Thank you for your review! 🎉', 'success');
      renderReviewsSection();
    } catch (err) {
      errEl.textContent = err.message || 'Failed to submit review.'; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Submit Review';
    }
  });
}

/* ─── Product card HTML (reusable) ─── */
function productCardHTML(p) {
  const brandName = getBrandName(p.brand);
  const emoji = getBrandEmoji(p.brand);
  return `
    <div class="catalog-card fade-up" data-product="${p.id}" onclick="openProductModal('${p.id}')">
      <div class="catalog-card-img ${genderBgClass(p.gender)}">
        ${p.badge ? `<div class="product-badge ${p.badgeClass || ''}">${p.badge}</div>` : ''}
        <div style="font-size:3.5rem;filter:drop-shadow(0 6px 20px rgba(22,56,70,.15));transition:transform .4s">${emoji}</div>
      </div>
      <div class="catalog-card-body">
        <div class="catalog-card-brand">${escapeHtml(brandName)}</div>
        <div class="catalog-card-name">${escapeHtml(p.name)}</div>
        <div class="catalog-card-gender">${p.gender} · ${p.intensity || 'Moderate'}</div>
        <div class="catalog-card-notes">${(p.notes || []).slice(0, 3).map(n => `<span class="catalog-note">${escapeHtml(n)}</span>`).join('')}</div>
        <div class="catalog-card-footer">
<span class="product-price" style="font-family:var(--serif2);font-style:italic;color:var(--navy)">${p.price}</span>
          <div style="display:flex;gap:.5rem">
            <button class="btn-add-cart" onclick="event.stopPropagation();addToCart('${p.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function genderBgClass(g) {
  const map = { Women: 'hawas-bg', Men: 'sh-bg', Unisex: 'wc-bg', Musk: 'musk-bg' };
  return map[g] || 'wc-bg';
}

/* ─── Product Modal ─── */
function openProductModal(productId) {
  const all = typeof getAllProductsCatalog === 'function' ? getAllProductsCatalog() : (PRODUCTS || {});
  const p = all[productId];
  if (!p) return;
  const overlay = document.getElementById('productModal');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  const brandName = getBrandName(p.brand);
  const emoji = getBrandEmoji(p.brand);
  content.innerHTML = `
    <div style="height:160px;background:var(--bg);display:flex;align-items:center;justify-content:center;margin:0 -3rem 1.5rem;font-size:4rem">
      ${emoji}
    </div>
    <div class="modal-collection">${escapeHtml(brandName)} — ${escapeHtml(p.gender)}</div>
    <div class="modal-product-name">${escapeHtml(p.name)}</div>
<div style="font-family:var(--serif2);font-style:italic;font-size:1.1rem;color:var(--gold);margin-bottom:.5rem">${p.price}</div>
      ${p.badge ? `<span class="badge ${p.badgeClass || 'badge-muted'}">${p.badge}</span>` : ''}
      <span style="font-family:var(--sans);font-size:.65rem;padding:.25rem .65rem;background:rgba(22,56,70,.06);color:var(--muted)">${p.intensity || 'Moderate'}</span>
    </div>
    <div class="modal-desc">${escapeHtml(p.fullDesc || p.shortDesc || '')}</div>
    <div class="modal-notes-label">Fragrance Notes</div>
    <div class="modal-notes">${(p.notes || []).map(n => `<span class="note-chip">${escapeHtml(n)}</span>`).join('')}</div>
    <div class="modal-actions-row">
      <button class="btn btn-navy" style="flex:1;justify-content:center" onclick="addToCart('${p.id}');closeModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        Add to Cart
      </button>
      <a href="https://wa.me/96178901234" target="_blank" class="btn btn-wa" style="flex:1;justify-content:center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp Order
      </a>
    </div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(o => o.classList.remove('open'));
  document.body.style.overflow = '';
}
window.closeModal = closeModal;

/* ─── Navbar Search Dropdown ─── */
function initNavbarSearch() {
  const input = document.getElementById('navSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { dropdown.classList.remove('show'); return; }
    if (typeof searchProducts !== 'function') { return; }
    const results = searchProducts(q).slice(0, 6);
    if (!results.length) {
      dropdown.innerHTML = `<div class="search-no-result">No perfumes found for "<em>${escapeHtml(q)}</em>"</div>`;
    } else {
      dropdown.innerHTML = results.map(p => `
        <div class="search-result-item" onclick="openProductModal('${p.id}');closeSearchDropdown()">
          <div class="search-result-thumb">${getBrandEmoji(p.brand)}</div>
          <div>
            <div class="search-result-name">${escapeHtml(p.name)}</div>
            <div class="search-result-brand">${escapeHtml(getBrandName(p.brand))}</div>
            <div class="search-result-gender">${p.gender}</div>
          </div>
        </div>`).join('');
    }
    dropdown.classList.add('show');
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) closeSearchDropdown();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearchDropdown();
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) { window.location.href = `all-perfumes.html?q=${encodeURIComponent(q)}`; }
    }
  });
}
function closeSearchDropdown() {
  document.getElementById('searchDropdown')?.classList.remove('show');
}

/* ─── Admin login from the mobile drawer ─── */
function initMobileNavAdminForm() {
  const form = document.getElementById('mobileNavAdminForm');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const pwInput = document.getElementById('mobileNavAdminPassword');
    const errEl = document.getElementById('mobileNavAdminErr');
    const btn = form.querySelector('.mobile-nav-admin-btn');
    const password = pwInput.value;
    if (!password) return;
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const result = await login(ADMIN_EMAIL, password);
    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.classList.add('show');
      pwInput.value = '';
      pwInput.focus();
      btn.disabled = false;
      btn.textContent = 'Log In';
      return;
    }
    window.location.href = 'admin/dashboard.html';
  });
}

/* ─── Init (landing page) ─── */
document.addEventListener('DOMContentLoaded', async () => {
  await initProducts();
  updateNavbarAuth();

  if (typeof updateCartBadge === 'function') updateCartBadge();

  // Navbar scroll
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => nav?.classList.toggle('scrolled', window.scrollY > 60), { passive: true });

  // Hamburger — slide-in mobile nav drawer
  const ham = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavBg = document.getElementById('mobileNavBg');
  const closeMobileNav = () => { ham?.classList.remove('open'); mobileNav?.classList.remove('open'); mobileNavBg?.classList.remove('open'); };
  ham?.addEventListener('click', () => {
    const opening = !mobileNav?.classList.contains('open');
    ham.classList.toggle('open', opening);
    mobileNav?.classList.toggle('open', opening);
    mobileNavBg?.classList.toggle('open', opening);
  });
  mobileNav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));
  document.getElementById('mobileNavClose')?.addEventListener('click', closeMobileNav);
  mobileNavBg?.addEventListener('click', closeMobileNav);
  document.getElementById('mobileNavSearchForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('mobileNavSearchInput')?.value.trim();
    if (q) window.location.href = 'all-perfumes.html?q=' + encodeURIComponent(q);
  });
  initMobileNavAdminForm();

  // Scroll animations
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
  window.fadeUpObserver = observer; // so content rendered later (e.g. reviews) can opt in too

  renderFeaturedSection();
  initFeaturedCarousel();
  renderReviewsSection();
  initReviewForm();
  initReviewsCarousel();

  // Modal close
  document.getElementById('productModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (!t) return; e.preventDefault();
      const off = document.getElementById('navbar')?.offsetHeight || 70;
      window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - off, behavior: 'smooth' });
    });
  });

  // Cart drawer bg
  document.getElementById('cartDrawerBg')?.addEventListener('click', closeCart);

  // Navbar search
  initNavbarSearch();

  // Hero parallax — the emblem drifts gently toward the cursor
  const heroSection = document.getElementById('home');
  const heroVisualWrap = document.getElementById('heroVisualWrap');
  const canParallax = heroSection && heroVisualWrap
    && window.matchMedia('(pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canParallax) {
    heroSection.addEventListener('mousemove', e => {
      const r = heroSection.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - .5) * 2;
      const y = ((e.clientY - r.top) / r.height - .5) * 2;
      heroVisualWrap.style.transform = `translate(${x * 14}px, ${y * 14}px)`;
    }, { passive: true });
    heroSection.addEventListener('mouseleave', () => {
      heroVisualWrap.style.transform = 'translate(0,0)';
    });
  }
});
