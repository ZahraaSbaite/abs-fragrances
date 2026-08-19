const Orders = (() => {
  async function placeGuestOrder({ customer_name, customer_phone, customer_email, customer_address, location_url, payment_method, note }) {
    const cart = getCart();
    if (!cart.length) throw new Error('Cart is empty');
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name, customer_phone, customer_email: customer_email || '', customer_address,
        location_url: location_url || '', payment_method: payment_method || 'Cash on Delivery',
        note: note || '',
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to place order');
    return data.order;
  }

  async function fetchAll(token) {
    const res = await fetch(`${API_BASE}/orders`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch orders');
    return data.orders;
  }
  async function fetchOne(id, token) {
    const res = await fetch(`${API_BASE}/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch order');
    return data.order;
  }
  async function updateStatus(id, status, token) {
    const res = await fetch(`${API_BASE}/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update status');
    return data.order;
  }
  function statusColor(status) {
    return { Pending: '#e8b84b', Confirmed: '#2a7ae4', Shipped: '#7952b3', Delivered: '#28a745', Cancelled: '#dc3545' }[status] || '#888';
  }
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return { placeGuestOrder, fetchAll, fetchOne, updateStatus, statusColor, formatDate };
})();
window.Orders = Orders;

function submitCartOrder() {
  if (!getCart().length) { showToast('Cart is empty', 'error'); return; }
  renderCheckoutForm();
}
function renderCheckoutForm() {
  const body = document.getElementById('cartBody');
  if (!body) return;
  const footer = document.querySelector('.cart-footer');
  if (footer) footer.style.display = 'none';
  body.innerHTML = `
    <form id="checkoutForm" class="checkout-form">
      <label>Full name<input type="text" name="customer_name" required></label>
      <label>Phone number<input type="tel" name="customer_phone" required></label>
      <label>Email address<input type="email" name="customer_email" required></label>
      <label>Delivery address<textarea name="customer_address" required></textarea></label>
      <div class="checkout-location">
        <button type="button" class="checkout-location-btn" id="shareLocationBtn" onclick="shareLocation()">📍 Share My Location (optional)</button>
        <span class="checkout-location-status" id="locationStatus"></span>
        <input type="hidden" name="location_url" id="locationUrlInput">
      </div>
      <label>Payment method
        <select name="payment_method" class="checkout-select">
          <option value="Cash on Delivery">Cash on Delivery</option>
          <option value="Wish Money">Wish Money</option>
        </select>
      </label>
      <label>Note (optional)<textarea name="note"></textarea></label>
      <button type="submit" class="checkout-submit-btn">Confirm Order</button>
      <button type="button" class="checkout-back-btn" onclick="renderCartDrawer()">← Back to cart</button>
    </form>`;
  document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);
}
function shareLocation() {
  const btn = document.getElementById('shareLocationBtn');
  const status = document.getElementById('locationStatus');
  if (!btn || !status) return;
  if (!navigator.geolocation) {
    status.textContent = 'Location isn\'t supported on this browser.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Getting location…';
  status.textContent = '';
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      const input = document.getElementById('locationUrlInput');
      if (input) input.value = `https://www.google.com/maps?q=${latitude},${longitude}`;
      btn.disabled = false;
      btn.textContent = '📍 Location shared ✓';
    },
    err => {
      btn.disabled = false;
      btn.textContent = '📍 Share My Location (optional)';
      status.textContent = err.code === err.PERMISSION_DENIED
        ? 'Location permission denied.'
        : 'Could not get your location.';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('.checkout-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';
  try {
    const paymentMethod = form.payment_method.value;
    const order = await Orders.placeGuestOrder({
      customer_name: form.customer_name.value.trim(),
      customer_phone: form.customer_phone.value.trim(),
      customer_email: form.customer_email.value.trim(),
      customer_address: form.customer_address.value.trim(),
      location_url: form.location_url.value,
      payment_method: paymentMethod,
      note: form.note.value.trim(),
    });
    saveCart([]); // clear the local cart silently — the order is already recorded server-side
    if (paymentMethod === 'Wish Money') {
      renderWishMoneyInstructions(order);
    } else {
      renderCartDrawer();
      closeCart();
      showToast(`Order ${order.id} placed! We'll contact you shortly 🎉`, 'success');
    }
  } catch (err) {
    showToast(err.message || 'Failed to place order', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Order';
  }
}
function renderWishMoneyInstructions(order) {
  const body = document.getElementById('cartBody');
  if (!body) return;
  const footer = document.querySelector('.cart-footer');
  if (footer) footer.style.display = 'none';
  const number = (window.SITE_SETTINGS && window.SITE_SETTINGS.wish_money_number) || '';
  body.innerHTML = `
    <div class="wm-instructions">
      <div class="wm-icon">💸</div>
      <h3>Almost there!</h3>
      <p>Your order <strong>${order.id}</strong> is reserved. Send the amount below via Wish Money to confirm it — we'll verify the payment and start processing your order.</p>
      <div class="wm-box">
        <div class="wm-row">
          <span class="wm-row-label">Amount to Send</span>
          <span class="wm-row-val">${formatPrice(order.total_cents)}</span>
        </div>
        <div class="wm-row">
          <span class="wm-row-label">Wish Money Number</span>
          ${number
            ? `<div class="wm-number-copy"><span id="wmNumberVal">${number}</span><button type="button" class="wm-copy-btn" onclick="copyWishMoneyNumber()">Copy</button></div>`
            : `<span class="wm-row-val" style="font-size:.82rem;color:var(--danger)">Not set yet — contact us on WhatsApp</span>`}
        </div>
      </div>
      <p>Once we receive your payment, your order moves to processing automatically. Questions? Message us on WhatsApp with your order ID.</p>
      <button type="button" class="checkout-submit-btn" onclick="finishWishMoneyOrder()">Done</button>
    </div>`;
}
function copyWishMoneyNumber() {
  const el = document.getElementById('wmNumberVal');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim())
    .then(() => showToast('Number copied ✓', 'success'))
    .catch(() => showToast('Could not copy — please copy it manually', 'error'));
}
function finishWishMoneyOrder() {
  renderCartDrawer();
  closeCart();
}