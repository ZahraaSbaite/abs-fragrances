/**
 * ABS FRAGRANCES — sales-admin.js
 * Admin "Sales & Bundles" page: put perfumes on sale (new price per perfume) and
 * manage bundle offers. Relies on dashboard.js helpers (esc, showToast, getBrandName,
 * getBrandEmoji, loadProductsData) and products.js (PRODUCTS, formatPrice).
 */
(function injectSalesCss() {
  const st = document.createElement('style');
  st.textContent = `
    .sl-card { background:var(--white); box-shadow:0 1px 8px rgba(22,56,70,.05); margin-bottom:1.8rem; }
    .sl-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.8rem; padding:1.1rem 1.3rem; border-bottom:1px solid rgba(22,56,70,.08); }
    .sl-head h3 { margin:0; font-family:var(--serif); font-size:1.15rem; color:var(--navy); font-weight:500; }
    .sl-sub { font-family:var(--sans); font-size:.75rem; color:var(--muted); }
    .sl-bar { display:flex; gap:.7rem; align-items:center; flex-wrap:wrap; padding:1rem 1.3rem; }
    .sl-search { flex:1 1 220px; max-width:320px; padding:.65rem .9rem; border:1px solid rgba(22,56,70,.18); font-family:var(--sans); font-size:.82rem; outline:none; background:var(--white); color:var(--navy); }
    .sl-search:focus { border-color:var(--gold); }
    .sl-chips { display:flex; gap:.5rem; flex-wrap:wrap; }
    .sl-chip { padding:.5rem .95rem; border:1px solid rgba(22,56,70,.18); background:var(--white); color:var(--muted); font-family:var(--sans); font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
    .sl-chip.active { background:var(--bg); color:var(--navy); border-color:var(--gold); }
    .sl-price { width:96px; padding:.45rem .6rem; border:1px solid rgba(22,56,70,.18); font-family:var(--sans); font-size:.82rem; outline:none; }
    .sl-price:disabled { background:rgba(22,56,70,.04); color:var(--muted); }
    .sl-old { text-decoration:line-through; color:var(--muted); }
    .sl-tag { font-family:var(--sans); font-size:.62rem; letter-spacing:.08em; text-transform:uppercase; padding:.2rem .5rem; background:#b3372f; color:#fff; }
    .sl-tag.off { background:rgba(22,56,70,.1); color:var(--muted); }
    .sl-scroll { max-height:560px; overflow:auto; }
    .sl-form { padding:1.3rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem; border-bottom:1px solid rgba(22,56,70,.08); background:rgba(196,162,112,.06); }
    .sl-form .full { grid-column:1/-1; }
    .sl-form label { display:block; font-family:var(--sans); font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:.35rem; }
    .sl-items { display:flex; flex-direction:column; gap:.4rem; margin-top:.6rem; }
    .sl-item { display:flex; align-items:center; gap:.7rem; background:var(--white); padding:.45rem .7rem; border:1px solid rgba(22,56,70,.1); font-family:var(--sans); font-size:.82rem; }
    .sl-item span:first-child { flex:1; }
    .sl-qty { width:60px; padding:.3rem .4rem; border:1px solid rgba(22,56,70,.18); }
    .sl-photo { display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
    .sl-photo-prev { width:200px; height:120px; background:var(--white); border:1px dashed rgba(22,56,70,.2); display:flex; align-items:center; justify-content:center; text-align:center; padding:.4rem; overflow:hidden; }
    .sl-photo-prev img { width:100%; height:100%; object-fit:cover; }
    @media (max-width:700px){ .sl-form{grid-template-columns:1fr;} }`;
  document.head.appendChild(st);
})();

const SL = { search: '', filter: '', draft: {}, bundles: [], form: null };

function slToken() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }; }
function slCents(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) : null; }

/* ── entry point (called by the view router) ── */
async function renderSalesView() {
  // Draft starts from what is saved: checked = currently on sale.
  SL.draft = {};
  Object.values(PRODUCTS).forEach(p => {
    SL.draft[p.id] = { on: p.onSale, value: p.onSale ? (p.saleCents / 100).toFixed(2) : '' };
  });
  SL.form = null;
  try {
    const r = await fetch(`${API_BASE}/bundles/all`, { headers: slToken() });
    const d = await r.json();
    SL.bundles = r.ok ? d.bundles : [];
  } catch { SL.bundles = []; }
  slRender();
}

