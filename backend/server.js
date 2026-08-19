require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth.routes');
const productsRoutes = require('./src/routes/products.routes');
const ordersRoutes = require('./src/routes/orders.routes');
const reviewsRoutes = require('./src/routes/reviews.routes');
const categoriesRoutes = require('./src/routes/categories.routes');
const messagesRoutes = require('./src/routes/messages.routes');
const settingsRoutes = require('./src/routes/settings.routes');

const app = express();

// Sets standard security headers (X-Content-Type-Options, X-Frame-Options,
// etc.). CSP/COEP are disabled — this API serves only JSON, no HTML/assets,
// so the default policies would only add noise without protecting anything.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// FRONTEND_ORIGIN can be a single origin or a comma-separated list, so the
// site can be reachable from more than one domain during a hosting migration.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
app.use(express.json());

// Generous limit across the whole API so normal browsing is never affected,
// just abusive/automated traffic.
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
// Login gets its own tight limit — this is what actually matters for brute-force protection.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' } });
// Public write endpoints (guest checkout, reviews, contact form) get a
// moderate limit so they can't be used to flood the database with spam.
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again later.' } });

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth/login', loginLimiter);
app.post('/api/orders', writeLimiter);
app.post('/api/reviews', writeLimiter);
app.post('/api/messages', writeLimiter);

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
