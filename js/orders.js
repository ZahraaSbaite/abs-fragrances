const Orders = (() => {
  async function placeGuestOrder({ customer_name, customer_phone, customer_address, note }) {
    const cart = getCart();
    if (!cart.length) throw new Error('Cart is empty');
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name, customer_phone, customer_address, note: note || '',
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
  body.innerHTML = `
    <form id="checkoutForm" class="checkout-form">
      <label>Full name<input type="text" name="customer_name" required></label>
      <label>Phone number<input type="tel" name="customer_phone" required></label>
      <label>Delivery address<textarea name="customer_address" required></textarea></label>
      <label>Note (optional)<textarea name="note"></textarea></label>
      <button type="submit" class="checkout-submit-btn">Confirm Order</button>
      <button type="button" class="checkout-back-btn" onclick="renderCartDrawer()">← Back to cart</button>
    </form>`;
  document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);
}
async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('.checkout-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';
  try {
    const order = await Orders.placeGuestOrder({
      customer_name: form.customer_name.value.trim(),
      customer_phone: form.customer_phone.value.trim(),
      customer_address: form.customer_address.value.trim(),
      note: form.note.value.trim(),
    });
    clearCart();
    closeCart();
    showToast(`Order ${order.id} placed! We'll contact you shortly 🎉`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to place order', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Order';
  }
}