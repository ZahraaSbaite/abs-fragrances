require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth.routes');
const productsRoutes = require('./src/routes/products.routes');
const ordersRoutes = require('./src/routes/orders.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