function slRender() {
  document.getElementById('dashContent').innerHTML = `
    <div class="sl-card" id="slSales">
      <div class="sl-head">
        <div>
          <h3>Perfume sales</h3>
          <div class="sl-sub">Tick the perfumes to put on sale, type the new price, then save. Sale perfumes appear in the “Sale” tab of All Perfumes.</div>
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="slEndAll()">End all sales</button>
          <button class="btn btn-gold btn-sm" onclick="slSaveSales()">Save sales</button>
        </div>
      </div>
      <div class="sl-bar">
        <input class="sl-search" id="slSearch" placeholder="Search perfumes…" value="${esc(SL.search)}" oninput="SL.search=this.value;slRows()" />
        <div class="sl-chips">
          ${['', 'Men', 'Women', 'Unisex', 'Musk', 'OnSale'].map(g => `<button class="sl-chip ${SL.filter === g ? 'active' : ''}" onclick="SL.filter='${g}';slChips();slRows()">${g === '' ? 'All' : g === 'OnSale' ? 'On sale' : g}</button>`).join('')}
        </div>
        <div style="margin-left:auto;display:flex;gap:.4rem;align-items:center">
          <input class="sl-price" id="slPct" type="number" min="1" max="99" placeholder="% off" />
          <button class="btn btn-outline btn-sm" onclick="slApplyPct()">Apply to ticked</button>
        </div>
      </div>
      <div class="sl-scroll">
        <table class="data-table">
          <thead><tr><th style="width:40px"></th><th style="width:60px">Photo</th><th>Perfume</th><th>Brand</th><th>Regular price</th><th>Sale price ($)</th><th>Status</th></tr></thead>
          <tbody id="slBody"></tbody>
        </table>
      </div>
    </div>

    <div class="sl-card" id="slBundles">
      <div class="sl-head">
        <div>
          <h3>Bundle offers</h3>
          <div class="sl-sub">Bundles are shown on the home page only. Switch a bundle off to hide it.</div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="slOpenBundle()">+ New bundle</button>
      </div>
      <div id="slBundleForm"></div>
      <table class="data-table">
        <thead><tr><th>Bundle</th><th>Perfumes</th><th>Regular total</th><th>Bundle price</th><th>Visible</th><th>Actions</th></tr></thead>
        <tbody id="slBundleBody"></tbody>
      </table>
    </div>`;
  slRows();
  slBundleRows();
}

function slChips() {
  document.querySelectorAll('.sl-chip').forEach((c, i) => c.classList.toggle('active', ['', 'Men', 'Women', 'Unisex', 'Musk', 'OnSale'][i] === SL.filter));
}

function slVisibleProducts() {
  const q = SL.search.toLowerCase().trim();
  return Object.values(PRODUCTS).filter(p => {
    if (SL.filter === 'OnSale') { if (!SL.draft[p.id]?.on) return false; }
    else if (SL.filter && p.gender !== SL.filter) return false;
    return !q || p.name.toLowerCase().includes(q) || getBrandName(p.brand).toLowerCase().includes(q);
  });
}

