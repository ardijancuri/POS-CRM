const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const settingsRoutes = require('./routes/settings');
const serviceRoutes = require('./routes/services');
const { run, testConnection } = require('./database/connection');
const { setupDatabase } = require('./database/setup');
const { setupSupabaseDatabase } = require('./database/supabase-setup');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting
// app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Rate limiting - COMMENTED OUT FOR DEVELOPMENT
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
//   legacyHeaders: false, // Disable the `X-RateLimit-*` headers
//   keyGenerator: (req) => {
//     return req.ip; // Use IP address as key
//   }
// });
// app.use(limiter);

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://pos-crm-lyart.vercel.app',
      'https://pos-crm.vercel.app',
      'https://pos-crm-git-main-pos-crm-lyart.vercel.app',
      'https://pos-crm-git-main-pos-crm.vercel.app'
    ]
  : [
      'http://localhost:3000',
      'https://localhost:3000',
      'http://127.0.0.1:3000',
      'https://127.0.0.1:3000',
    ];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser clients
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Explicitly handle preflight
app.options('*', cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/services', serviceRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      database: 'error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database connection error'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  
  // Debug: Log environment variables
  console.log('🔍 Environment variables check:');
  console.log('   DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('   DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);
  console.log('   DATABASE_URL preview:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + '...' : 'NOT SET');
  
  try {
    // Test database connection first
    console.log('🔍 Testing database connection...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('❌ Cannot proceed without database connection');
      return;
    }
    
    // Run database setup (try Supabase first, fallback to original)
    console.log('🗄️ Setting up database...');
    try {
      await setupSupabaseDatabase();
      console.log('✅ Supabase database setup completed');
    } catch (error) {
      console.log('⚠️  Supabase setup failed, trying original setup...');
      await setupDatabase();
      console.log('✅ Original database setup completed');
    }
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
  }
});