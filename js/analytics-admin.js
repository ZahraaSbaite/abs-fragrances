/**
 * ABS FRAGRANCES — analytics-admin.js
 * Admin "Analytics" page: sales, best sellers, order pipeline and website visitors.
 * All numbers come from GET /api/analytics/summary. Charts are plain HTML/CSS (no library),
 * one colour (gold) per chart, with values in text and a hover tooltip on every bar.
 * Relies on dashboard.js (esc, showToast, getToken, switchView, viewToken) and products.js (formatPrice).
 */
(function injectAnalyticsCss() {
  const st = document.createElement('style');
  st.textContent = `
    .an-bar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.8rem; margin-bottom:1.4rem; }
    .an-note { font-family:var(--sans); font-size:.75rem; color:var(--muted); }
    .an-chips { display:flex; gap:.4rem; flex-wrap:wrap; }
    .an-chip { padding:.45rem .9rem; border:1px solid rgba(22,56,70,.18); background:var(--white); color:var(--muted); font-family:var(--sans); font-size:.68rem; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }
    .an-chip.active { background:var(--navy); color:#fff; border-color:var(--navy); }
    .an-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1rem; margin-bottom:1.5rem; }
    .an-kpi { background:var(--white); padding:1.2rem 1.3rem; box-shadow:0 1px 8px rgba(22,56,70,.05); border-left:3px solid var(--gold); }
    .an-kpi-label { font-family:var(--sans); font-size:.62rem; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
    .an-kpi-val { font-family:var(--serif); font-size:1.75rem; color:var(--navy); margin:.35rem 0 .25rem; line-height:1.1; }
    .an-kpi-sub { font-family:var(--sans); font-size:.72rem; color:var(--muted); }
    .an-up { color:#1e7e4a; } .an-down { color:#b3372f; }
    .an-card { background:var(--white); box-shadow:0 1px 8px rgba(22,56,70,.05); margin-bottom:1.5rem; }
    .an-card-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.6rem; padding:1rem 1.3rem; border-bottom:1px solid rgba(22,56,70,.08); }
    .an-card-head h3 { margin:0; font-family:var(--serif); font-size:1.1rem; font-weight:500; color:var(--navy); }
    .an-card-body { padding:1.2rem 1.3rem; }
    .an-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
    .an-grid2 > .an-card { margin-bottom:0; }
    .an-row2 { margin-bottom:1.5rem; }
    @media (max-width:900px){ .an-grid2 { grid-template-columns:1fr; } }
    /* column chart */
    .an-chart { position:relative; height:220px; padding-left:52px; }
    .an-grid-line { position:absolute; left:52px; right:0; border-top:1px dashed rgba(22,56,70,.1); }
    .an-grid-label { position:absolute; left:0; width:46px; text-align:right; transform:translateY(-50%); font-family:var(--sans); font-size:.65rem; color:var(--muted); }
    .an-cols { position:absolute; left:52px; right:0; top:0; bottom:0; display:flex; align-items:flex-end; gap:2px; }
    .an-col { flex:1; height:100%; display:flex; align-items:flex-end; cursor:default; }
    .an-col span { display:block; width:100%; max-width:38px; margin:0 auto; background:var(--gold); border-radius:4px 4px 0 0; min-height:0; transition:opacity .15s; }
    .an-col:hover span { opacity:.75; }
    .an-col.zero span { height:2px !important; background:rgba(22,56,70,.12); border-radius:0; }
    .an-xlabels { display:flex; justify-content:space-between; padding:.5rem 0 0 52px; font-family:var(--sans); font-size:.65rem; color:var(--muted); }
    .an-tip { position:fixed; z-index:9999; pointer-events:none; background:var(--navy); color:#fff; font-family:var(--sans); font-size:.75rem; padding:.45rem .65rem; border-radius:4px; box-shadow:0 4px 14px rgba(0,0,0,.2); white-space:nowrap; display:none; }
    /* horizontal bars */
    .an-hbar { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.25rem .8rem; align-items:center; margin-bottom:.75rem; font-family:var(--sans); font-size:.8rem; color:var(--navy); }
    .an-hbar-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .an-hbar-val { font-size:.75rem; color:var(--muted); text-align:right; white-space:nowrap; }
    .an-hbar-track { grid-column:1 / -1; height:8px; background:rgba(22,56,70,.06); border-radius:4px; overflow:hidden; }
    .an-hbar-track span { display:block; height:100%; background:var(--gold); border-radius:4px; }
    .an-empty { font-family:var(--sans); font-size:.8rem; color:var(--muted); padding:.6rem 0; }
    .an-table { width:100%; border-collapse:collapse; font-family:var(--sans); font-size:.8rem; }
    .an-table th { text-align:left; font-size:.62rem; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); font-weight:400; padding:.5rem .4rem; border-bottom:1px solid rgba(22,56,70,.08); }
    .an-table td { padding:.55rem .4rem; border-bottom:1px solid rgba(22,56,70,.05); color:var(--navy); }
    .an-table td.num, .an-table th.num { text-align:right; white-space:nowrap; }
    .an-status { display:flex; flex-wrap:wrap; gap:.6rem; }
    .an-status div { flex:1 1 110px; padding:.8rem; background:rgba(22,56,70,.04); font-family:var(--sans); font-size:.72rem; color:var(--muted); }
    .an-status strong { display:block; font-family:var(--serif); font-size:1.4rem; font-weight:400; color:var(--navy); }
    .an-warn { margin-top:1rem; padding:.8rem 1rem; background:rgba(179,55,47,.07); border-left:3px solid #b3372f; font-family:var(--sans); font-size:.78rem; color:var(--navy); }
    .an-tags { display:flex; flex-wrap:wrap; gap:.4rem; }
    .an-tags span { font-family:var(--sans); font-size:.72rem; padding:.3rem .6rem; background:rgba(22,56,70,.05); color:var(--navy); }`;
  document.head.appendChild(st);
})();

