const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, run, get } = require('../database/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Model stock stats (admin only)
router.get('/stats/models', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const result = await query(
      "SELECT model, COUNT(*)::int AS count FROM products WHERE category = 'smartphones' AND model IS NOT NULL GROUP BY model"
    );
    const data = result.rows.reduce((acc, row) => {
      acc[row.model] = row.count;
      return acc;
    }, {});
    res.json({ modelCounts: data });
  } catch (error) {
    console.error('Get model stats error:', error);
    res.status(500).json({ message: 'Failed to get model stats' });
  }
});

// Model storage/color stock details (admin only)
router.get('/stats/model-details', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const { model } = req.query;
    if (!model) {
      return res.status(400).json({ message: 'Model is required' });
    }
    const result = await query(
      "SELECT storage_gb, color, COUNT(*)::int AS count FROM products WHERE category = 'smartphones' AND model = $1 GROUP BY storage_gb, color ORDER BY storage_gb NULLS LAST, color NULLS LAST",
      [model]
    );
    res.json({ model, items: result.rows });
  } catch (error) {
    console.error('Get model detail stats error:', error);
    res.status(500).json({ message: 'Failed to get model detail stats' });
  }
});

// Get low stock models for dashboard (admin only)
router.get('/stats/low-stock-models', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    // Get all smartphone models from settings
    const settingsResult = await query('SELECT smartphone_models FROM settings WHERE id = 1');
    const smartphoneModels = settingsResult.rows[0]?.smartphone_models || [];
    
    // Get product counts for existing models
    const productStatsResult = await query(`
      SELECT 
        model,
        COUNT(*)::int AS totalStock,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END)::int AS outOfStockCount,
        COUNT(CASE WHEN stock_quantity > 0 AND stock_quantity <= 9 THEN 1 END)::int AS lowStockCount
      FROM products 
      WHERE model IS NOT NULL 
      GROUP BY model
    `);
    
    // Create a map of existing model stats
    const existingModelStats = {};
    productStatsResult.rows.forEach(row => {
      existingModelStats[row.model] = {
        totalStock: row.totalstock,
        outOfStockCount: row.outofstockcount,
        lowStockCount: row.lowstockcount
      };
    });
    
    // Build models array with only necessary data
    const lowStockModels = smartphoneModels
      .map(modelData => {
        const existingStats = existingModelStats[modelData.name];
        const totalStock = existingStats ? existingStats.totalStock : 0;
        
        // Only include models with fewer than 10 products
        if (totalStock >= 10) return null;
        
        return {
          model: modelData.name,
          category: 'smartphones',
          subcategory: modelData.subcategory || 'N/A',
          totalStock,
          outOfStockCount: existingStats ? existingStats.outOfStockCount : 0,
          lowStockCount: existingStats ? existingStats.lowStockCount : 0,
          hasOutOfStock: existingStats ? existingStats.outOfStockCount > 0 : false,
          hasLowStock: existingStats ? existingStats.lowStockCount > 0 : false
        };
      })
      .filter(Boolean) // Remove null entries
      .sort((a, b) => a.totalStock - b.totalStock); // Sort by totalStock ASC
    
    res.json({ lowStockModels });
  } catch (error) {
    console.error('Get low stock models error:', error);
    res.status(500).json({ message: 'Failed to get low stock models' });
  }
});

