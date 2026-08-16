/* ── INIT ── */
const session = getSession();
if (session) {
  document.getElementById('sidebarName').textContent = session.name;
  document.getElementById('sidebarEmail').textContent = session.email;
  document.getElementById('sidebarInitials').textContent = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── HELPERS ── */
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function getBrandName(id) { return BRANDS[id]?.name || id || '—'; }
function getBrandEmoji(id) { const m = { rasasi: '🌹', lattafa: '🔮', rueBroca: '🌿', frenchAvenue: '🗼', assaf: '🪔', afnan: '💎', rayhaan: '🌸', alHambra: '🏰' }; return m[id] || '🧴'; }

// Matches the backend's real order.status values exactly.
const ORDER_STATUSES = [
  { key: 'Pending', label: 'Pending', color: '#b8860b', bg: '#fff8e1' },
  { key: 'Confirmed', label: 'Confirmed', color: '#1565c0', bg: '#e3f2fd' },
  { key: 'Shipped', label: 'Shipped', color: '#e65100', bg: '#fff3e0' },
  { key: 'Delivered', label: 'Delivered', color: '#2e7d32', bg: '#e8f5e9' },
  { key: 'Cancelled', label: 'Cancelled', color: '#c0392b', bg: 'rgba(192,57,43,.1)' },
];
function statusMeta(key) { return ORDER_STATUSES.find(s => s.key === key) || { label: key, color: 'var(--muted)', bg: 'var(--bg)' }; }
function statusBadge(key) { const m = statusMeta(key); return `<span style="font-family:var(--sans);font-size:.6rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:.25rem .7rem;background:${m.bg};color:${m.color};white-space:nowrap">${m.label}</span>`; }

/* ── TOAST ── */
function showToast(msg, type = '') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}

/* ── DATA (real API, cached in memory per tab-switch) ── */
let ordersCache = [];
async function loadOrdersData() {
  ordersCache = await Orders.fetchAll(getToken());
  refreshPendingBadge();
  return ordersCache;
}
async function loadProductsData() {
  await initProducts(true); // force: the dashboard always needs live data, not the cached-once copy
  return Object.values(PRODUCTS);
}
function refreshPendingBadge() {
  const cnt = ordersCache.filter(o => o.status === 'Pending').length;
  const b = document.getElementById('pendingBadge'); if (b) { b.textContent = cnt; b.style.display = cnt > 0 ? '' : 'none'; }
}

/* ── CONFIRM ── */
function confirm2(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmOkBtn').onclick = () => { closeConfirm(); cb(); };
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

/* ── ORDERS ── */
async function setOrderStatus(id, ns) {
  if (!ns) return;
  try {
    await Orders.updateStatus(id, ns, getToken());
    showToast('Order ' + id + ' → ' + statusMeta(ns).label, 'success');
    await loadOrdersData();
    renderOrders();
  } catch (err) { showToast(err.message || 'Failed to update status', 'error'); }
}
function deleteOrder(id) {
  confirm2('Delete Order?', 'Order ' + id + ' will be permanently removed.', async () => {
    try {
      await Orders.deleteOrder(id, getToken());
      showToast('Order deleted');
      await loadOrdersData();
      renderOrders();
    } catch (err) { showToast(err.message || 'Failed to delete order', 'error'); }
  });
}

/* ── PHOTO (image_url field on the product) ── */
function previewPhotoUrl() {
  const url = document.getElementById('fpPhoto').value.trim();
  const img = document.getElementById('photoPreviewImg');
  const ph = document.getElementById('photoPlaceholder');
  if (url) { img.src = url; img.style.display = 'block'; ph.style.display = 'none'; img.onerror = () => { img.style.display = 'none'; ph.style.display = 'flex'; }; }
  else { img.style.display = 'none'; ph.style.display = 'flex'; }
}
function handlePhotoUpload(input) {
  // Note: this embeds the image as a data: URL string in image_url. Fine for a
  // quick demo, but a real image-hosting/upload flow would be better long-term.
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const d = e.target.result; document.getElementById('fpPhoto').value = d;
    const img = document.getElementById('photoPreviewImg');
    img.src = d; img.style.display = 'block'; document.getElementById('photoPlaceholder').style.display = 'none';
  }; reader.readAsDataURL(input.files[0]);
}

