// Run with: npm run db:setup
// Creates all tables (if not already present) and seeds brands, products, and demo users.
// Safe to re-run: uses ON CONFLICT DO NOTHING / DO UPDATE so it won't duplicate rows.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { BRANDS, PRODUCTS, DEMO_USERS, REVIEWS } = require('./seed-data');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating schema...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSql);

    console.log('Seeding brands...');
    for (const b of BRANDS) {
      await client.query(
        `INSERT INTO brands (id, name, logo) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, logo = EXCLUDED.logo`,
        [b.id, b.name, b.logo]
      );
    }

    console.log('Seeding products...');
    for (const p of PRODUCTS) {
      await client.query(
        `INSERT INTO products
           (id, name, brand_id, gender, notes, short_desc, full_desc, badge, badge_class, price_cents, intensity, in_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, brand_id = EXCLUDED.brand_id, gender = EXCLUDED.gender,
           notes = EXCLUDED.notes, short_desc = EXCLUDED.short_desc, full_desc = EXCLUDED.full_desc,
           badge = EXCLUDED.badge, badge_class = EXCLUDED.badge_class, price_cents = EXCLUDED.price_cents,
           intensity = EXCLUDED.intensity`,
        [p.id, p.name, p.brand_id, p.gender, p.notes, p.short_desc, p.full_desc, p.badge, p.badge_class, p.price_cents, p.intensity]
      );
    }

    console.log('Seeding reviews...');
    for (const r of REVIEWS) {
      await client.query(
        `INSERT INTO reviews (id, stars, review_text, author_name, author_location, product_label)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           stars = EXCLUDED.stars, review_text = EXCLUDED.review_text, author_name = EXCLUDED.author_name,
           author_location = EXCLUDED.author_location, product_label = EXCLUDED.product_label`,
        [r.id, r.stars, r.review_text, r.author_name, r.author_location, r.product_label]
      );
    }

    console.log('Seeding demo users...');
    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone, address)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (email) DO NOTHING`,
        [u.name, u.email, hash, u.role, u.phone, u.address]
      );
    }

    console.log('Done. Demo logins:');
    DEMO_USERS.forEach(u => console.log(`  ${u.email} / ${u.password} (${u.role})`));
  } catch (err) {
    console.error('Setup failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
