const { pool, run, get, query } = require('./connection');
const bcrypt = require('bcryptjs');

async function setupSupabaseDatabase() {
  try {
    console.log('🚀 Setting up Supabase PostgreSQL database...');

    // Test connection first
    console.log('🔍 Testing database connection...');
    const testResult = await query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ Database connection successful');
    console.log('📊 Database time:', testResult.rows[0].current_time);
    console.log('🗄️ Database version:', testResult.rows[0].db_version.split(' ')[0]);

    // Create users table
    console.log('👥 Creating users table...');
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        password_hash VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add phone column if it doesn't exist
    await run(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50)
    `);

    // Handle email uniqueness for Supabase
    try {
      await run(`
        ALTER TABLE users 
        DROP CONSTRAINT IF EXISTS users_email_key
      `);
    } catch (e) {
      console.log('ℹ️  Email constraint already removed or never existed');
    }

    // Add unique constraint only for non-null emails
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique 
      ON users (email) 
      WHERE email IS NOT NULL
    `);

    // Create products table
    console.log('📦 Creating products table...');
    await run(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        imei VARCHAR(255),
        description TEXT,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        stock_status VARCHAR(50) NOT NULL DEFAULT 'enabled' CHECK (stock_status IN ('enabled', 'disabled')),
        category VARCHAR(50) NOT NULL DEFAULT 'accessories' CHECK (category IN ('accessories', 'smartphones')),
        subcategory VARCHAR(50),
        model VARCHAR(100),
        color VARCHAR(50),
        storage_gb VARCHAR(50),
        barcode VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create orders table
    console.log('📋 Creating orders table...');
    await run(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        guest_name VARCHAR(255),
        guest_email VARCHAR(255),
        guest_phone VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'shipped', 'completed', 'cancelled')),
        original_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (original_status IN ('pending', 'approved', 'shipped', 'completed', 'cancelled')),
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create order_items table
    await run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price DECIMAL(10,2) NOT NULL
      )
    `);

    // Create settings table
    console.log('⚙️ Creating settings table...');
    await run(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL DEFAULT 'POS CRM System',
        company_address TEXT,
        company_city_state VARCHAR(255),
        company_phone VARCHAR(100),
        company_email VARCHAR(255),
        smartphone_subcategories JSONB DEFAULT '["iPhone","Samsung","Xiaomi"]'::jsonb,
        accessory_subcategories JSONB DEFAULT '["telephone","smart_watch","headphones","tablet"]'::jsonb,
        smartphone_models JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_debt_adjustments table
    await run(`
      CREATE TABLE IF NOT EXISTS user_debt_adjustments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        adjustment_amount DECIMAL(10,2) NOT NULL,
        adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN ('manual_set', 'manual_reduction')),
        currency VARCHAR(10) CHECK (currency IN ('EUR','MKD') OR currency IS NULL),
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create services table
    console.log('🔧 Creating services table...');
    await run(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        contact VARCHAR(255) NOT NULL,
        phone_model VARCHAR(255) NOT NULL,
        imei VARCHAR(255),
        description TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) NOT NULL DEFAULT 'in_service' CHECK (status IN ('in_service', 'completed')),
        profit DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    console.log('📈 Creating performance indexes...');
    try {
      await run(`CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_user_debt_adjustments_user_currency ON user_debt_adjustments(user_id, currency)`);
    } catch (e) {
      console.log('ℹ️  Some indexes already exist:', e.message);
    }

    // Insert default settings if table is empty
    const settingsResult = await query('SELECT COUNT(*) FROM settings');
    if (parseInt(settingsResult.rows[0].count) === 0) {
      console.log('🏢 Inserting default settings...');
      await run(`
        INSERT INTO settings (company_name, company_address, company_city_state, company_phone, company_email)
        VALUES (
          'POS CRM System',
          '123 Business Street',
          'City, State 12345',
          '(555) 123-4567',
          'info@poscrm.com'
        )
      `);
    }

    // Check if admin user already exists
    console.log('👤 Checking admin user...');
    const adminExists = await get('SELECT id FROM users WHERE email = $1', ['admin@poscrm.com']);
    
    if (!adminExists) {
      // Create admin user
      const adminPasswordHash = await bcrypt.hash('Admin@2024Secure!', 10);
      await run(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        ['Admin User', 'admin@poscrm.com', adminPasswordHash, 'admin']
      );
      console.log('✅ Admin user created: admin@poscrm.com / Admin@2024Secure!');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // Create sample data if tables are empty
    console.log('📊 Creating sample data...');
    
    // Sample products
    const productCount = await get('SELECT COUNT(*) as count FROM products');
    if (productCount.count === 0) {
      const sampleProducts = [
        {
          name: 'iPhone 15 Pro',
          description: 'Latest iPhone with advanced features',
          price: 999.99,
          stock_quantity: 50,
          category: 'smartphones'
        },
        {
          name: 'AirPods Pro',
          description: 'Wireless earbuds with noise cancellation',
          price: 249.99,
          stock_quantity: 100,
          category: 'accessories',
          subcategory: 'headphones'
        }
      ];

      for (const product of sampleProducts) {
        await run(
          'INSERT INTO products (name, description, price, stock_quantity, category, subcategory) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [product.name, product.description, product.price, product.stock_quantity, product.category, product.subcategory]
        );
      }
      console.log('✅ Sample products created');
    }

    console.log('🎉 Supabase database setup completed successfully!');
    console.log('\n📋 Default Admin Account:');
    console.log('   Email: admin@poscrm.com');
    console.log('   Password: Admin@2024Secure!');
    console.log('\n🔗 You can now start the application!');

  } catch (error) {
    console.error('❌ Error setting up Supabase database:', error);
    throw error;
  }
}

// Only run setupSupabaseDatabase if this file is run directly
if (require.main === module) {
  setupSupabaseDatabase().finally(async () => {
    await pool.end();
    process.exit(0);
  });
}

module.exports = { setupSupabaseDatabase };