// Get all products (admin: with prices, client: without prices)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', description = '', imei = '', status = '', stock = '', category = '', subcategory = '', color = '', storage = '', price = '', stockQuantity = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user.role === 'admin';

    let selectFields = 'id, name, imei, description, stock_status, stock_quantity, created_at, barcode, category, subcategory, model, color, storage_gb';
    if (isAdmin) {
      selectFields += ', price';
    }

    let queryText = `SELECT ${selectFields} FROM products`;
    let countQuery = 'SELECT COUNT(*) FROM products';
    let queryParams = [];
    let paramCount = 1;
    let whereConditions = [];

    // Search filter
    if (search) {
      whereConditions.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR model ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Description filter
    if (description) {
      whereConditions.push(`description ILIKE $${paramCount}`);
      queryParams.push(`%${description}%`);
      paramCount++;
    }

    // IMEI filter
    if (imei) {
      whereConditions.push(`imei ILIKE $${paramCount}`);
      queryParams.push(`%${imei}%`);
      paramCount++;
    }

    // Status filter
    if (status && ['enabled', 'disabled'].includes(status)) {
      whereConditions.push(`stock_status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    // Stock level filter
    if (stock) {
      switch (stock) {
        case 'out_of_stock':
          whereConditions.push(`stock_quantity = 0`);
          break;
        case 'low_stock':
          whereConditions.push(`stock_quantity > 0 AND stock_quantity <= 10`);
          break;
        case 'in_stock':
          whereConditions.push(`stock_quantity > 0`);
          break;
        case 'available':
          whereConditions.push(`stock_quantity > 0`);
          break;
      }
    }

    // Category filter
    if (category && ['accessories', 'smartphones'].includes(category)) {
      whereConditions.push(`category = $${paramCount}`);
      queryParams.push(category);
      paramCount++;
    }

    // Subcategory filter
    if (subcategory) {
      whereConditions.push(`subcategory ILIKE $${paramCount}`);
      queryParams.push(`%${subcategory}%`);
      paramCount++;
    }

    // Color filter
    if (color) {
      whereConditions.push(`color ILIKE $${paramCount}`);
      queryParams.push(`%${color}%`);
      paramCount++;
    }

    // Storage filter
    if (storage) {
      whereConditions.push(`storage_gb::text ILIKE $${paramCount}`);
      queryParams.push(`%${storage}%`);
      paramCount++;
    }

    // Price filter
    if (price) {
      whereConditions.push(`price::text ILIKE $${paramCount}`);
      queryParams.push(`%${price}%`);
      paramCount++;
    }

    // Stock quantity filter
    if (stockQuantity) {
      whereConditions.push(`stock_quantity::text ILIKE $${paramCount}`);
      queryParams.push(`%${stockQuantity}%`);
      paramCount++;
    }

    // Add WHERE clause if conditions exist
    if (whereConditions.length > 0) {
      const whereClause = whereConditions.join(' AND ');
      queryText += ` WHERE ${whereClause}`;
      countQuery += ` WHERE ${whereClause}`;
    }

    // Validate sort parameters
    const validSortFields = ['name', 'created_at', 'stock_quantity'];
    const validSortOrders = ['asc', 'desc'];
    
    if (!validSortFields.includes(sortBy)) sortBy = 'created_at';
    if (!validSortOrders.includes(sortOrder)) sortOrder = 'desc';

    queryText += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const [productsResult, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, whereConditions.length > 0 ? queryParams.slice(0, -2) : [])
    ]);

    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      products: productsResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Failed to get products' });
  }
});

// Get product by barcode
router.get('/barcode/:code', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code;
    const isAdmin = req.user.role === 'admin';

    let selectFields = 'id, name, imei, description, stock_status, stock_quantity, created_at, barcode, category, subcategory, model, color, storage_gb';
    if (isAdmin) {
      selectFields += ', price';
    }

    const result = await query(
      `SELECT ${selectFields} FROM products WHERE barcode = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ message: 'Failed to get product by barcode' });
  }
});

