const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const TZ = 'Asia/Beirut';
// Orders that count as revenue. Pending / Pending Payment / Cancelled are not money in yet.
const PAID = `('Confirmed','Shipped','Delivered')`;
// One customer = one phone number, compared on its last 8 digits (ignores +961, spaces, dashes).
const CLIENT_KEY = String.raw`RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 8)`;

// The visits table is created here on startup (safe to repeat), so no manual migration
// is needed on the live database. Also listed in db/schema.sql for fresh installs.
pool.query(`
  CREATE TABLE IF NOT EXISTS site_visits (
    id          BIGSERIAL PRIMARY KEY,
    visitor_id  TEXT NOT NULL,
    path        TEXT,
    source      TEXT,
    device      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at);
`).catch(err => console.error('Could not create site_visits table:', err.message));

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|headless|lighthouse|pingdom|uptime|curl|wget|python|node-fetch|axios/i;

function deviceOf(ua) {
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

// Where the visitor came from. In-app browsers (Instagram, Facebook, TikTok) usually send
// no referrer, so their user agent is checked first. Own-site navigation returns null.
function sourceOf(ua, referrer, utm) {
  if (utm) return utm.slice(0, 40);
  if (/instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook';
  if (/musical_ly|bytedance|tiktok/i.test(ua)) return 'TikTok';
  let host = '';
  try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { return 'Direct'; }
  if (!host) return 'Direct';
  if (host.includes('abs-fragrances')) return null;
  if (/google\./.test(host)) return 'Google';
  if (/instagram\./.test(host)) return 'Instagram';
  if (/facebook\.|fb\./.test(host)) return 'Facebook';
  if (/tiktok\./.test(host)) return 'TikTok';
  if (/whatsapp|wa\.me/.test(host)) return 'WhatsApp';
  if (/bing\./.test(host)) return 'Bing';
  return host.slice(0, 40);
}

// POST /api/analytics/visit — public. One row per page view. Sent with navigator.sendBeacon,
// which posts text/plain, so the body is parsed here.
router.post('/visit', express.text({ type: '*/*', limit: '2kb' }), async (req, res) => {
  res.status(204).end(); // answer straight away; the visitor never waits on this
  try {
    const ua = req.get('user-agent') || '';
    if (!ua || BOT_RE.test(ua)) return;
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const visitorId = String(body.visitor_id || '');
    if (!/^[\w-]{8,64}$/.test(visitorId)) return;
    const path = String(body.path || '/').slice(0, 120);
    await pool.query(
      'INSERT INTO site_visits (visitor_id, path, source, device) VALUES ($1,$2,$3,$4)',
      [visitorId, path, sourceOf(ua, String(body.referrer || ''), String(body.utm || '')), deviceOf(ua)]
    );
    // Keep the table small: drop visits older than ~13 months, now and then.
    if (Math.random() < 0.01) await pool.query(`DELETE FROM site_visits WHERE created_at < now() - interval '400 days'`);
  } catch (err) {
    console.error('visit:', err.message);
  }
});

// GET /api/analytics/summary?days=30 — admin only. Everything the Analytics page shows.
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const cur = `>= now() - make_interval(days => $1::int)`;
  const prev = `>= now() - make_interval(days => $1::int * 2) AND {c} < now() - make_interval(days => $1::int)`;
  const q = (sql, params = [days]) => pool.query(sql, params).then(r => r.rows);
  try {
    const [kpi, visitKpi, series, best, brands, genders, statuses, delivery, stuck, unsold, pages, sources, devices, firstVisit, clients, clientKpi] = await Promise.all([
      q(`SELECT
           COUNT(*) FILTER (WHERE placed_at ${cur})::int AS orders,
           COUNT(*) FILTER (WHERE placed_at ${prev.replace('{c}', 'placed_at')})::int AS orders_prev,
           COUNT(*) FILTER (WHERE placed_at ${cur} AND status IN ${PAID})::int AS paid_orders,
           COUNT(*) FILTER (WHERE placed_at ${prev.replace('{c}', 'placed_at')} AND status IN ${PAID})::int AS paid_orders_prev,
           COALESCE(SUM(total_cents) FILTER (WHERE placed_at ${cur} AND status IN ${PAID}), 0)::bigint AS revenue,
           COALESCE(SUM(total_cents) FILTER (WHERE placed_at ${prev.replace('{c}', 'placed_at')} AND status IN ${PAID}), 0)::bigint AS revenue_prev,
           COUNT(*) FILTER (WHERE placed_at ${cur} AND status = 'Cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE placed_at ${prev.replace('{c}', 'placed_at')} AND status = 'Cancelled')::int AS cancelled_prev,
           COALESCE(SUM(total_cents) FILTER (WHERE status IN ('Pending','Pending Payment')), 0)::bigint AS pending_value,
           COALESCE(SUM(total_cents) FILTER (WHERE status IN ${PAID} AND (placed_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date), 0)::bigint AS revenue_today,
           COALESCE(SUM(total_cents) FILTER (WHERE status IN ${PAID}), 0)::bigint AS revenue_all
         FROM orders`),
      q(`SELECT
           COUNT(DISTINCT visitor_id) FILTER (WHERE created_at ${cur})::int AS visitors,
           COUNT(DISTINCT visitor_id) FILTER (WHERE created_at ${prev.replace('{c}', 'created_at')})::int AS visitors_prev,
           COUNT(*) FILTER (WHERE created_at ${cur})::int AS views,
           COUNT(*) FILTER (WHERE created_at ${prev.replace('{c}', 'created_at')})::int AS views_prev,
           COUNT(DISTINCT visitor_id) FILTER (WHERE (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date)::int AS visitors_today
         FROM site_visits WHERE created_at >= now() - make_interval(days => $1::int * 2)`),
      q(`WITH d AS (
           SELECT generate_series((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1), (now() AT TIME ZONE '${TZ}')::date, interval '1 day')::date AS day)
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(o.revenue, 0)::bigint AS revenue, COALESCE(o.orders, 0)::int AS orders,
                COALESCE(v.visitors, 0)::int AS visitors
           FROM d
           LEFT JOIN (SELECT (placed_at AT TIME ZONE '${TZ}')::date AS day, COUNT(*) AS orders,
                             SUM(total_cents) FILTER (WHERE status IN ${PAID}) AS revenue
                        FROM orders WHERE placed_at >= now() - make_interval(days => $1::int + 1) GROUP BY 1) o ON o.day = d.day
           LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, COUNT(DISTINCT visitor_id) AS visitors
                        FROM site_visits WHERE created_at >= now() - make_interval(days => $1::int + 1) GROUP BY 1) v ON v.day = d.day
          ORDER BY d.day`),
      q(`SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity)::int AS units,
                SUM(oi.quantity * oi.price_cents)::bigint AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.status <> 'Cancelled' AND o.placed_at ${cur}
          GROUP BY oi.product_id, CASE WHEN oi.product_id IS NULL THEN oi.product_name END
          ORDER BY units DESC, revenue DESC LIMIT 10`),
      q(`SELECT COALESCE(b.name, 'No brand') AS name, SUM(oi.quantity)::int AS units, SUM(oi.quantity * oi.price_cents)::bigint AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           JOIN products p ON p.id = oi.product_id LEFT JOIN brands b ON b.id = p.brand_id
          WHERE o.status <> 'Cancelled' AND o.placed_at ${cur}
          GROUP BY 1 ORDER BY units DESC LIMIT 8`),
      q(`SELECT p.gender AS name, SUM(oi.quantity)::int AS units, SUM(oi.quantity * oi.price_cents)::bigint AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
          WHERE o.status <> 'Cancelled' AND o.placed_at ${cur}
          GROUP BY 1 ORDER BY units DESC`),
      q(`SELECT status, COUNT(*)::int AS count FROM orders WHERE placed_at ${cur} GROUP BY 1`),
      q(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - placed_at)) / 3600)::numeric, 1)::float AS avg_hours, COUNT(*)::int AS n
           FROM orders WHERE status = 'Delivered' AND placed_at ${cur}`),
      q(`SELECT id, customer_name, total_cents, placed_at FROM orders
          WHERE status = 'Pending' AND placed_at < now() - interval '24 hours'
          ORDER BY placed_at LIMIT 10`, []),
      q(`SELECT p.id, p.name, COALESCE(b.name, '') AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id
          WHERE p.in_stock AND NOT EXISTS (
            SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE oi.product_id = p.id AND o.status <> 'Cancelled' AND o.placed_at >= now() - interval '60 days')
          ORDER BY p.name`, []),
      q(`SELECT path AS name, COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS visitors
           FROM site_visits WHERE created_at ${cur} GROUP BY 1 ORDER BY views DESC LIMIT 8`),
      // Each visitor counted once, by where they first came from in this period.
      q(`SELECT COALESCE(source, 'Direct') AS name, COUNT(*)::int AS visitors FROM (
           SELECT DISTINCT ON (visitor_id) source FROM site_visits
            WHERE created_at ${cur} AND source IS NOT NULL ORDER BY visitor_id, created_at) s
          GROUP BY 1 ORDER BY visitors DESC LIMIT 8`),
      q(`SELECT device AS name, COUNT(DISTINCT visitor_id)::int AS visitors FROM site_visits
          WHERE created_at ${cur} GROUP BY 1 ORDER BY visitors DESC`),
      q(`SELECT to_char(MIN(created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS first FROM site_visits`, []),
      // Top clients: a customer = a phone number (last 8 digits, so "+961 81 636235" and
      // "81636235" are the same person). Name/phone shown are from their latest order.
      q(`SELECT ${CLIENT_KEY} AS client_key,
                (array_agg(customer_name ORDER BY placed_at DESC))[1] AS name,
                (array_agg(customer_phone ORDER BY placed_at DESC))[1] AS phone,
                COUNT(*)::int AS orders, SUM(total_cents)::bigint AS spent,
                MIN(placed_at) AS first_order, MAX(placed_at) AS last_order
           FROM orders
          WHERE status <> 'Cancelled' AND placed_at ${cur} AND ${CLIENT_KEY} <> ''
          GROUP BY 1 ORDER BY orders DESC, spent DESC LIMIT 10`),
      // New vs returning: returning = had an order before this period started.
      q(`WITH o AS (SELECT ${CLIENT_KEY} AS k, placed_at FROM orders WHERE status <> 'Cancelled' AND ${CLIENT_KEY} <> '')
         SELECT COUNT(DISTINCT k)::int AS customers,
                COUNT(DISTINCT k) FILTER (WHERE k IN (SELECT k FROM o WHERE placed_at < now() - make_interval(days => $1::int)))::int AS returning,
                COUNT(DISTINCT k) FILTER (WHERE k IN (SELECT k FROM o WHERE placed_at ${cur} GROUP BY k HAVING COUNT(*) > 1))::int AS repeat_in_period
           FROM o WHERE placed_at ${cur}`),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      days,
      kpi: kpi[0], visits: visitKpi[0], series, bestSellers: best, brands, genders,
      statuses, delivery: delivery[0], stuck,
      unsold: { count: unsold.length, items: unsold.slice(0, 20) },
      pages, sources, devices, trackingSince: firstVisit[0]?.first || null,
      clients, clientKpi: clientKpi[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;
