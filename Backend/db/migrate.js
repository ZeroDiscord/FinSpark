'use strict';

/**
 * Applies all SQL migrations in order and seeds the 3 pre-trained ML tenants.
 * Run with: node db/migrate.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/finspark',
});

// Pre-trained tenant hashes from ML/data/models/
const PRETRAINED_TENANTS = [
  { hash: '3d127f38b20808e3de2ebb01272653a73aea4b322df91732620f4df58c597f3a', company: 'Demo Lending Corp A' },
  { hash: '6f9f23c1c3baf1cf8b98ff7c9f6a898fdc35886ac731f909fd3f87a64e5364ab', company: 'Demo Lending Corp B' },
  { hash: 'c64d39a62a05695a0c105127d8b3d882be50549302cec2ec7be1fb1c667fe6ad', company: 'Demo Lending Corp C' },
];

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log('Running migrations...');
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }
}

async function seedPretrainedTenants() {
  console.log('\nSeeding pre-trained tenants...');

  // Create a seed admin user for demo tenants
  const seedEmail = 'demo@finspark.ai';
  const seedPasswordHash = await bcrypt.hash('Demo@1234', 12);

  // Upsert seed user
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [seedEmail, seedPasswordHash, 'FinSpark Demo Admin']
  );
  const ownerId = userRes.rows[0].id;

  for (const t of PRETRAINED_TENANTS) {
    await pool.query(
      `INSERT INTO tenants (owner_id, company_name, tenant_hash, plan, ml_trained, trained_at)
       VALUES ($1, $2, $3, 'enterprise', TRUE, NOW())
       ON CONFLICT (tenant_hash) DO NOTHING`,
      [ownerId, t.company, t.hash]
    );
    console.log(`  ✓ ${t.company} (${t.hash.substring(0, 16)}...)`);
  }

  console.log(`\nDemo login: ${seedEmail} / Demo@1234`);
}

(async () => {
  try {
    await runMigrations();
    await seedPretrainedTenants();
    console.log('\nMigration complete.\n');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