// Get single product by numeric id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    let selectFields = 'id, name, imei, description, stock_status, stock_quantity, created_at, barcode, category, subcategory, model, color, storage_gb';
    if (isAdmin) {
      selectFields += ', price';
    }

    const result = await query(
      `SELECT ${selectFields} FROM products WHERE id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Failed to get product' });
  }
});

// Create product (admin only)
router.post('/', [
  authenticateToken,
  requireAdmin,
  body('name').trim().isLength({ min: 2, max: 255 }),
  body('imei').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 255) {
      return true; // Allow valid length values
    }
    throw new Error('IMEI must be between 1 and 255 characters if provided');
  }),
  body('description').optional().trim(),
  body('price').isInt({ min: 0 }),
  body('stock_status').optional().isIn(['enabled', 'disabled']),
  body('stock_quantity').optional().isInt({ min: 0 }),
  body('barcode').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 255) {
      return true; // Allow valid length values
    }
    throw new Error('Barcode must be between 1 and 255 characters if provided');
  }),
  body('category').isIn(['accessories', 'smartphones']).withMessage('Category must be either accessories or smartphones'),
  body('subcategory').optional().trim().isLength({ max: 50 }).withMessage('Subcategory must be less than 50 characters'),
  body('color').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 50) {
      return true; // Allow valid length values
    }
    throw new Error('Color must be between 1 and 50 characters if provided');
  }),
  body('storage_gb').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (typeof value === 'string' && value.length <= 50) {
      return true;
    }
    throw new Error('Storage must be a string up to 50 characters if provided');
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, imei, description, price, stock_status = 'enabled', stock_quantity = 0, barcode, category = 'accessories', subcategory, color, storage_gb, model } = req.body;

    // Fetch allowed subcategories and smartphone models from settings
    const settingsResult = await query('SELECT smartphone_subcategories, accessory_subcategories, smartphone_models FROM settings ORDER BY id LIMIT 1');
    const settingsRow = settingsResult.rows[0] || {};
    const smartphoneSubcats = Array.isArray(settingsRow.smartphone_subcategories) ? settingsRow.smartphone_subcategories : [];
    const smartphoneModels = Array.isArray(settingsRow.smartphone_models) ? settingsRow.smartphone_models : [];
    const accessorySubcats = Array.isArray(settingsRow.accessory_subcategories) ? settingsRow.accessory_subcategories : [];

    // Validate subcategory dynamically if provided
    if (subcategory && subcategory !== '') {
      const allowed = category === 'smartphones' ? smartphoneSubcats : accessorySubcats;
      if (!allowed.includes(subcategory)) {
        return res.status(400).json({ message: 'Invalid subcategory for selected category' });
      }
    }

    // Validate model against settings for smartphones
    if (category === 'smartphones' && model) {
      const foundModel = smartphoneModels.find(m => m.name === model);
      if (!foundModel) {
        return res.status(400).json({ message: 'Invalid smartphone model' });
      }
      // If storage/color provided, validate they exist in model config (treat storages as text)
      const normalize = (v) => String(v ?? '').trim().toLowerCase();
      const modelStorages = Array.isArray(foundModel.storages) ? foundModel.storages.map(normalize) : [];
      if (storage_gb && !modelStorages.includes(normalize(storage_gb))) {
        return res.status(400).json({ message: 'Invalid storage for selected model' });
      }
      if (color && !foundModel.colors.includes(color)) {
        return res.status(400).json({ message: 'Invalid color for selected model' });
      }
    }

    // Clean empty strings to null for database insertion
    const cleanImei = imei === '' ? null : imei;
    const cleanDescription = description === '' ? null : description;
    const cleanBarcode = barcode === '' ? null : barcode;
    const cleanSubcategory = subcategory === '' ? null : subcategory;
    const cleanColor = color === '' ? null : color;
    const cleanModel = model === '' ? null : model;
    const cleanStorageGb = storage_gb === '' ? null : storage_gb;
    const cleanPrice = price === '' ? null : price;
    // Enforce smartphone stock to be 1
    const enforcedStockQuantity = category === 'smartphones' ? 1 : stock_quantity;
    const cleanStockQuantity = enforcedStockQuantity === '' ? null : enforcedStockQuantity;

    const result = await query(
      'INSERT INTO products (name, imei, description, price, stock_status, stock_quantity, barcode, category, subcategory, model, color, storage_gb) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [name, cleanImei, cleanDescription, cleanPrice, stock_status, cleanStockQuantity, cleanBarcode, category, cleanSubcategory, cleanModel, cleanColor, cleanStorageGb]
    );

    res.status(201).json({
      message: 'Product created successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

// Update product (admin only)
router.put('/:id', [
  authenticateToken,
  requireAdmin,
  body('name').optional().trim().isLength({ min: 2, max: 255 }),
  body('imei').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 255) {
      return true; // Allow valid length values
    }
    throw new Error('IMEI must be between 1 and 255 characters if provided');
  }),
  body('description').optional().trim(),
  body('price').optional().isInt({ min: 0 }),
  body('stock_status').optional().isIn(['enabled', 'disabled']),
  body('stock_quantity').optional().isInt({ min: 0 }),
  body('barcode').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 255) {
      return true; // Allow valid length values
    }
    throw new Error('Barcode must be between 1 and 255 characters if provided');
  }),
  body('category').optional().isIn(['accessories', 'smartphones']).withMessage('Category must be either accessories or smartphones'),
  body('subcategory').optional().trim().isLength({ max: 50 }).withMessage('Subcategory must be less than 50 characters'),
  body('subcategory').optional().trim().isLength({ max: 50 }).withMessage('Subcategory must be less than 50 characters'),
  body('color').optional().trim().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (value.length >= 1 && value.length <= 50) {
      return true; // Allow valid length values
    }
    throw new Error('Color must be between 1 and 255 characters if provided');
  }),
  body('storage_gb').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (typeof value === 'string' && value.length <= 50) {
      return true;
    }
    throw new Error('Storage must be a string up to 50 characters if provided');
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const productId = parseInt(req.params.id);
    const { name, imei, description, price, stock_status, stock_quantity, barcode, category, subcategory, color, storage_gb } = req.body;

    // Fetch current product to determine effective category if not provided
    const currentResult = await query('SELECT category FROM products WHERE id = $1', [productId]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const currentCategory = currentResult.rows[0].category;
    const effectiveCategory = category !== undefined ? category : currentCategory;

    // Fetch allowed subcategories and smartphone models from settings
    const settingsResult = await query('SELECT smartphone_subcategories, accessory_subcategories, smartphone_models FROM settings ORDER BY id LIMIT 1');
    const settingsRow = settingsResult.rows[0] || {};
    const smartphoneSubcats = Array.isArray(settingsRow.smartphone_subcategories) ? settingsRow.smartphone_subcategories : [];
    const accessorySubcats = Array.isArray(settingsRow.accessory_subcategories) ? settingsRow.accessory_subcategories : [];

    // Validate subcategory dynamically if provided
    if (subcategory !== undefined && subcategory !== null && subcategory !== '') {
      const allowed = effectiveCategory === 'smartphones' ? smartphoneSubcats : accessorySubcats;
      if (!allowed.includes(subcategory)) {
        return res.status(400).json({ message: 'Invalid subcategory for selected category' });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (imei !== undefined) {
      updates.push(`imei = $${paramCount}`);
      values.push(imei === '' ? null : imei);
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description === '' ? null : description);
      paramCount++;
    }

    if (price !== undefined) {
      updates.push(`price = $${paramCount}`);
      values.push(price === '' ? null : price);
      paramCount++;
    }

    if (stock_status !== undefined) {
      updates.push(`stock_status = $${paramCount}`);
      values.push(stock_status);
      paramCount++;
    }

    // Enforce smartphone stock = 1 on update (based on effective category)
    if (effectiveCategory === 'smartphones') {
      updates.push(`stock_quantity = $${paramCount}`);
      values.push(1);
      paramCount++;
    } else if (stock_quantity !== undefined) {
      updates.push(`stock_quantity = $${paramCount}`);
      values.push(stock_quantity === '' ? null : stock_quantity);
      paramCount++;
    }

    if (barcode !== undefined) {
      updates.push(`barcode = $${paramCount}`);
      values.push(barcode === '' ? null : barcode);
      paramCount++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramCount}`);
      values.push(category);
      paramCount++;
    }

    if (subcategory !== undefined) {
      updates.push(`subcategory = $${paramCount}`);
      values.push(subcategory === '' ? null : subcategory);
      paramCount++;
    }

    if (color !== undefined) {
      updates.push(`color = $${paramCount}`);
      values.push(color === '' ? null : color);
      paramCount++;
    }

    if (storage_gb !== undefined) {
      updates.push(`storage_gb = $${paramCount}`);
      values.push(storage_gb === '' ? null : storage_gb);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No valid updates provided' });
    }

    values.push(productId);
    const result = await query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      message: 'Product updated successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

// Delete product (admin only)
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    // Check if product exists and has no associated orders
    const orderCheck = await query(
      'SELECT COUNT(*) FROM order_items WHERE product_id = $1',
      [productId]
    );

    if (parseInt(orderCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete product with existing orders' 
      });
    }

    const result = await query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

module.exports = router; 