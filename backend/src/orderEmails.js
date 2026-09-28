const { pool } = require('./db');
const { sendMail } = require('./mailer');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

// What the customer is told for each status.
const STATUS_TEXT = {
  Pending: 'We have received your order and will confirm it shortly.',
  'Pending Payment': 'We are waiting for your Wish Money payment to be confirmed before we prepare your order.',
  Confirmed: 'Good news — your order is confirmed and is being prepared.',
  Shipped: 'Your order is on its way to you.',
  Delivered: 'Your order has been delivered. Thank you for shopping with Abs Fragrances!',
  Cancelled: 'Your order has been cancelled. If this is a surprise, please contact us on WhatsApp.',
};

function itemsTable(items) {
  const rows = items.map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.product_name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${money(i.price_cents * i.quantity)}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr style="color:#888;font-size:12px;text-transform:uppercase"><th align="left">Item</th><th>Qty</th><th align="right">Price</th></tr>${rows}</table>`;
}

function totals(o) {
  return `<table style="width:100%;font-size:14px;margin-top:10px">
    <tr><td>Subtotal</td><td align="right">${money(o.subtotal_cents)}</td></tr>
    <tr><td>Delivery</td><td align="right">${money(o.delivery_cents)}</td></tr>
    <tr><td style="font-weight:bold;padding-top:6px">Total</td><td align="right" style="font-weight:bold;padding-top:6px">${money(o.total_cents)}</td></tr></table>`;
}

function shell(title, inner) {
  return `<div style="background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#163846">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px">
      <div style="font-size:22px;letter-spacing:.04em;margin-bottom:18px">Abs<span style="color:#c4a270">.</span> Fragrances</div>
      <h2 style="font-size:18px;margin:0 0 14px">${esc(title)}</h2>${inner}
    </div></div>`;
}

async function loadOrder(orderId) {
  const o = (await pool.query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0];
  if (!o) return null;
  o.items = (await pool.query('SELECT product_name, price_cents, quantity FROM order_items WHERE order_id = $1 ORDER BY id', [orderId])).rows;
  return o;
}

async function adminAddress() {
  if (process.env.ADMIN_NOTIFY_EMAIL) return process.env.ADMIN_NOTIFY_EMAIL;
  try {
    const r = await pool.query("SELECT email FROM site_settings WHERE id = 'main'");
    return r.rows[0]?.email || null;
  } catch { return null; }
}

// New order → email to the admin with everything needed to fulfil it.
async function notifyAdminNewOrder(orderId) {
  try {
    const [o, to] = await Promise.all([loadOrder(orderId), adminAddress()]);
    if (!o) return;
    if (!to) { console.warn('[mail] No admin email set (Admin → Social & Contact, or ADMIN_NOTIFY_EMAIL)'); return; }
    const rows = [
      ['Order', o.id], ['Name', o.customer_name], ['Phone', o.customer_phone], ['Email', o.customer_email],
      ['Address', o.customer_address], ['Payment', o.payment_method], ['Status', o.status],
    ];
    if (o.location_url) rows.push(['Location', o.location_url]);
    if (o.note) rows.push(['Note', o.note]);
    const html = shell(`New order ${o.id}`, `
      <table style="font-size:14px;margin-bottom:16px">${rows.map(([k, v]) =>
        `<tr><td style="color:#888;padding:3px 14px 3px 0;vertical-align:top">${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${itemsTable(o.items)}${totals(o)}`);
    const text = `New order ${o.id}\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n' +
      o.items.map((i) => `${i.product_name} x${i.quantity} — ${money(i.price_cents * i.quantity)}`).join('\n') +
      `\n\nTotal: ${money(o.total_cents)}`;
    await sendMail({ to, subject: `New order ${o.id} — ${money(o.total_cents)} — ${o.customer_name}`, html, text, replyTo: o.customer_email });
  } catch (err) { console.error('[mail] notifyAdminNewOrder failed:', err.message); }
}

// Optional confirmation to the customer right after they order.
async function notifyCustomerOrderReceived(orderId) {
  try {
    const o = await loadOrder(orderId);
    if (!o || !o.customer_email) return;
    const html = shell(`Thanks for your order, ${o.customer_name.split(' ')[0]}!`, `
      <p style="font-size:14px;line-height:1.6">Order <b>${esc(o.id)}</b> — ${esc(STATUS_TEXT[o.status] || '')}</p>
      ${itemsTable(o.items)}${totals(o)}
      <p style="font-size:13px;color:#666;margin-top:16px">Payment: ${esc(o.payment_method)}<br>Delivery to: ${esc(o.customer_address)}</p>`);
    await sendMail({ to: o.customer_email, subject: `We received your order ${o.id}`, html,
      text: `Thanks for your order ${o.id}. ${STATUS_TEXT[o.status] || ''} Total: ${money(o.total_cents)}` });
  } catch (err) { console.error('[mail] notifyCustomerOrderReceived failed:', err.message); }
}

// Admin changed the status → tell the customer what changed.
async function notifyCustomerStatusChange(orderId, oldStatus) {
  try {
    const o = await loadOrder(orderId);
    if (!o || !o.customer_email) return;
    const html = shell(`Your order is now: ${o.status}`, `
      <p style="font-size:14px;line-height:1.6">Hi ${esc(o.customer_name.split(' ')[0])},<br>${esc(STATUS_TEXT[o.status] || '')}</p>
      <p style="font-size:13px;color:#666">Order <b>${esc(o.id)}</b> · Status changed from <b>${esc(oldStatus)}</b> to <b>${esc(o.status)}</b></p>
      ${itemsTable(o.items)}${totals(o)}
      <p style="font-size:13px;color:#666;margin-top:16px">Delivery to: ${esc(o.customer_address)}</p>
      <p style="font-size:13px;color:#666">Questions? Just reply to this email or message us on WhatsApp.</p>`);
    await sendMail({ to: o.customer_email, subject: `Your order ${o.id} is ${o.status}`, html,
      text: `Hi ${o.customer_name}, your order ${o.id} changed from ${oldStatus} to ${o.status}. ${STATUS_TEXT[o.status] || ''} Total: ${money(o.total_cents)}` });
  } catch (err) { console.error('[mail] notifyCustomerStatusChange failed:', err.message); }
}

module.exports = { notifyAdminNewOrder, notifyCustomerOrderReceived, notifyCustomerStatusChange };
