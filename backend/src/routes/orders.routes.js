// POST /api/orders — guest checkout, no login required.
// body: { customer_name, customer_phone, customer_email, customer_address, location_url?, payment_method?, note?, items: [{ product_id, quantity }] }
// Prices are looked up server-side from the products table — never trust client-sent prices.
router.post("/", async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_address,
    customer_email,
    location_url,
    payment_method,
    note,
    items: cartItems,
    bundles: cartBundles,
  } = req.body;
  const bundleReqs = Array.isArray(cartBundles) ? cartBundles : [];
  if (
    !customer_name ||
    !customer_phone ||
    !customer_email ||
    !customer_address
  ) {
    return res
      .status(400)
      .json({
        error:
          "customer_name, customer_phone, customer_email, and customer_address are required",
      });
  }
  if (!Array.isArray(cartItems) || (!cartItems.length && !bundleReqs.length)) {
    return res
      .status(400)
      .json({
        error: "items must be a non-empty array of { product_id, quantity }",
      });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productIds = cartItems.map((i) => i.product_id);
    const productsResult = await client.query(
      `SELECT id, name, price_cents, sale_price_cents, in_stock FROM products WHERE id = ANY($1::text[])`,
      [productIds],
    );
    const productsById = Object.fromEntries(
      productsResult.rows.map((p) => [p.id, p]),
    );

    const items = [];
    for (const { product_id, quantity } of cartItems) {
      const product = productsById[product_id];
      if (!product) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: `Product not found: ${product_id}` });
      }
      // Out-of-stock products can never be ordered.
      if (product.in_stock === false) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({
            error: `${product.name} is out of stock`,
            out_of_stock: [product_id],
          });
      }
      const qty = Number(quantity) > 0 ? Number(quantity) : 1;
      // Sale price applies only while it is set and lower than the regular price.
      const onSale =
        product.sale_price_cents != null &&
        product.sale_price_cents < product.price_cents;
      items.push({
        product_id,
        name: product.name,
        price_cents: onSale ? product.sale_price_cents : product.price_cents,
        quantity: qty,
      });
    }

    // Bundle offers: priced from the bundles table, stored as one order line each (product_id NULL).
    for (const { bundle_id, quantity } of bundleReqs) {
      const br = await client.query(
        "SELECT id, name, price_cents FROM bundles WHERE id = $1 AND is_active = true",
        [bundle_id],
      );
      if (!br.rows[0]) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "This bundle offer is no longer available" });
      }
      const qty = Number(quantity) > 0 ? Number(quantity) : 1;
      items.push({
        product_id: null,
        name: "Bundle: " + br.rows[0].name,
        price_cents: br.rows[0].price_cents,
        quantity: qty,
      });
    }

    const subtotal_cents = items.reduce(
      (sum, i) => sum + i.price_cents * i.quantity,
      0,
    );
    const total_cents = subtotal_cents + DELIVERY_CENTS;
    const orderId = "ORD-" + Date.now();
    // Wish Money orders wait for the admin to manually confirm the payment
    // was received before they enter the normal fulfillment pipeline.
    const initialStatus =
      payment_method === "Wish Money" ? "Pending Payment" : "Pending";

    await client.query(
      `INSERT INTO orders
        (id, user_id, customer_name, customer_phone, customer_email, customer_address, location_url, payment_method, note, status, subtotal_cents, delivery_cents, total_cents)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        orderId,
        customer_name,
        customer_phone,
        customer_email || null,
        customer_address,
        location_url || null,
        payment_method || "Cash on Delivery",
        note || null,
        initialStatus,
        subtotal_cents,
        DELIVERY_CENTS,
        total_cents,
      ],
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price_cents, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, item.product_id, item.name, item.price_cents, item.quantity],
      );
    }

    await client.query("COMMIT");

    // Emails go out after the response, so a slow/failed mail never delays or breaks checkout.
    setImmediate(() => {
      notifyAdminNewOrder(orderId);
      notifyCustomerOrderReceived(orderId);
    });

    res
      .status(201)
      .json({
        order: {
          id: orderId,
          subtotal_cents,
          delivery_cents: DELIVERY_CENTS,
          total_cents,
          status: initialStatus,
          payment_method: payment_method || "Cash on Delivery",
          items,
        },
      });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to place order" });
  } finally {
    client.release();
  }
});