/* ── PRODUCT FORM ── */
function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

function openProductForm(existingId) {
  const overlay = document.getElementById('productFormOverlay');
  ['fpId', 'fpName', 'fpShortDesc', 'fpFullDesc', 'fpNotes', 'fpBadge', 'fpPhoto', 'fpPrice'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fpGender').value = 'Men'; document.getElementById('fpIntensity').value = 'Moderate';
  const brandSel = document.getElementById('fpBrand');
  brandSel.innerHTML = '<option value="">Select brand…</option>' +
    Object.values(BRANDS).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  brandSel.value = ''; document.getElementById('fpStock').value = 'true';
  document.getElementById('fpError').style.display = 'none';
  document.getElementById('photoPreviewImg').style.display = 'none';
  document.getElementById('photoPlaceholder').style.display = 'flex';
  if (existingId) {
    document.getElementById('productFormTitle').textContent = 'Edit Perfume';
    const p = PRODUCTS[existingId];
    if (p) {
      document.getElementById('fpId').value = existingId;
      document.getElementById('fpName').value = p.name || '';
      document.getElementById('fpBrand').value = p.brand || '';
      document.getElementById('fpGender').value = p.gender || 'Men';
      document.getElementById('fpIntensity').value = p.intensity || 'Moderate';
      document.getElementById('fpShortDesc').value = p.shortDesc || '';
      document.getElementById('fpFullDesc').value = p.fullDesc || '';
      document.getElementById('fpNotes').value = (p.notes || []).join(', ');
      document.getElementById('fpBadge').value = p.badge || '';
      document.getElementById('fpStock').value = p.stock === false ? 'false' : 'true';
      document.getElementById('fpPrice').value = p.priceCents != null ? (p.priceCents / 100).toFixed(2) : '';
      if (p.image) {
        document.getElementById('fpPhoto').value = p.image;
        const img = document.getElementById('photoPreviewImg');
        img.src = p.image; img.style.display = 'block'; document.getElementById('photoPlaceholder').style.display = 'none';
      }
    }
  } else {
    document.getElementById('productFormTitle').textContent = 'Add New Perfume';
  }
  overlay.classList.add('open');
}
function closeProductForm() { document.getElementById('productFormOverlay').classList.remove('open'); }

async function saveProductForm() {
  const errEl = document.getElementById('fpError'); errEl.style.display = 'none';
  const id = document.getElementById('fpId').value;
  const name = document.getElementById('fpName').value.trim();
  const brand = document.getElementById('fpBrand').value;
  const gender = document.getElementById('fpGender').value;
  const intensity = document.getElementById('fpIntensity').value;
  const shortDesc = document.getElementById('fpShortDesc').value.trim();
  const fullDesc = document.getElementById('fpFullDesc').value.trim();
  const notes = document.getElementById('fpNotes').value.split(',').map(n => n.trim()).filter(Boolean);
  const badge = document.getElementById('fpBadge').value.trim();
  const stock = document.getElementById('fpStock').value === 'true';
  const photo = document.getElementById('fpPhoto').value.trim();
  const priceStr = document.getElementById('fpPrice').value.trim();

  if (!name) { errEl.textContent = 'Perfume name is required'; errEl.style.display = 'block'; return; }
  if (!brand) { errEl.textContent = 'Please select a brand'; errEl.style.display = 'block'; return; }
  if (!shortDesc) { errEl.textContent = 'Short description is required'; errEl.style.display = 'block'; return; }
  if (!priceStr || isNaN(parseFloat(priceStr))) { errEl.textContent = 'Please enter a valid price'; errEl.style.display = 'block'; return; }

  const body = {
    name, brand_id: brand, gender, intensity,
    short_desc: shortDesc, full_desc: fullDesc || shortDesc,
    notes, badge, badge_class: badge ? 'badge-gold' : '',
    in_stock: stock, image_url: photo || null,
    price_cents: Math.round(parseFloat(priceStr) * 100),
  };

  try {
    let res;
    if (id) {
      res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
    } else {
      body.id = slugify(name);
      res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed to save product'; errEl.style.display = 'block'; return; }

    showToast('"' + name + '" ' + (id ? 'updated' : 'added') + '!', 'success');
    closeProductForm();
    await loadProductsData();
    if (currentView === 'products') renderProducts();
    if (currentView === 'overview') renderOverview();
  } catch (err) {
    errEl.textContent = 'Could not reach the server.'; errEl.style.display = 'block';
  }
}

function deleteProduct(id) {
  const p = PRODUCTS[id]; const name = p?.name || id;
  confirm2('Delete "' + name + '"?', 'This perfume will be permanently removed from the catalog.', async () => {
    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to delete product', 'error'); return; }
      showToast('"' + name + '" deleted');
      await loadProductsData();
      renderProducts();
    } catch (err) { showToast('Could not reach the server.', 'error'); }
  });
}

/* ── OVERVIEW ── */
function renderOverview() {
  const orders = ordersCache;
  const prods = Object.values(PRODUCTS);
  const cs = key => orders.filter(o => o.status === key).length;
  const html = `
    <div class="metrics-row">
      <div class="stat-card"><div class="stat-icon stat-icon-gold"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></div><div class="stat-val">${orders.length}</div><div class="stat-label">Total Orders</div></div>
      <div class="stat-card"><div class="stat-icon stat-icon-red"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="stat-val">${cs('Pending')}</div><div class="stat-label">Pending</div>${cs('Pending') > 0 ? '<div class="stat-change down">⚠ Needs action</div>' : ''}</div>
      <div class="stat-card"><div class="stat-icon stat-icon-navy"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div><div class="stat-val">${cs('Confirmed') + cs('Shipped')}</div><div class="stat-label">Confirmed / Shipped</div></div>
      <div class="stat-card"><div class="stat-icon stat-icon-green"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg></div><div class="stat-val">${cs('Delivered')}</div><div class="stat-label">Delivered</div></div>
      <div class="stat-card"><div class="stat-icon stat-icon-navy"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg></div><div class="stat-val">${prods.length}</div><div class="stat-label">Products</div></div>
    </div>
    <div class="table-card" style="margin-bottom:1.5rem">
      <div class="table-card-header"><div class="table-card-title">Order Pipeline</div><button class="btn btn-outline btn-sm" onclick="switchView('orders')">Manage All</button></div>
      <div class="status-pipeline" style="margin:0 1.8rem 1.8rem">
        ${ORDER_STATUSES.map(s => `<div class="pipeline-step" style="background:${s.bg};color:${s.color}" onclick="switchView('orders');setTimeout(()=>filterOrders('${s.key}'),50)"><span class="step-count">${cs(s.key)}</span>${s.label}</div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:1.5rem">
      <div class="table-card">
        <div class="table-card-header"><div class="table-card-title">Recent Orders</div><button class="btn btn-outline btn-sm" onclick="switchView('orders')">All Orders</button></div>
        ${orders.length ? `<table class="data-table"><thead><tr><th>ID</th><th>Customer</th><th>Items</th><th>Status</th><th>Update</th></tr></thead><tbody>${orders.slice(0, 6).map(o => `<tr><td><strong style="font-size:.78rem">${o.id}</strong></td><td style="font-size:.78rem">${esc(o.customer_name)}</td><td style="font-size:.72rem;color:var(--muted)">${(o.items || []).map(i => i.product_name).join(', ').slice(0, 28)}…</td><td>${statusBadge(o.status)}</td><td><select class="status-sel" onchange="setOrderStatus('${o.id}',this.value)"><option value="">Change…</option>${ORDER_STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<div style="padding:1.5rem;text-align:center;font-family:var(--sans);font-size:.82rem;color:var(--muted)">No orders yet.</div>'}
      </div>
      <div class="table-card">
        <div class="table-card-header"><div class="table-card-title">Catalog (${prods.length})</div><button class="btn btn-gold btn-sm" onclick="openProductForm()">+ Add</button></div>
        <table class="data-table"><thead><tr><th>Perfume</th><th>Brand</th><th>Gender</th></tr></thead><tbody>
          ${prods.slice(0, 8).map(p => `<tr><td><strong style="font-size:.78rem">${esc(p.name)}</strong></td><td style="font-size:.72rem">${getBrandEmoji(p.brand)} ${esc(getBrandName(p.brand))}</td><td style="font-size:.72rem;color:var(--muted)">${p.gender}</td></tr>`).join('')}
          ${prods.length > 8 ? `<tr><td colspan="3" style="text-align:center;padding:.8rem;font-size:.72rem;color:var(--gold);cursor:pointer" onclick="switchView('products')">View all ${prods.length} →</td></tr>` : ''}
        </tbody></table>
      </div>
    </div>`;
  document.getElementById('dashContent').innerHTML = html;
}

/* ── ORDERS ── */
let orderFilterStatus = '';
function renderOrders() {
  const orders = ordersCache;
  const cs = key => orders.filter(o => o.status === key).length;
  const html = `
    <div class="status-pipeline" style="margin-bottom:1.5rem">
      <div class="pipeline-step ${orderFilterStatus === '' ? 'active-filter' : ''}" style="background:rgba(22,56,70,.05);color:var(--navy)" onclick="filterOrders('')"><span class="step-count">${orders.length}</span>All</div>
      ${ORDER_STATUSES.map(s => `<div class="pipeline-step ${orderFilterStatus === s.key ? 'active-filter' : ''}" style="background:${s.bg};color:${s.color}" onclick="filterOrders('${s.key}')"><span class="step-count">${cs(s.key)}</span>${s.label}</div>`).join('')}
    </div>
    <div class="filter-bar" style="margin-bottom:1.2rem">
      <div class="search-input-wrap"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="orderSearchInput" placeholder="Search by order ID or customer…" oninput="applyOrderSearch()"/></div>
      <span id="orderCount" class="catalog-count">${orders.length} orders</span>
    </div>
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Order ID</th><th>Placed</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Change</th><th>Actions</th></tr></thead>
        <tbody id="ordersTbody">${renderOrderRows(orders)}</tbody>
      </table>
    </div>`;
  document.getElementById('dashContent').innerHTML = html;
  if (orderFilterStatus) applyOrderSearch();
}
function renderOrderRows(orders) {
  if (!orders.length) return `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--muted)">No orders found.</td></tr>`;
  return orders.map(o => `<tr data-order="${o.id.toLowerCase()}" data-customer="${(o.customer_name || '').toLowerCase()}" data-status="${o.status || ''}">
    <td><strong style="font-size:.78rem">${o.id}</strong></td>
    <td style="font-size:.78rem;color:var(--muted)">${Orders.formatDate(o.placed_at)}</td>
    <td><div style="font-size:.8rem">${esc(o.customer_name)}</div><div style="font-size:.68rem;color:var(--muted)">${esc(o.customer_phone)}</div><div style="font-size:.68rem;color:var(--muted)">${esc(o.customer_address)}</div></td>
    <td style="font-size:.75rem;color:var(--muted);max-width:180px">${(o.items || []).map(i => `${esc(i.product_name)} ×${i.quantity}`).join('<br/>')}</td>
    <td style="font-size:.8rem;font-weight:500">${formatPrice(o.total_cents)}</td>
    <td>${statusBadge(o.status)}</td>
    <td><select class="status-sel" onchange="setOrderStatus('${o.id}',this.value)"><option value="">Change…</option>${ORDER_STATUSES.map(s => `<option value="${s.key}" ${o.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
    <td style="display:flex;gap:.4rem;align-items:center">
      <a href="https://wa.me/${(o.customer_phone || '').replace(/\D/g, '')}" target="_blank" class="btn btn-wa btn-sm btn-icon" title="WhatsApp">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteOrder('${o.id}')" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </td>
  </tr>`).join('');
}
function filterOrders(s) { orderFilterStatus = s; renderOrders(); }
function applyOrderSearch() {
  const q = (document.getElementById('orderSearchInput')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#ordersTbody tr[data-order]'); let shown = 0;
  rows.forEach(row => {
    const mQ = !q || row.dataset.order.includes(q) || row.dataset.customer.includes(q);
    const mS = !orderFilterStatus || row.dataset.status === orderFilterStatus;
    row.style.display = (mQ && mS) ? '' : 'none'; if (mQ && mS) shown++;
  });
  const el = document.getElementById('orderCount'); if (el) el.textContent = shown + ' order' + (shown !== 1 ? 's' : '');
}

/* ── MANAGE PERFUMES ── */
let prodGenderFilter = '';
function renderProducts() {
  const prods = Object.values(PRODUCTS);
  const html = `
    <div style="background:var(--white);box-shadow:0 1px 8px rgba(22,56,70,.05);margin-bottom:0">
      <div class="admin-filter-bar">
        <div class="filter-chips">
          ${['', 'Men', 'Women', 'Unisex', 'Musk'].map(g => `<button class="filter-chip ${prodGenderFilter === g ? 'active' : ''}" onclick="setProdGender('${g}')">${g || 'All'}</button>`).join('')}
        </div>
        <div style="display:flex;gap:.7rem;align-items:center;flex:1;justify-content:flex-end;flex-wrap:wrap">
          <select id="prodBrandFilter" onchange="applyProdSearch()" style="font-family:var(--sans);font-size:.72rem;padding:.45rem .7rem;border:1px solid rgba(22,56,70,.18);background:var(--white);color:var(--navy);outline:none;cursor:pointer">
            <option value="">All Brands</option>
            ${Object.values(BRANDS).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
          </select>
          <div class="search-input-wrap"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="search-input" id="prodSearch" placeholder="Search perfumes…" oninput="applyProdSearch()"/>
          </div>
          <button class="btn btn-gold btn-sm" onclick="openProductForm()">+ Add New</button>
          <span id="prodCount" style="font-family:var(--sans);font-size:.72rem;color:var(--muted);white-space:nowrap">${prods.length} perfumes</span>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th style="width:60px">Photo</th><th>Perfume</th><th>Brand</th><th>Gender</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody id="prodTbody">${renderProdRows(prods)}</tbody>
      </table>
    </div>`;
  document.getElementById('dashContent').innerHTML = html;
}
function setProdGender(g) { prodGenderFilter = g; renderProducts(); }
function renderProdRows(prods) {
  if (!prods.length) return `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--muted)">No perfumes match this filter.</td></tr>`;
  return prods.map(p => {
    const thumb = p.image ? `<img src="${esc(p.image)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextSibling.style.display='flex'">` : '';
    const fallback = `<span style="${p.image ? 'display:none;' : ''}width:100%;height:100%;align-items:center;justify-content:center;font-size:1.4rem;display:flex">${getBrandEmoji(p.brand)}</span>`;
    const stockBadge = p.stock !== false ? `<span style="font-size:.6rem;font-family:var(--sans);font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.2rem .6rem;background:rgba(39,174,96,.12);color:#2e7d32">In Stock</span>` : `<span style="font-size:.6rem;font-family:var(--sans);font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.2rem .6rem;background:rgba(192,57,43,.08);color:var(--danger)">Out</span>`;
    return `<tr data-name="${(p.name || '').toLowerCase()}" data-brand="${p.brand || ''}" data-gender="${p.gender || ''}">
      <td><div style="width:48px;height:56px;overflow:hidden;background:var(--bg)">${thumb}${fallback}</div></td>
      <td><div style="font-weight:400;font-size:.82rem;color:var(--navy)">${esc(p.name)}</div>${p.badge ? `<span style="font-size:.55rem;font-family:var(--sans);font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:.15rem .5rem;background:rgba(196,162,112,.15);color:var(--gold)">${esc(p.badge)}</span>` : ''}</td>
      <td style="font-size:.78rem">${getBrandEmoji(p.brand)} ${esc(getBrandName(p.brand))}</td>
      <td style="font-size:.75rem;color:var(--muted)">${p.gender}</td>
      <td style="font-size:.8rem;font-weight:500">${p.price}</td>
      <td>${stockBadge}</td>
      <td><div style="display:flex;gap:.4rem">
        <button class="btn btn-outline btn-sm" onclick="openProductForm('${p.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>Del
        </button>
      </div></td>
    </tr>`;
  }).join('');
}
function applyProdSearch() {
  const q = (document.getElementById('prodSearch')?.value || '').toLowerCase().trim();
  const b = document.getElementById('prodBrandFilter')?.value || '';
  const rows = document.querySelectorAll('#prodTbody tr[data-name]'); let shown = 0;
  rows.forEach(row => {
    const mQ = !q || row.dataset.name.includes(q) || getBrandName(row.dataset.brand).toLowerCase().includes(q);
    const mG = !prodGenderFilter || row.dataset.gender === prodGenderFilter;
    const mB = !b || row.dataset.brand === b;
    row.style.display = (mQ && mG && mB) ? '' : 'none'; if (mQ && mG && mB) shown++;
  });
  const el = document.getElementById('prodCount'); if (el) el.textContent = shown + ' perfumes';
}

/* ── MANAGE BRANDS ── */
function renderBrands() {
  const brands = Object.values(BRANDS);
  const html = `
    <div style="background:var(--white);box-shadow:0 1px 8px rgba(22,56,70,.05)">
      <div class="admin-filter-bar" style="justify-content:space-between">
        <span style="font-family:var(--sans);font-size:.72rem;color:var(--muted)">${brands.length} brands</span>
        <button class="btn btn-gold btn-sm" onclick="openBrandForm()">+ Add Brand</button>
      </div>
      <table class="data-table">
        <thead><tr><th style="width:60px">Logo</th><th>Name</th><th>ID</th><th>Perfumes</th><th>Actions</th></tr></thead>
        <tbody>${renderBrandRows(brands)}</tbody>
      </table>
    </div>`;
  document.getElementById('dashContent').innerHTML = html;
}
function renderBrandRows(brands) {
  if (!brands.length) return `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--muted)">No brands yet.</td></tr>`;
  return brands.map(b => {
    const count = Object.values(PRODUCTS).filter(p => p.brand === b.id).length;
    return `<tr>
      <td style="font-size:1.4rem">${b.logo || '🧴'}</td>
      <td style="font-weight:400;font-size:.85rem;color:var(--navy)">${esc(b.name)}</td>
      <td style="font-size:.75rem;color:var(--muted)">${esc(b.id)}</td>
      <td style="font-size:.78rem">${count}</td>
      <td><div style="display:flex;gap:.4rem">
        <button class="btn btn-outline btn-sm" onclick="openBrandForm('${b.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteBrand('${b.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>Del
        </button>
      </div></td>
    </tr>`;
  }).join('');
}

function openBrandForm(existingId) {
  document.getElementById('bfError').style.display = 'none';
  const idInput = document.getElementById('bfIdInput');
  if (existingId) {
    const b = BRANDS[existingId];
    document.getElementById('brandFormTitle').textContent = 'Edit Brand';
    document.getElementById('bfId').value = existingId;
    idInput.value = existingId; idInput.disabled = true;
    document.getElementById('bfName').value = b?.name || '';
    document.getElementById('bfLogo').value = b?.logo || '';
  } else {
    document.getElementById('brandFormTitle').textContent = 'Add New Brand';
    document.getElementById('bfId').value = '';
    idInput.value = ''; idInput.disabled = false;
    document.getElementById('bfName').value = '';
    document.getElementById('bfLogo').value = '';
  }
  document.getElementById('brandFormOverlay').classList.add('open');
}
function closeBrandForm() { document.getElementById('brandFormOverlay').classList.remove('open'); }

async function saveBrandForm() {
  const errEl = document.getElementById('bfError'); errEl.style.display = 'none';
  const existingId = document.getElementById('bfId').value;
  const idVal = document.getElementById('bfIdInput').value.trim();
  const name = document.getElementById('bfName').value.trim();
  const logo = document.getElementById('bfLogo').value.trim();

  if (!name) { errEl.textContent = 'Brand name is required'; errEl.style.display = 'block'; return; }
  if (!existingId && !idVal) { errEl.textContent = 'Brand ID is required'; errEl.style.display = 'block'; return; }

  try {
    let res;
    if (existingId) {
      res = await fetch(`${API_BASE}/products/brands/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name, logo }),
      });
    } else {
      res = await fetch(`${API_BASE}/products/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: idVal, name, logo }),
      });
    }
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed to save brand'; errEl.style.display = 'block'; return; }

    showToast('"' + name + '" ' + (existingId ? 'updated' : 'added') + '!', 'success');
    closeBrandForm();
    await loadProductsData();
    if (currentView === 'brands') renderBrands();
  } catch (err) {
    errEl.textContent = 'Could not reach the server.'; errEl.style.display = 'block';
  }
}

function deleteBrand(id) {
  const b = BRANDS[id]; const name = b?.name || id;
  const count = Object.values(PRODUCTS).filter(p => p.brand === id).length;
  const warning = count > 0 ? ` ${count} perfume(s) using this brand will keep their listing but lose their brand tag.` : '';
  confirm2('Delete "' + name + '"?', 'This brand will be permanently removed.' + warning, async () => {
    try {
      const res = await fetch(`${API_BASE}/products/brands/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to delete brand', 'error'); return; }
      showToast('"' + name + '" deleted');
      await loadProductsData();
      renderBrands();
    } catch (err) { showToast('Could not reach the server.', 'error'); }
  });
}

/* ── CUSTOMER REVIEWS ── */
let reviewsCache = [];
async function loadReviewsData() {
  reviewsCache = await Reviews.fetchAll();
  return reviewsCache;
}
function renderReviews() {
  const html = `
    <div style="background:var(--white);box-shadow:0 1px 8px rgba(22,56,70,.05)">
      <div class="admin-filter-bar">
        <span style="font-family:var(--sans);font-size:.72rem;color:var(--muted)">${reviewsCache.length} reviews</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Author</th><th>Stars</th><th>Review</th><th>Product</th><th>Actions</th></tr></thead>
        <tbody>${renderReviewRows(reviewsCache)}</tbody>
      </table>
    </div>`;
  document.getElementById('dashContent').innerHTML = html;
}
function renderReviewRows(reviews) {
  if (!reviews.length) return `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--muted)">No reviews left.</td></tr>`;
  return reviews.map(r => `<tr>
    <td><div style="font-size:.8rem;color:var(--navy)">${esc(r.author_name)}</div><div style="font-size:.68rem;color:var(--muted)">${esc(r.author_location || '')}</div></td>
    <td style="font-size:.75rem;color:var(--gold)">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</td>
    <td style="font-size:.75rem;color:var(--muted);max-width:320px">${esc((r.review_text || '').slice(0, 110))}${(r.review_text || '').length > 110 ? '…' : ''}</td>
    <td style="font-size:.72rem;color:var(--muted)">${esc(r.product_label || '—')}</td>
    <td>
      <button class="btn btn-danger btn-sm" onclick="deleteReview('${r.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>Del
      </button>
    </td>
  </tr>`).join('');
}
function deleteReview(id) {
  const r = reviewsCache.find(x => x.id === id);
  confirm2('Delete this review?', `The testimonial from ${r?.author_name || 'this customer'} will be permanently removed from the homepage.`, async () => {
    try {
      await Reviews.deleteReview(id, getToken());
      showToast('Review deleted');
      await loadReviewsData();
      renderReviews();
    } catch (err) { showToast(err.message || 'Failed to delete review', 'error'); }
  });
}

/* ── ADMIN PROFILE ── */
function renderProfile() {
  const s = session || {};
  const initials = (s.name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('dashContent').innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar-row">
        <div class="profile-avatar-big">${initials}</div>
        <div>
          <div style="font-family:var(--serif);font-size:1.4rem;color:var(--navy)">${esc(s.name || 'Admin')}</div>
          <div style="font-family:var(--sans);font-size:.75rem;color:var(--muted);margin-top:.25rem">${esc(s.email || '')}</div>
          <div style="font-family:var(--sans);font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-top:.4rem">Admin Account</div>
        </div>
      </div>
      <div class="profile-form">
        <div style="font-family:var(--sans);font-size:.6rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)">Account Credentials</div>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" id="pfName" value="${esc(s.name || '')}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input class="form-input" id="pfEmail" type="email" value="${esc(s.email || '')}"/>
        </div>
        <div class="profile-form-divider"></div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input class="form-input" id="pfPassword" type="password" placeholder="••••••••"/>
          <span class="form-hint">Leave blank to keep your current password.</span>
        </div>
        <div id="pfError" style="color:var(--danger);font-family:var(--sans);font-size:.78rem;display:none"></div>
        <div class="profile-actions">
          <button class="btn btn-gold" id="pfSaveBtn" onclick="saveProfile()">Save Changes</button>
        </div>
      </div>
    </div>`;
}

async function saveProfile() {
  const name = document.getElementById('pfName').value.trim();
  const email = document.getElementById('pfEmail').value.trim();
  const password = document.getElementById('pfPassword').value;
  const errEl = document.getElementById('pfError');
  const btn = document.getElementById('pfSaveBtn');
  errEl.style.display = 'none';

  if (!name || !email) { errEl.textContent = 'Name and email are required.'; errEl.style.display = 'block'; return; }
  if (password && password.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Saving...';
  const result = await updateProfile({ name, email, password: password || undefined });
  btn.disabled = false; btn.textContent = 'Save Changes';

  if (!result.ok) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }

  document.getElementById('sidebarName').textContent = result.user.name;
  document.getElementById('sidebarEmail').textContent = result.user.email;
  document.getElementById('sidebarInitials').textContent = result.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  showToast('Profile updated!', 'success');
  renderProfile();
}

/* ── VIEW ROUTER ── */
let currentView = 'overview';
let viewToken = 0; // bumped on every switchView call; a stale (superseded) call's render is dropped
const VIEW_TITLES = { overview: 'Dashboard', orders: 'Orders', products: 'Manage Perfumes', addProduct: 'Add New Perfume', brands: 'Manage Brands', reviews: 'Customer Reviews', profile: 'Admin Profile' };
async function switchView(view) {
  const myToken = ++viewToken;
  currentView = view;
  document.querySelectorAll('.sidebar-link[data-view]').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  document.getElementById('topbarTitle').textContent = VIEW_TITLES[view] || view;
  orderFilterStatus = ''; prodGenderFilter = '';
  // Immediate feedback — matters most when the backend is slow to wake up (Render free tier).
  if (view !== 'profile') {
    document.getElementById('dashContent').innerHTML = '<div style="padding:4rem;text-align:center;color:var(--muted);font-family:var(--sans);font-size:.85rem">Loading…</div>';
  }

  if (view === 'overview') { await Promise.all([loadOrdersData(), loadProductsData()]); if (myToken !== viewToken) return; renderOverview(); }
  else if (view === 'orders') { await loadOrdersData(); if (myToken !== viewToken) return; renderOrders(); }
  else if (view === 'products') { await loadProductsData(); if (myToken !== viewToken) return; renderProducts(); }
  else if (view === 'addProduct') { await loadProductsData(); if (myToken !== viewToken) return; openProductForm(); switchView('products'); return; }
  else if (view === 'brands') { await loadProductsData(); if (myToken !== viewToken) return; renderBrands(); }
  else if (view === 'reviews') { await loadReviewsData(); if (myToken !== viewToken) return; renderReviews(); }
  else if (view === 'profile') { renderProfile(); }
}

/* ── MOBILE SIDEBAR ── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

/* ── BOOT ── */
document.querySelectorAll('.sidebar-link[data-view]').forEach(l => l.addEventListener('click', () => switchView(l.dataset.view)));
switchView('overview');