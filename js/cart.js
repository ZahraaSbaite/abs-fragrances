const CART_KEY = 'abs_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}
function addToCart(productId) {
  const p = PRODUCTS[productId];
  if (!p) { showToast('Product not found', 'error'); return; }
  const cart = getCart();
  const existing = cart.find(i => i.id === productId);
  if (existing) existing.qty += 1;
  else cart.push({ id: productId, name: p.name, brand: p.brandName, priceCents: p.priceCents, qty: 1 });
  saveCart(cart);
  showToast(p.name + ' added to cart ✓', 'success');
}
function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.id !== productId));
  renderCartDrawer();
}
function updateQty(productId, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(productId); return; }
  saveCart(cart);
  renderCartDrawer();
}
function clearCart() { saveCart([]); renderCartDrawer(); }
function cartSubtotalCents() {
  return getCart().reduce((sum, i) => sum + (i.priceCents || 0) * i.qty, 0);
}
function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = getCart().reduce((s, i) => s + i.qty, 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}
function renderCartDrawer() {
  const body = document.getElementById('cartBody');
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Your cart is empty</p></div>`;
    const total = document.getElementById('cartTotal');
    if (total) total.textContent = '$0.00';
    return;
  }
  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img"><span style="font-size:2rem">🧴</span></div>
      <div class="cart-item-info">
        <div class="cart-item-coll">${item.brand || ''}</div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.priceCents)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQty('${item.id}',-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty('${item.id}',1)">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">Remove</button>
      </div>
    </div>`).join('');
  const total = document.getElementById('cartTotal');
  if (total) total.textContent = formatPrice(cartSubtotalCents());
  const waLink = document.getElementById('cartWhatsappLink');
  if (waLink) waLink.href = cartWhatsAppLink();

}
function toggleCart() {
  document.getElementById('cartDrawer')?.classList.toggle('open');
  document.getElementById('cartDrawerBg')?.classList.toggle('open');
  renderCartDrawer();
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartDrawerBg')?.classList.remove('open');
}
function cartWhatsAppLink() {
  const cart = getCart();
  const lines = cart.map(i => `• ${i.name} x${i.qty} (${formatPrice(i.priceCents)})`).join('\n');
  const total = formatPrice(cartSubtotalCents());
  const msg = cart.length
    ? `Hi! I'd like to order:\n\n${lines}\n\nTotal: ${total}`
    : `Hi! I have a question about your perfumes.`;
  return 'https://wa.me/96178901234?text=' + encodeURIComponent(msg);
}