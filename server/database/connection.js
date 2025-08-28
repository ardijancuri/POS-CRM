const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// PostgreSQL connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to run queries with promises
const query = (sql, params = []) => {
  return pool.query(sql, params);
};

// Helper function to run single queries (for INSERT, UPDATE, DELETE)
const run = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return { 
    id: result.rows[0]?.id || result.rows[0]?.id, 
    changes: result.rowCount 
  };
};

// Helper function to get a single row
const get = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
};

// Helper function to get all rows
const all = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

module.exports = { pool, query, run, get, all }; 