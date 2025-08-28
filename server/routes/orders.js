const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, run, get, pool } = require('../database/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

const router = express.Router();

// Get orders (admin: all orders, client: own orders)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', search = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user.role === 'admin';

    let queryText = `
      SELECT o.id, o.status, o.total_amount, o.created_at,
             u.name as client_name, u.email as client_email,
             o.guest_name, o.guest_email, o.guest_phone,
             COALESCE(eur_totals.eur_total, 0) as eur_total,
             COALESCE(mkd_totals.mkd_total, 0) as mkd_total
      FROM orders o
      LEFT JOIN users u ON o.client_id = u.id
      LEFT JOIN (
        SELECT oi.order_id, 
               SUM(oi.quantity * oi.price) as eur_total
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE p.category = 'smartphones'
        GROUP BY oi.order_id
      ) eur_totals ON o.id = eur_totals.order_id
      LEFT JOIN (
        SELECT oi.order_id, 
               SUM(oi.quantity * oi.price) as mkd_total
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE p.category != 'smartphones'
        GROUP BY oi.order_id
      ) mkd_totals ON o.id = mkd_totals.order_id
    `;
    let countQuery = `
      SELECT COUNT(*) 
      FROM orders o
      LEFT JOIN users u ON o.client_id = u.id
    `;
    let queryParams = [];
    let paramCount = 1;
    let whereConditions = [];

    // Client can only see their own orders
    if (!isAdmin) {
      whereConditions.push(`o.client_id = $${paramCount}`);
      queryParams.push(req.user.id);
      paramCount++;
    }

    // Status filter
    if (status && ['pending', 'completed'].includes(status)) {
      whereConditions.push(`o.status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    // Search filter
    if (search && search.trim()) {
      whereConditions.push(`(o.id::text ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
      queryParams.push(`%${search.trim()}%`);
      paramCount++;
    }

    // Add WHERE clause if conditions exist
    if (whereConditions.length > 0) {
      const whereClause = whereConditions.join(' AND ');
      queryText += ` WHERE ${whereClause}`;
      countQuery += ` WHERE ${whereClause}`;
    }

    // Validate sort parameters
    const validSortFields = ['created_at', 'total_amount', 'status'];
    const validSortOrders = ['asc', 'desc'];
    
    if (!validSortFields.includes(sortBy)) sortBy = 'created_at';
    if (!validSortOrders.includes(sortOrder)) sortOrder = 'desc';

    queryText += ` ORDER BY o.${sortBy} ${sortOrder.toUpperCase()} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const [ordersResult, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, whereConditions.length > 0 ? queryParams.slice(0, -2) : [])
    ]);

    const totalOrders = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalOrders / limit);

    res.json({
      orders: ordersResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalOrders,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Failed to get orders' });
  }
});

// Get total revenue from all completed orders (separated by currency)
router.get('/revenue', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.category = 'smartphones' THEN oi.quantity * oi.price ELSE 0 END), 0) as eur_revenue,
        COALESCE(SUM(CASE WHEN p.category != 'smartphones' THEN oi.quantity * oi.price ELSE 0 END), 0) as mkd_revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.status = 'completed'
    `);
    
    res.json({
      eurRevenue: parseFloat(result.rows[0].eur_revenue),
      mkdRevenue: parseFloat(result.rows[0].mkd_revenue),
      totalRevenue: parseFloat(result.rows[0].eur_revenue) + parseFloat(result.rows[0].mkd_revenue)
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ message: 'Failed to get revenue' });
  }
});