const AN = { days: 30, metric: 'revenue', data: null };

async function renderAnalyticsView() {
  const myToken = viewToken;
  try {
    const r = await fetch(`${API_BASE}/analytics/summary?days=${AN.days}`, { headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to load analytics');
    if (myToken !== viewToken) return; // the admin moved to another page meanwhile
    AN.data = d;
    anRender();
  } catch (err) {
    if (myToken !== viewToken) return;
    document.getElementById('dashContent').innerHTML = `<div class="an-card"><div class="an-card-body an-empty">${esc(err.message || 'Could not reach the server.')} <button class="btn btn-outline btn-sm" onclick="renderAnalyticsView()">Retry</button></div></div>`;
  }
}

function anSetDays(days) {
  AN.days = days;
  document.querySelectorAll('.an-chip[data-days]').forEach(c => c.classList.toggle('active', Number(c.dataset.days) === days));
  renderAnalyticsView();
}

const anMoney = c => '$' + ((Number(c) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const anNum = n => (Number(n) || 0).toLocaleString('en-US');
const anPeriod = () => AN.days === 7 ? 'last 7 days' : AN.days === 30 ? 'last 30 days' : AN.days === 90 ? 'last 90 days' : 'last 12 months';

// "▲ 18% vs previous 30 days" — arrow + words, so it never relies on colour alone.
function anChange(cur, prev, invert) {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  if (!prev) return cur ? `<span class="an-kpi-sub">new this period</span>` : `<span class="an-kpi-sub">no change</span>`;
  const pct = Math.round((cur - prev) / prev * 100);
  if (!pct) return `<span class="an-kpi-sub">same as previous ${AN.days} days</span>`;
  const good = invert ? pct < 0 : pct > 0;
  return `<span class="an-kpi-sub ${good ? 'an-up' : 'an-down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs previous ${AN.days} days</span>`;
}

function anKpi(label, value, sub) {
  return `<div class="an-kpi"><div class="an-kpi-label">${label}</div><div class="an-kpi-val">${value}</div>${sub}</div>`;
}

function anRender() {
  const d = AN.data, k = d.kpi, v = d.visits;
  const aov = k.paid_orders ? Number(k.revenue) / k.paid_orders : 0;
  const aovPrev = k.paid_orders_prev ? Number(k.revenue_prev) / k.paid_orders_prev : 0;
  const conv = v.visitors ? k.orders / v.visitors * 100 : 0;
  const convPrev = v.visitors_prev ? k.orders_prev / v.visitors_prev * 100 : 0;
  const cancelRate = k.orders ? k.cancelled / k.orders * 100 : 0;
  const cancelRatePrev = k.orders_prev ? k.cancelled_prev / k.orders_prev * 100 : 0;

  document.getElementById('dashContent').innerHTML = `
    <div class="an-bar">
      <div class="an-chips">
        ${[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([n, l]) => `<button class="an-chip ${AN.days === n ? 'active' : ''}" data-days="${n}" onclick="anSetDays(${n})">${l}</button>`).join('')}
      </div>
      <div class="an-note">Revenue counts Confirmed, Shipped and Delivered orders · times in Lebanon time</div>
    </div>

    <div class="an-kpis">
      ${anKpi('Revenue', anMoney(k.revenue), anChange(k.revenue, k.revenue_prev))}
      ${anKpi('Orders', anNum(k.orders), anChange(k.orders, k.orders_prev))}
      ${anKpi('Avg. order value', anMoney(aov), anChange(aov, aovPrev))}
      ${anKpi('Visitors', anNum(v.visitors), anChange(v.visitors, v.visitors_prev))}
      ${anKpi('Conversion', conv.toFixed(1) + '%', `<span class="an-kpi-sub">orders ÷ visitors</span>`)}
      ${anKpi('Cancelled', cancelRate.toFixed(0) + '%', anChange(cancelRate, cancelRatePrev, true))}
    </div>
    <div class="an-kpis">
      ${anKpi('Revenue today', anMoney(k.revenue_today), '<span class="an-kpi-sub">since midnight</span>')}
      ${anKpi('Visitors today', anNum(v.visitors_today), '<span class="an-kpi-sub">unique people</span>')}
      ${anKpi('Page views', anNum(v.views), anChange(v.views, v.views_prev))}
      ${anKpi('Awaiting confirmation', anMoney(k.pending_value), '<span class="an-kpi-sub">value of pending orders</span>')}
      ${anKpi('Revenue all time', anMoney(k.revenue_all), '<span class="an-kpi-sub">since the shop opened</span>')}
    </div>

    <div class="an-card">
      <div class="an-card-head">
        <h3 id="anChartTitle"></h3>
        <div class="an-chips">
          ${[['revenue', 'Revenue'], ['orders', 'Orders'], ['visitors', 'Visitors']].map(([m, l]) => `<button class="an-chip ${AN.metric === m ? 'active' : ''}" data-metric="${m}" onclick="anSetMetric('${m}')">${l}</button>`).join('')}
        </div>
      </div>
      <div class="an-card-body"><div id="anChart"></div></div>
    </div>

    <div class="an-grid2 an-row2">
      <div class="an-card">
        <div class="an-card-head"><h3>Best sellers</h3><span class="an-note">${anPeriod()} · excludes cancelled</span></div>
        <div class="an-card-body">${anBestTable(d.bestSellers)}</div>
      </div>
      <div class="an-card">
        <div class="an-card-head"><h3>Order pipeline</h3><button class="btn btn-outline btn-sm" onclick="switchView('orders')">Manage orders</button></div>
        <div class="an-card-body">${anPipeline(d)}</div>
      </div>
    </div>

    <div class="an-card">
      <div class="an-card-head"><h3>Top clients</h3><span class="an-note">${anPeriod()} · by number of orders · excludes cancelled · one client = one phone number</span></div>
      <div class="an-card-body">${anClients(d)}</div>
    </div>

    <div class="an-grid2 an-row2">
      <div class="an-card">
        <div class="an-card-head"><h3>Top brands</h3><span class="an-note">units sold · ${anPeriod()}</span></div>
        <div class="an-card-body">${anBars(d.brands, 'units', r => `${anNum(r.units)} sold · ${anMoney(r.revenue)}`)}</div>
      </div>
      <div class="an-card">
        <div class="an-card-head"><h3>Men · Women · Unisex · Musk</h3><span class="an-note">units sold · ${anPeriod()}</span></div>
        <div class="an-card-body">${anBars(d.genders, 'units', r => `${anNum(r.units)} sold · ${anMoney(r.revenue)}`)}</div>
      </div>
    </div>

    <div class="an-card">
      <div class="an-card-head"><h3>Website visitors</h3><span class="an-note">${d.trackingSince ? `counting since ${anDate(d.trackingSince)}` : 'counting starts with the next visit'} · each person counted once per period</span></div>
      <div class="an-card-body an-grid2" style="gap:2rem">
        <div><div class="an-kpi-label" style="margin-bottom:.8rem">Where they came from</div>${anBars(d.sources, 'visitors', r => `${anNum(r.visitors)} visitor${r.visitors === 1 ? '' : 's'}`)}</div>
        <div><div class="an-kpi-label" style="margin-bottom:.8rem">Device</div>${anBars(d.devices, 'visitors', r => `${anNum(r.visitors)} visitor${r.visitors === 1 ? '' : 's'}`)}</div>
        <div style="grid-column:1/-1"><div class="an-kpi-label" style="margin-bottom:.8rem">Most visited pages</div>${anBars(d.pages.map(p => ({ ...p, name: anPageName(p.name) })), 'views', r => `${anNum(r.views)} views · ${anNum(r.visitors)} people`)}</div>
      </div>
    </div>

    <div class="an-card">
      <div class="an-card-head"><h3>Not sold in the last 60 days</h3><span class="an-note">${anNum(d.unsold.count)} perfume${d.unsold.count === 1 ? '' : 's'} in stock with no orders — candidates for a sale or a Signature Scents spot</span></div>
      <div class="an-card-body">${d.unsold.count ? `<div class="an-tags">${d.unsold.items.map(p => `<span>${esc(p.name)}${p.brand ? ` · ${esc(p.brand)}` : ''}</span>`).join('')}${d.unsold.count > d.unsold.items.length ? `<span>+ ${anNum(d.unsold.count - d.unsold.items.length)} more</span>` : ''}</div>` : '<div class="an-empty">Every perfume in stock sold at least once. 🎉</div>'}</div>
    </div>
    <div class="an-tip" id="anTip"></div>`;
  anDrawChart();
}

function anSetMetric(m) {
  AN.metric = m;
  document.querySelectorAll('.an-chip[data-metric]').forEach(c => c.classList.toggle('active', c.dataset.metric === m));
  anDrawChart();
}

function anDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts);
}

function anPageName(path) {
  const map = { '/': 'Home', '/index.html': 'Home', '/about.html': 'About Us', '/all-perfumes.html': 'All Perfumes', '/categories.html': 'Categories', '/contact.html': 'Contact Us' };
  return map[path] || path;
}

// Daily points for up to 30 days; longer periods are grouped by week so bars stay readable.
function anBuckets() {
  const s = AN.data.series;
  if (AN.days <= 30) return s.map(p => ({ label: anDate(p.day, { weekday: 'short', day: 'numeric', month: 'short' }), short: anDate(p.day), revenue: Number(p.revenue), orders: p.orders, visitors: p.visitors }));
  const out = [];
  for (let i = s.length; i > 0; i -= 7) {
    const chunk = s.slice(Math.max(0, i - 7), i);
    out.unshift({
      label: `${anDate(chunk[0].day)} – ${anDate(chunk.at(-1).day)}`, short: anDate(chunk[0].day),
      revenue: chunk.reduce((a, p) => a + Number(p.revenue), 0),
      orders: chunk.reduce((a, p) => a + p.orders, 0),
      // Weekly visitors = sum of daily unique visitors (a returning person counts once per day).
      visitors: chunk.reduce((a, p) => a + p.visitors, 0),
    });
  }
  return out;
}

// Rounds the axis top up to a clean number (1, 2, 2.5, 5 × 10^n).
function anNiceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(n => n >= v);
}

function anDrawChart() {
  const box = document.getElementById('anChart');
  if (!box) return;
  const m = AN.metric;
  const fmt = m === 'revenue' ? anMoney : anNum;
  const buckets = anBuckets();
  const per = AN.days <= 30 ? 'per day' : 'per week';
  document.getElementById('anChartTitle').textContent =
    (m === 'revenue' ? 'Revenue' : m === 'orders' ? 'Orders' : 'Visitors') + ' ' + per + ' · ' + anPeriod();
  const max = anNiceMax(Math.max(...buckets.map(b => b[m])));
  const ticks = [0, .25, .5, .75, 1];
  const total = buckets.reduce((a, b) => a + b[m], 0);
  if (!total) {
    box.innerHTML = `<div class="an-empty" style="padding:3rem 0;text-align:center">No ${m === 'visitors' ? 'visits' : m} in this period yet.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="an-chart" role="img" aria-label="${esc(document.getElementById('anChartTitle').textContent)}, total ${fmt(total)}">
      ${ticks.map(t => `<div class="an-grid-line" style="bottom:${t * 100}%"></div><div class="an-grid-label" style="bottom:${t * 100}%;transform:translateY(50%)">${m === 'revenue' ? '$' + anNum(Math.round(max * t / 100)) : anNum(Math.round(max * t * 10) / 10)}</div>`).join('')}
      <div class="an-cols">
        ${buckets.map((b, i) => `<div class="an-col ${b[m] ? '' : 'zero'}" data-i="${i}"><span style="height:${b[m] / max * 100}%"></span></div>`).join('')}
      </div>
    </div>
    <div class="an-xlabels"><span>${esc(buckets[0].short)}</span>${buckets.length > 2 ? `<span>${esc(buckets[Math.floor(buckets.length / 2)].short)}</span>` : ''}<span>${esc(buckets.at(-1).short)}</span></div>`;
  const tip = document.getElementById('anTip');
  box.querySelectorAll('.an-col').forEach(col => {
    col.addEventListener('mousemove', e => {
      const b = buckets[col.dataset.i];
      tip.innerHTML = `<strong>${esc(b.label)}</strong><br>${anMoney(b.revenue)} revenue · ${anNum(b.orders)} order${b.orders === 1 ? '' : 's'} · ${anNum(b.visitors)} visitor${b.visitors === 1 ? '' : 's'}`;
      tip.style.display = 'block';
      const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 12) + 'px';
    });
    col.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

function anBars(rows, key, label) {
  if (!rows || !rows.length) return '<div class="an-empty">No data for this period yet.</div>';
  const max = Math.max(...rows.map(r => Number(r[key]) || 0)) || 1;
  return rows.map(r => `
    <div class="an-hbar">
      <span class="an-hbar-name" title="${esc(r.name)}">${esc(r.name)}</span>
      <span class="an-hbar-val">${label(r)}</span>
      <div class="an-hbar-track"><span style="width:${Math.max(2, (Number(r[key]) || 0) / max * 100)}%"></span></div>
    </div>`).join('');
}

function anBestTable(rows) {
  if (!rows.length) return '<div class="an-empty">No orders in this period yet.</div>';
  return `<table class="an-table"><thead><tr><th>#</th><th>Perfume</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td style="color:var(--muted)">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${anNum(r.units)}</td><td class="num">${anMoney(r.revenue)}</td></tr>`).join('')}
  </tbody></table>`;
}

// WhatsApp link for a client's phone. Local Lebanese numbers (8 digits or a leading 0) get +961.
function anWaLink(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length <= 8 || (n.startsWith('0') && n.length === 9)) n = '961' + n.replace(/^0/, '');
  return n.length >= 10 ? `https://wa.me/${n}` : '';
}

function anClients(d) {
  const ck = d.clientKpi || { customers: 0, returning: 0, repeat_in_period: 0 };
  const summary = `<div class="an-status" style="margin-bottom:1.2rem">
      <div><strong>${anNum(ck.customers)}</strong>clients ordered</div>
      <div><strong>${anNum(ck.customers - ck.returning)}</strong>new clients</div>
      <div><strong>${anNum(ck.returning)}</strong>returning (ordered before)</div>
      <div><strong>${anNum(ck.repeat_in_period)}</strong>ordered 2+ times in this period</div>
    </div>`;
  if (!d.clients.length) return summary + '<div class="an-empty">No orders in this period yet.</div>';
  const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return summary + `<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>#</th><th>Client</th><th>Phone</th><th class="num">Orders</th><th class="num">Total spent</th><th class="num">Avg. order</th><th class="num">Last order</th></tr></thead><tbody>
    ${d.clients.map((c, i) => {
      const wa = anWaLink(c.phone);
      return `<tr>
        <td style="color:var(--muted)">${i + 1}</td>
        <td>${esc(c.name)}${c.orders > 1 ? ' <span class="an-kpi-sub" style="color:var(--gold)">★ repeat</span>' : ''}</td>
        <td style="white-space:nowrap">${wa ? `<a href="${wa}" target="_blank" rel="noopener" style="color:var(--navy)" title="Message on WhatsApp">${esc(c.phone)}</a>` : esc(c.phone)}</td>
        <td class="num">${anNum(c.orders)}</td>
        <td class="num">${anMoney(c.spent)}</td>
        <td class="num">${anMoney(Number(c.spent) / c.orders)}</td>
        <td class="num">${day(c.last_order)}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}

function anPipeline(d) {
  const order = ['Pending', 'Pending Payment', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  const by = Object.fromEntries(d.statuses.map(s => [s.status, s.count]));
  const avg = d.delivery.avg_hours;
  const avgText = avg == null ? 'no delivered orders in this period' : avg < 48 ? `${Math.round(avg)} hours` : `${(avg / 24).toFixed(1)} days`;
  return `
    <div class="an-status">${order.filter(s => by[s] || ['Pending', 'Confirmed', 'Shipped', 'Delivered'].includes(s)).map(s => `<div><strong>${anNum(by[s] || 0)}</strong>${s}</div>`).join('')}</div>
    <div class="an-kpi-sub" style="margin-top:1rem">Orders placed in the ${anPeriod()}, by current status. Average time from order to Delivered: <strong style="color:var(--navy)">${avgText}</strong>.</div>
    ${d.stuck.length ? `<div class="an-warn">⚠ <strong>${d.stuck.length} order${d.stuck.length === 1 ? '' : 's'}</strong> still Pending after 24 hours:
      ${d.stuck.map(o => `<div style="margin-top:.35rem">${esc(o.id)} · ${esc(o.customer_name)} · ${anMoney(o.total_cents)} · ${new Date(o.placed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>`).join('')}</div>` : ''}`;
}
