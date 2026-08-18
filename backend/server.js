require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth.routes');
const productsRoutes = require('./src/routes/products.routes');
const ordersRoutes = require('./src/routes/orders.routes');
const reviewsRoutes = require('./src/routes/reviews.routes');
const categoriesRoutes = require('./src/routes/categories.routes');
const messagesRoutes = require('./src/routes/messages.routes');
const settingsRoutes = require('./src/routes/settings.routes');

const app = express();

// FRONTEND_ORIGIN can be a single origin or a comma-separated list, so the
// site can be reachable from more than one domain during a hosting migration.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/settings', settingsRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