// Get single order with items
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    // Get order details
    let orderQuery = `
      SELECT o.id, o.status, o.total_amount, o.created_at,
             u.name as client_name, u.email as client_email,
             o.guest_name, o.guest_email, o.guest_phone
      FROM orders o
      LEFT JOIN users u ON o.client_id = u.id
      WHERE o.id = $1
    `;
    let orderParams = [orderId];

    // Client can only see their own orders
    if (!isAdmin) {
      orderQuery += ' AND o.client_id = $2';
      orderParams.push(req.user.id);
    }

    const orderResult = await query(orderQuery, orderParams);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Get order items
    const itemsResult = await query(`
      SELECT oi.quantity, oi.price,
             p.id as product_id, p.name as product_name, p.description, p.category
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [orderId]);

    const order = orderResult.rows[0];
    order.items = itemsResult.rows;

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Failed to get order' });
  }
});

// Create order (client or admin for guest)
router.post('/', [
  authenticateToken,
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  body('guestName').optional().isString().trim().isLength({ min: 1 }),
  body('guestEmail').optional().isEmail(),
  body('guestPhone').optional().isString().trim(),
  body('clientId').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['pending', 'completed']).withMessage('Status must be pending or completed')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { items, guestName, guestEmail, guestPhone, clientId: requestedClientId, status = 'pending' } = req.body;
    const isAdmin = req.user.role === 'admin';
    let clientId = req.user.id;
    let guestInfo = null;

    // Handle client order assignment (admin only)
    if (requestedClientId) {
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only admins can assign orders to other clients' });
      }
      clientId = requestedClientId;
    }

    // Handle guest order (admin only). Allow name-only guests; email/phone optional
    if (guestName) {
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only admins can create guest orders' });
      }
      clientId = null;
      guestInfo = { guestName, guestEmail: guestEmail || '', guestPhone: guestPhone || null };
    }

    // Validate products and calculate totals
    let totalAmount = 0;
    let eurPendingTotal = 0; // Sum of smartphone items (EUR)
    let mkdPendingTotal = 0; // Sum of non-smartphone items (MKD)
    const validatedItems = [];

    for (const item of items) {
      const productResult = await query(
        'SELECT id, name, price, stock_status, stock_quantity, category FROM products WHERE id = $1',
        [item.productId]
      );

      if (productResult.rows.length === 0) {
        return res.status(400).json({ message: `Product ${item.productId} not found` });
      }

      const product = productResult.rows[0];

      if (product.stock_status === 'disabled') {
        return res.status(400).json({ message: `Product ${product.name} is not available` });
      }

      if (product.stock_quantity < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }

      const lineTotal = product.price * item.quantity;
      totalAmount += lineTotal;

      // Track totals by currency based on category
      if (product.category === 'smartphones') {
        eurPendingTotal += lineTotal;
      } else {
        mkdPendingTotal += lineTotal;
      }
      validatedItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
        name: product.name,
        category: product.category
      });
    }

    // Create order
    let orderResult;
    if (guestInfo) {
      // Guest order
      orderResult = await query(
        'INSERT INTO orders (client_id, guest_name, guest_email, guest_phone, total_amount, status, original_status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [clientId, guestInfo.guestName, guestInfo.guestEmail, guestInfo.guestPhone, totalAmount, status, status]
      );
    } else {
      // Client order
      orderResult = await query(
        'INSERT INTO orders (client_id, total_amount, status, original_status) VALUES ($1, $2, $3, $4) RETURNING id',
        [clientId, totalAmount, status, status]
      );
    }
    


    const orderId = orderResult.rows[0].id;

    // Create order items and update stock
    for (const item of validatedItems) {
      await query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, item.productId, item.quantity, item.price]
      );

      // Update stock quantity
      await query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );
    }

    // Record debt increase ONLY when a pending order is created for a client
    if (!guestInfo && clientId && status === 'pending') {
      const notes = `Debt increase from pending order #${orderId}`;
      // Use negative amount to represent increase; positive amounts are manual reductions
      if (eurPendingTotal > 0) {
        await query(
          'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
          [clientId, -eurPendingTotal, 'manual_reduction', 'EUR', notes, req.user.id]
        );
      }
      if (mkdPendingTotal > 0) {
        await query(
          'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
          [clientId, -mkdPendingTotal, 'manual_reduction', 'MKD', notes, req.user.id]
        );
      }
    }

    res.status(201).json({
      message: 'Order created successfully',
      orderId,
      totalAmount
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order' });
  }
});