function slRows() {
  const body = document.getElementById('slBody');
  if (!body) return;
  const list = slVisibleProducts();
  if (!list.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No perfumes found.</td></tr>'; return; }
  body.innerHTML = list.map(p => {
    const d = SL.draft[p.id] || { on: false, value: '' };
    const thumb = p.image ? `<img src="${esc(p.image)}" style="width:100%;height:100%;object-fit:cover">` : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.2rem">${getBrandEmoji(p.brand)}</span>`;
    return `<tr>
      <td><input type="checkbox" ${d.on ? 'checked' : ''} onchange="slToggle('${p.id}',this.checked)" /></td>
      <td><div style="width:40px;height:48px;overflow:hidden;background:var(--bg)">${thumb}</div></td>
      <td style="font-size:.85rem;color:var(--navy)">${esc(p.name)}</td>
      <td style="font-size:.78rem">${esc(getBrandName(p.brand))}</td>
      <td style="font-size:.82rem" id="slo-${p.id}" class="${d.on ? 'sl-old' : ''}">${p.regularPrice}</td>
      <td><input class="sl-price" type="number" min="0" step="0.01" id="slp-${p.id}" value="${esc(d.value)}" ${d.on ? '' : 'disabled'} oninput="SL.draft['${p.id}'].value=this.value;slStatus('${p.id}')" /></td>
      <td id="sls-${p.id}">${slStatusTag(p)}</td>
    </tr>`;
  }).join('');
}

// Status = what customers see right now vs. what the admin has changed but not saved yet.
function slStatusTag(p) {
  const d = SL.draft[p.id] || { on: false, value: '' };
  const savedValue = p.onSale ? (p.saleCents / 100).toFixed(2) : '';
  const changed = d.on !== p.onSale || (d.on && slCents(d.value) !== slCents(savedValue));
  if (changed) return '<span class="sl-tag off" style="background:rgba(196,162,112,.2);color:var(--gold)">Not saved</span>';
  return p.onSale ? '<span class="sl-tag">On sale</span>' : '<span class="sl-tag off">Regular</span>';
}

function slStatus(id) {
  const cell = document.getElementById('sls-' + id);
  if (cell) cell.innerHTML = slStatusTag(PRODUCTS[id]);
}

function slToggle(id, on) {
  SL.draft[id].on = on;
  if (!on) SL.draft[id].value = '';
  const inp = document.getElementById('slp-' + id);
  if (inp) { inp.disabled = !on; if (!on) inp.value = ''; if (on) inp.focus(); }
  document.getElementById('slo-' + id)?.classList.toggle('sl-old', on);
  slStatus(id);
}

function slApplyPct() {
  const pct = parseFloat(document.getElementById('slPct').value);
  if (!(pct > 0 && pct < 100)) { showToast('Enter a percentage between 1 and 99', 'error'); return; }
  let n = 0;
  Object.values(PRODUCTS).forEach(p => {
    const d = SL.draft[p.id];
    if (d && d.on) { d.value = (p.priceCents * (1 - pct / 100) / 100).toFixed(2); n++; }
  });
  if (!n) { showToast('Tick at least one perfume first', 'error'); return; }
  slRows();
  showToast(`${pct}% off applied to ${n} perfume${n > 1 ? 's' : ''} — press Save sales`);
}

async function slSaveSales() {
  const items = [];
  for (const p of Object.values(PRODUCTS)) {
    const d = SL.draft[p.id];
    if (!d) continue;
    if (d.on) {
      const cents = slCents(d.value);
      if (cents === null || cents < 0) { showToast(`Enter a sale price for "${p.name}"`, 'error'); return; }
      if (cents >= p.priceCents) { showToast(`Sale price for "${p.name}" must be lower than ${p.regularPrice}`, 'error'); return; }
      items.push({ product_id: p.id, sale_price_cents: cents });
    } else if (p.onSale) {
      items.push({ product_id: p.id, sale_price_cents: null }); // unticked → sale ends
    }
  }
  if (!items.length) { showToast('Nothing to save — tick a perfume and enter a price', 'error'); return; }
  try {
    const r = await fetch(`${API_BASE}/sales`, { method: 'PUT', headers: slToken(), body: JSON.stringify({ items }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to save sales');
    showToast('Sales saved ✓', 'success');
    await loadProductsData();
    renderSalesView();
  } catch (err) { showToast(err.message || 'Could not reach the server.', 'error'); }
}

async function slEndAll() {
  if (!confirm('End every sale? All perfumes go back to their regular price.')) return;
  // Clear ticks and typed prices straight away, saved or not.
  Object.keys(SL.draft).forEach(id => { SL.draft[id] = { on: false, value: '' }; });
  const pct = document.getElementById('slPct');
  if (pct) pct.value = '';
  slRows();
  if (!Object.values(PRODUCTS).some(p => p.onSale)) { showToast('All sales ended'); return; }
  try {
    const r = await fetch(`${API_BASE}/sales`, { method: 'DELETE', headers: slToken() });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    showToast('All sales ended');
    await loadProductsData();
    renderSalesView();
  } catch (err) { showToast(err.message || 'Could not reach the server.', 'error'); }
}

/* ── bundles ── */
function slBundleRows() {
  const body = document.getElementById('slBundleBody');
  if (!body) return;
  if (!SL.bundles.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">No bundle offers yet. Click “+ New bundle”.</td></tr>'; return; }
  body.innerHTML = SL.bundles.map(b => {
    const regular = b.items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
    return `<tr>
      <td style="font-size:.85rem;color:var(--navy)">${esc(b.name)}</td>
      <td style="font-size:.78rem">${b.items.map(i => `${i.quantity > 1 ? i.quantity + '× ' : ''}${esc(i.name)}`).join(', ')}</td>
      <td class="sl-old" style="font-size:.82rem">${formatPrice(regular)}</td>
      <td style="font-size:.85rem;font-weight:500">${formatPrice(b.price_cents)}</td>
      <td><input type="checkbox" ${b.is_active ? 'checked' : ''} onchange="slBundleActive('${b.id}',this.checked)" /></td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="slOpenBundle('${b.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="slDeleteBundle('${b.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function slOpenBundle(id) {
  const b = id ? SL.bundles.find(x => x.id === id) : null;
  SL.form = b
    ? { id: b.id, name: b.name, description: b.description || '', image_url: b.image_url || '', price: (b.price_cents / 100).toFixed(2), is_active: b.is_active, items: b.items.map(i => ({ product_id: i.product_id, quantity: i.quantity })) }
    : { id: null, name: '', description: '', image_url: '', price: '', is_active: true, items: [] };
  slFormRender();
  document.getElementById('slBundleForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function slFormRender() {
  const box = document.getElementById('slBundleForm');
  const f = SL.form;
  if (!f) { box.innerHTML = ''; return; }
  const regular = f.items.reduce((s, i) => s + (PRODUCTS[i.product_id]?.priceCents || 0) * i.quantity, 0);
  const price = slCents(f.price);
  const save = price != null ? regular - price : 0;
  const options = Object.values(PRODUCTS).filter(p => !f.items.some(i => i.product_id === p.id))
    .map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(getBrandName(p.brand))} (${p.regularPrice})</option>`).join('');
  box.innerHTML = `<div class="sl-form">
    <div><label>Bundle name</label><input class="form-input" value="${esc(f.name)}" oninput="SL.form.name=this.value" placeholder="e.g. Gift set for him" /></div>
    <div><label>Bundle price ($)</label><input class="form-input" type="number" min="0" step="0.01" value="${esc(f.price)}" oninput="SL.form.price=this.value;slSummary()" /></div>
    <div class="full"><label>Description (optional)</label><input class="form-input" value="${esc(f.description)}" oninput="SL.form.description=this.value" /></div>
    <div class="full">
      <label>Bundle photo (shown on the right of the offer)</label>
      <div class="sl-photo">
        <div class="sl-photo-prev">${f.image_url ? `<img src="${esc(f.image_url)}" alt="">` : '<span class="sl-sub">No photo — the perfumes’ photos are used</span>'}</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <label class="btn btn-outline btn-sm" style="margin:0;cursor:pointer;text-transform:none;letter-spacing:0">${f.image_url ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/*" hidden onchange="slBundlePhoto(this)" /></label>
          ${f.image_url ? '<button class="btn btn-danger btn-sm" onclick="SL.form.image_url=\'\';slFormRender()">Remove</button>' : ''}
        </div>
      </div>
    </div>
    <div class="full">
      <label>Perfumes in this bundle</label>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        <select class="form-select" id="slAddPerfume" style="flex:1;min-width:220px"><option value="">Add a perfume…</option>${options}</select>
        <button class="btn btn-outline btn-sm" onclick="slAddItem()">+ Add</button>
      </div>
      <div class="sl-items">${f.items.map((i, idx) => `<div class="sl-item"><span>${esc(PRODUCTS[i.product_id]?.name || i.product_id)}</span><span class="sl-sub">${PRODUCTS[i.product_id]?.regularPrice || ''}</span>
        <input class="sl-qty" type="number" min="1" value="${i.quantity}" onchange="SL.form.items[${idx}].quantity=Math.max(1,parseInt(this.value)||1);slFormRender()" />
        <button class="btn btn-danger btn-sm" onclick="SL.form.items.splice(${idx},1);slFormRender()">✕</button></div>`).join('') || '<div class="sl-sub">No perfumes added yet.</div>'}</div>
      <div class="sl-sub" id="slSummary" style="margin-top:.6rem"></div>
    </div>
    <div><label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-size:.82rem"><input type="checkbox" ${f.is_active ? 'checked' : ''} onchange="SL.form.is_active=this.checked" /> Show on the home page</label></div>
    <div style="display:flex;gap:.6rem;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="SL.form=null;slFormRender()">Cancel</button>
      <button class="btn btn-gold btn-sm" onclick="slSaveBundle()">${f.id ? 'Save changes' : 'Create bundle'}</button>
    </div>
  </div>`;
  slSummary();
}

function slSummary() {
  const el = document.getElementById('slSummary');
  if (!el || !SL.form) return;
  const regular = SL.form.items.reduce((s, i) => s + (PRODUCTS[i.product_id]?.priceCents || 0) * i.quantity, 0);
  const price = slCents(SL.form.price);
  el.textContent = `Regular total ${formatPrice(regular)}` + (price != null ? ` · customer saves ${formatPrice(Math.max(0, regular - price))}` : '');
}

async function slBundlePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    SL.form.image_url = await compressImage(file, 1200, 0.82);
    slFormRender();
  } catch (err) { showToast(err.message || 'Could not read that image', 'error'); }
}

function slAddItem() {
  const id = document.getElementById('slAddPerfume').value;
  if (!id) return;
  SL.form.items.push({ product_id: id, quantity: 1 });
  slFormRender();
}

async function slSaveBundle() {
  const f = SL.form;
  const price = slCents(f.price);
  if (!f.name.trim()) { showToast('Give the bundle a name', 'error'); return; }
  if (price === null || price < 0) { showToast('Enter the bundle price', 'error'); return; }
  if (!f.items.length) { showToast('Add at least one perfume', 'error'); return; }
  const body = { name: f.name.trim(), description: f.description.trim(), image_url: f.image_url.trim(), price_cents: price, is_active: f.is_active, items: f.items };
  try {
    const r = await fetch(`${API_BASE}/bundles${f.id ? '/' + f.id : ''}`, { method: f.id ? 'PUT' : 'POST', headers: slToken(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to save bundle');
    showToast(f.id ? 'Bundle updated ✓' : 'Bundle created ✓', 'success');
    SL.form = null;
    const all = await fetch(`${API_BASE}/bundles/all`, { headers: slToken() });
    SL.bundles = (await all.json()).bundles || [];
    slFormRender(); slBundleRows();
  } catch (err) { showToast(err.message || 'Could not reach the server.', 'error'); }
}

async function slBundleActive(id, on) {
  const b = SL.bundles.find(x => x.id === id);
  if (!b) return;
  try {
    const r = await fetch(`${API_BASE}/bundles/${id}`, { method: 'PUT', headers: slToken(), body: JSON.stringify({ name: b.name, description: b.description, image_url: b.image_url, price_cents: b.price_cents, is_active: on, items: b.items.map(i => ({ product_id: i.product_id, quantity: i.quantity })) }) });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    b.is_active = on;
    showToast(on ? 'Bundle is now on the home page' : 'Bundle hidden from the home page');
  } catch (err) { showToast(err.message || 'Could not reach the server.', 'error'); slBundleRows(); }
}

async function slDeleteBundle(id) {
  if (!confirm('Delete this bundle offer?')) return;
  try {
    const r = await fetch(`${API_BASE}/bundles/${id}`, { method: 'DELETE', headers: slToken() });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    SL.bundles = SL.bundles.filter(b => b.id !== id);
    showToast('Bundle deleted');
    slBundleRows();
  } catch (err) { showToast(err.message || 'Could not reach the server.', 'error'); }
}