// Update order status (admin only)
router.put('/:id/status', [
  authenticateToken,
  requireAdmin,
  body('status').isIn(['pending', 'completed'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    const result = await query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      message: 'Order status updated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// Generate PDF invoice
router.get('/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    // Get order details
    let orderQuery = `
      SELECT o.id, o.status, o.total_amount, o.created_at,
             u.name as client_name, u.email as client_email,
             o.guest_name, o.guest_email, o.guest_phone
      FROM orders o
      LEFT JOIN users u ON o.client_id = u.id
      WHERE o.id = $1
    `;
    let orderParams = [orderId];

    // Client can only download their own invoices
    if (!isAdmin) {
      orderQuery += ' AND o.client_id = $2';
      orderParams.push(req.user.id);
    }

    const orderResult = await query(orderQuery, orderParams);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await query(`
      SELECT oi.quantity, oi.price,
             p.name as product_name, p.description, p.category, p.subcategory, p.model, p.storage_gb, p.color
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [orderId]);

    // Get company settings
    const settingsResult = await query('SELECT * FROM settings ORDER BY id LIMIT 1');
    const settings = settingsResult.rows[0] || {
      company_name: 'POS CRM System',
      company_address: '123 Business Street',
      company_city_state: 'City, State 12345',
      company_phone: '(555) 123-4567',
      company_email: 'info@poscrm.com'
    };

    // Generate PDF
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function to draw a line
    const drawLine = (y) => {
      doc.moveTo(50, y).lineTo(530, y).stroke();
    };

    // Helper function to draw a box
    const drawBox = (x, y, width, height) => {
      doc.rect(x, y, width, height).stroke();
    };

    // Set black color for all text
    const black = '#000000';

    // Header Section
    doc.fontSize(28).font('Helvetica-Bold').fillColor(black).text('INVOICE', { align: 'center' });
    
    // Company Logo/Name
    doc.fontSize(18).font('Helvetica-Bold').fillColor(black).text(settings.company_name, 50, 120);
    doc.fontSize(10).font('Helvetica').fillColor(black);
    if (settings.company_address) {
      doc.text(settings.company_address, 50, 140);
    }
    if (settings.company_city_state) {
      doc.text(settings.company_city_state, 50, 155);
    }
    if (settings.company_phone) {
      doc.text(`Phone: ${settings.company_phone}`, 50, 170);
    }
    if (settings.company_email) {
      doc.text(`Email: ${settings.company_email}`, 50, 185);
    }

    // Invoice Details (Right side)
    const invoiceDate = new Date(order.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black).text('INVOICE DETAILS', 350, 120);
    doc.fontSize(10).font('Helvetica').fillColor(black).text(`Invoice #: ${orderId}`, 350, 140);
    doc.text(`Date: ${invoiceDate}`, 350, 155);
    doc.text(`Status: ${order.status.toUpperCase()}`, 350, 170);
    
    // Draw line after header
    drawLine(200);
    doc.moveDown(1);

    // Bill To Section
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black).text('BILL TO:', 50, 220);
    doc.fontSize(10).font('Helvetica').fillColor(black);
    
    if (order.client_name) {
      doc.text(order.client_name, 50, 240);
      doc.text(order.client_email, 50, 255);
    } else {
      doc.text(order.guest_name, 50, 240);
      doc.text(order.guest_email, 50, 255);
      if (order.guest_phone) {
        doc.text(order.guest_phone, 50, 270);
      }
    }

    // Items Table Header
    const tableY = 300;
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black);
    
    // Draw table header box
    drawBox(50, tableY - 10, 480, 25);
    
    // Table headers
    doc.text('Product', 60, tableY);
    doc.text('Details', 220, tableY);
    doc.text('Qty', 320, tableY);
    doc.text('Price', 380, tableY);
    doc.text('Total', 480, tableY);
    
    // Draw line under header
    drawLine(tableY + 15);

    // Items - Separated by Currency
    let currentY = tableY + 25;
    doc.fontSize(10).font('Helvetica').fillColor(black);
    
    // Separate items by category
    const eurItems = itemsResult.rows.filter(item => item.category === 'smartphones');
    const mkdItems = itemsResult.rows.filter(item => item.category !== 'smartphones');
    
    // EUR Products (Smartphones) Section
    if (eurItems.length > 0) {
      // Section header
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#059669'); // Green color for EUR
      doc.text('EUR Products (Smartphones)', 60, currentY);
      currentY += 20;
      
      eurItems.forEach((item, index) => {
        const price = parseFloat(item.price);
        const itemTotal = item.quantity * price;
        
        // Alternate row colors (light green for even rows)
        if (index % 2 === 1) {
          doc.rect(50, currentY - 5, 480, 20).fill('#ecfdf5');
        }
        
        // Explicitly set text color to black for each row
        doc.fillColor(black);
        
        // Set font size to 8 for product details
        doc.fontSize(10).font('Helvetica');
        
        // For smartphones, show subcategory • model, otherwise just product name
        const displayName = item.subcategory && item.model 
          ? `${item.subcategory} • ${item.model}`
          : item.product_name;
        doc.text(displayName, 60, currentY);
        
        // Details column - show storage and color if available
        const details = [];
        if (item.storage_gb) details.push(item.storage_gb);
        if (item.color) details.push(item.color);
        const detailsText = details.length > 0 ? details.join(' • ') : '-';
        doc.text(detailsText, 220, currentY);
        
        doc.text(item.quantity.toString(), 320, currentY);
        doc.text(`${price.toFixed(0)} EUR`, 380, currentY);
        doc.text(`${itemTotal.toFixed(0)} EUR`, 480, currentY);
        
        currentY += 20;
      });
      
      currentY += 10; // Add space between sections
    }
    
    // MKD Products (Accessories) Section
    if (mkdItems.length > 0) {
      // Section header
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1d4ed8'); // Blue color for MKD
      doc.text('MKD Products (Accessories)', 60, currentY);
      currentY += 20;
      
      mkdItems.forEach((item, index) => {
        const price = parseFloat(item.price);
        const itemTotal = item.quantity * price;
        
        // Alternate row colors (light blue for even rows)
        if (index % 2 === 1) {
          doc.rect(50, currentY - 5, 480, 20).fill('#eff6ff');
        }
        
        // Explicitly set text color to black for each row
        doc.fillColor(black);
        
        // Set font size to 8 for product details
        doc.fontSize(10).font('Helvetica');
        
        doc.text(item.product_name, 60, currentY);
        
        // Details column - show storage and color if available
        const details = [];
        if (item.storage_gb) details.push(item.storage_gb);
        if (item.color) details.push(item.color);
        const detailsText = details.length > 0 ? details.join(' • ') : '-';
        doc.text(detailsText, 220, currentY);
        
        doc.text(item.quantity.toString(), 320, currentY);
        doc.text(`${price.toFixed(0)} MKD`, 380, currentY);
        doc.text(`${itemTotal.toFixed(0)} MKD`, 480, currentY);
        
        currentY += 20;
      });
    }

    // Draw line after items
    drawLine(currentY + 5);

    // Total Section - Separated by Currency
    const totalY = currentY + 20;
    const totalBoxX = 280;
    const totalBoxWidth = 200;
    
    // Calculate totals by currency
    const eurTotal = eurItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
    const mkdTotal = mkdItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
    
    let totalSectionY = totalY;
    
    // EUR Total (if any)
    if (eurTotal > 0) {
      // Draw box around EUR total
      drawBox(totalBoxX, totalSectionY - 10, totalBoxWidth, 25);
      
      // Label on the left
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#059669') // Green color for EUR
        .text('Total EUR:', totalBoxX + 10, totalSectionY);
      
      // Amount right-aligned within the box
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#059669')
        .text(`${eurTotal.toFixed(0)} EUR`, totalBoxX + 10, totalSectionY, { width: totalBoxWidth - 20, align: 'right' });
      
      totalSectionY += 35; // Space for next total
    }
    
    // MKD Total (if any)
    if (mkdTotal > 0) {
      // Draw box around MKD total
      drawBox(totalBoxX, totalSectionY - 10, totalBoxWidth, 25);
      
      // Label on the left
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1d4ed8') // Blue color for MKD
        .text('Total MKD:', totalBoxX + 10, totalSectionY);
      
      // Amount right-aligned within the box
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1d4ed8')
        .text(`${mkdTotal.toFixed(0)} MKD`, totalBoxX + 10, totalSectionY, { width: totalBoxWidth - 20, align: 'right' });
      
      totalSectionY += 35; // Space for next total
    }
    


    // Footer
    doc.fontSize(10).font('Helvetica').fillColor(black).text('Thank you for your business!', { align: 'center' }, totalSectionY + 50);

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Generate invoice error:', error);
    console.error('Error details:', {
      orderId,
      order: orderResult?.rows?.[0],
      items: itemsResult?.rows,
      errorMessage: error.message,
      errorStack: error.stack
    });
    res.status(500).json({ message: 'Failed to generate invoice', error: error.message });
  }
});

// Update order (admin only) - can update status and items
router.put('/:id', authenticateToken, requireAdmin, [
  body('status').optional().isIn(['pending', 'completed']).withMessage('Status must be pending or completed'),
  body('items').optional().isArray({ min: 1 }).withMessage('Items must be an array with at least one item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
], async (req, res) => {
  console.log('Update order request:', { orderId: req.params.id, body: req.body });
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: errors.array() 
      });
    }

    const orderId = parseInt(req.params.id);
    const { status, items } = req.body;

    // Check if order exists
    const orderResult = await query('SELECT id FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update order status if provided
      if (status) {
        await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
      }

      // Update order items if provided
      if (items && Array.isArray(items)) {
        console.log('Updating order items:', { orderId, itemsCount: items.length });
        console.log('Items to insert:', JSON.stringify(items, null, 2));
        
        // Get current order items before deletion to restore stock
        const currentItemsResult = await client.query(`
          SELECT oi.product_id, oi.quantity, oi.price, p.category
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = $1
        `, [orderId]);
        const currentItems = currentItemsResult.rows;
        console.log('Current items to restore stock:', currentItems);
        
        // Also get current stock levels for debugging
        for (const item of currentItems) {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1',
            [item.product_id]
          );
          const currentStock = stockResult.rows[0]?.stock_quantity || 0;
          console.log(`Product ${item.product_id} current stock: ${currentStock}, will restore: ${item.quantity}`);
        }
        
        // Restore stock for all current items
        for (const item of currentItems) {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
            [item.quantity, item.product_id]
          );
          console.log(`Restored ${item.quantity} units to product ${item.product_id}`);
        }
        
        // Verify stock restoration worked
        for (const item of currentItems) {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1',
            [item.product_id]
          );
          const newStock = stockResult.rows[0]?.stock_quantity || 0;
          console.log(`Product ${item.product_id} stock after restoration: ${newStock}`);
        }
        
        // Calculate debt impact of removed items (add to debt since items are being removed)
        let eurDebtIncrease = 0;
        let mkdDebtIncrease = 0;
        
        for (const item of currentItems) {
          const itemTotal = item.quantity * item.price;
          if (item.category === 'smartphones') {
            eurDebtIncrease += itemTotal;
          } else {
            mkdDebtIncrease += itemTotal;
          }
        }
        
        console.log('Debt increase from removed items:', { eurDebtIncrease, mkdDebtIncrease });
        
        // Get the order's client ID for debt adjustment
        const orderClientResult = await client.query(
          'SELECT client_id FROM orders WHERE id = $1',
          [orderId]
        );
        const clientId = orderClientResult.rows[0]?.client_id;
        
        // Add debt adjustments for removed items
        if (eurDebtIncrease > 0 && clientId) {
          try {
            await client.query(
              'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [clientId, eurDebtIncrease, 'manual_reduction', 'EUR', `Items removed from order #${orderId} - debt increased`, req.user.id]
            );
            console.log(`Added EUR debt adjustment: ${eurDebtIncrease}`);
          } catch (debtError) {
            console.error('Error adding EUR debt adjustment:', debtError);
            // Continue with order update even if debt adjustment fails
          }
        }
        
        if (mkdDebtIncrease > 0 && clientId) {
          try {
            await client.query(
              'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [clientId, mkdDebtIncrease, 'manual_reduction', 'MKD', `Items removed from order #${orderId} - debt increased`, req.user.id]
            );
            console.log(`Added MKD debt adjustment: ${mkdDebtIncrease}`);
          } catch (debtError) {
            console.error('Error adding MKD debt adjustment:', debtError);
            // Continue with order update even if debt adjustment fails
          }
        }
        
        // Delete existing order items
        const deleteResult = await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
        console.log('Deleted existing items:', deleteResult.rowCount);

        // Insert new order items and reduce stock
        for (const item of items) {
          console.log('Inserting item:', item);
          console.log('Item fields:', { 
            orderId, 
            productId: item.productId, 
            quantity: item.quantity, 
            price: item.price 
          });
          
          // Check if we have enough stock
          const stockCheckResult = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1',
            [item.productId]
          );
          
          if (stockCheckResult.rows.length === 0) {
            throw new Error(`Product ${item.productId} not found`);
          }
          
          const currentStock = stockCheckResult.rows[0].stock_quantity;
          if (currentStock < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.productId}. Available: ${currentStock}, Requested: ${item.quantity}`);
          }
          
          // Reduce stock for the new item
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.productId]
          );
          console.log(`Reduced ${item.quantity} units from product ${item.productId}`);
          
          const insertResult = await client.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
            [orderId, item.productId, item.quantity, item.price]
          );
          console.log('Inserted item result:', insertResult.rowCount);
        }
        
        // Calculate debt impact of newly added items (subtract from debt since items are being added)
        let eurDebtDecrease = 0;
        let mkdDebtDecrease = 0;
        
        for (const item of items) {
          // Get product category for debt calculation
          const productResult = await client.query(
            'SELECT category FROM products WHERE id = $1',
            [item.productId]
          );
          const category = productResult.rows[0]?.category;
          
          const itemTotal = item.quantity * item.price;
          if (category === 'smartphones') {
            eurDebtDecrease += itemTotal;
          } else {
            mkdDebtDecrease += itemTotal;
          }
        }
        
        console.log('Debt decrease from added items:', { eurDebtDecrease, mkdDebtDecrease });
        
        // Add debt adjustments for newly added items (negative amounts reduce debt)
        if (eurDebtDecrease > 0 && clientId) {
          try {
            await client.query(
              'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [clientId, -eurDebtDecrease, 'manual_reduction', 'EUR', `Items added to order #${orderId} - debt reduced`, req.user.id]
            );
            console.log(`Added EUR debt reduction: ${-eurDebtDecrease}`);
          } catch (debtError) {
            console.error('Error adding EUR debt reduction:', debtError);
            // Continue with order update even if debt adjustment fails
          }
        }
        
        if (mkdDebtDecrease > 0 && clientId) {
          try {
            await client.query(
              'INSERT INTO user_debt_adjustments (user_id, adjustment_amount, adjustment_type, currency, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [clientId, -mkdDebtDecrease, 'manual_reduction', 'MKD', `Items added to order #${orderId} - debt reduced`, req.user.id]
            );
            console.log(`Added MKD debt reduction: ${-mkdDebtDecrease}`);
          } catch (debtError) {
            console.error('Error adding MKD debt reduction:', debtError);
            // Continue with order update even if debt adjustment fails
          }
        }

        // Recalculate order total
        const totalsResult = await client.query(`
          SELECT SUM(oi.quantity * oi.price) as total_amount
          FROM order_items oi
          WHERE oi.order_id = $1
        `, [orderId]);

        const totals = totalsResult.rows[0];
        console.log('Calculated total:', totals);
        
        await client.query(
          'UPDATE orders SET total_amount = $1 WHERE id = $2',
          [totals.total_amount || 0, orderId]
        );
        console.log('Updated order total in database');
      }

      await client.query('COMMIT');

      res.json({ 
        message: 'Order updated successfully',
        orderId,
        status: status || 'unchanged',
        itemsUpdated: items ? true : false
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: 'Failed to update order' });
  }
});

// Delete order (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    // Check if order exists
    const orderResult = await query('SELECT id FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Delete order items first (due to foreign key constraint)
    await query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    // Delete the order
    await query('DELETE FROM orders WHERE id = $1', [orderId]);

    res.json({ 
      message: 'Order deleted successfully',
      orderId
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Failed to delete order' });
  }
});

// Update order status only (admin only) - for backward compatibility
router.put('/:id/status', authenticateToken, requireAdmin, [
  body('status').isIn(['pending', 'completed']).withMessage('Status must be pending or completed')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: errors.array() 
      });
    }

    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    // Check if order exists
    const orderResult = await query('SELECT id FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order status
    await query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);

    res.json({ 
      message: 'Order status updated successfully',
      orderId,
      status 
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

module.exports = router; 