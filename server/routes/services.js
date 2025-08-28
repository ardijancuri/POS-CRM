const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../database/connection');
const PDFDocument = require('pdfkit');

// Get all services
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    // Search filter
    if (search) {
      whereConditions.push(`(
        full_name ILIKE $${paramCount} OR 
        contact ILIKE $${paramCount} OR 
        phone_model ILIKE $${paramCount} OR 
        imei ILIKE $${paramCount} OR 
        description ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Status filter
    if (status && ['in_service', 'completed'].includes(status)) {
      whereConditions.push(`status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM services ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Get services with pagination
    const selectQuery = `
      SELECT id, full_name, contact, phone_model, imei, description, price, status, profit, created_at, updated_at
      FROM services 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const finalParams = [...queryParams, limit, offset];
    const result = await db.query(selectQuery, finalParams);

    res.json({
      services: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Get service by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create new service
router.post('/', authenticateToken, requireAdmin, [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('contact').trim().notEmpty().withMessage('Contact is required'),
  body('phone_model').trim().notEmpty().withMessage('Phone model is required'),
  body('imei').optional().trim(),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('status').isIn(['in_service', 'completed']).withMessage('Status must be in_service or completed'),
  body('profit').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (isNaN(value) || parseFloat(value) < 0) {
      throw new Error('Profit must be a positive number');
    }
    return true;
  })
], async (req, res) => {
  try {
    console.log('Received service data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      full_name,
      contact,
      phone_model,
      imei,
      description,
      price,
      status,
      profit
    } = req.body;

    const result = await db.query(
      `INSERT INTO services (full_name, contact, phone_model, imei, description, price, status, profit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [full_name, contact, phone_model, imei || null, description, price, status, profit || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service
router.put('/:id', authenticateToken, requireAdmin, [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('contact').trim().notEmpty().withMessage('Contact is required'),
  body('phone_model').trim().notEmpty().withMessage('Phone model is required'),
  body('imei').optional().trim(),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('status').isIn(['in_service', 'completed']).withMessage('Status must be in_service or completed'),
  body('profit').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    if (isNaN(value) || parseFloat(value) < 0) {
      throw new Error('Profit must be a positive number');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      full_name,
      contact,
      phone_model,
      imei,
      description,
      price,
      status,
      profit
    } = req.body;

    const result = await db.query(
      `UPDATE services 
       SET full_name = $1, contact = $2, phone_model = $3, imei = $4, description = $5, 
           price = $6, status = $7, profit = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [full_name, contact, phone_model, imei || null, description, price, status, profit || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM services WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Generate PDF invoice for service
router.get('/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    // Get service details
    let serviceQuery = `
      SELECT id, full_name, contact, phone_model, imei, description, price, status, profit, created_at
      FROM services
      WHERE id = $1
    `;
    let serviceParams = [serviceId];

    // Non-admin users can only download their own service invoices
    if (!isAdmin) {
      serviceQuery += ' AND contact = $2';
      serviceParams.push(req.user.email || req.user.phone);
    }

    const serviceResult = await db.query(serviceQuery, serviceParams);

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const service = serviceResult.rows[0];

    // Get company settings
    const settingsResult = await db.query('SELECT * FROM settings ORDER BY id LIMIT 1');
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
    res.setHeader('Content-Disposition', `attachment; filename=service-invoice-${serviceId}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function to draw a line
    const drawLine = (y) => {
      doc.moveTo(50, y).lineTo(550, y).stroke();
    };

    // Helper function to draw a box
    const drawBox = (x, y, width, height) => {
      doc.rect(x, y, width, height).stroke();
    };

    // Set black color for all text
    const black = '#000000';

    // Header Section
    doc.fontSize(28).font('Helvetica-Bold').fillColor(black).text('SERVICE INVOICE', { align: 'center' });
    
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
    const invoiceDate = new Date(service.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black).text('INVOICE DETAILS', 350, 120);
    doc.fontSize(10).font('Helvetica').fillColor(black).text(`Invoice #: ${serviceId}`, 350, 140);
    doc.text(`Date: ${invoiceDate}`, 350, 155);
    doc.text(`Status: ${service.status.toUpperCase()}`, 350, 170);
    
    // Draw line after header
    drawLine(200);
    doc.moveDown(1);

    // Bill To Section
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black).text('BILL TO:', 50, 220);
    doc.fontSize(10).font('Helvetica').fillColor(black);
    
    doc.text(service.full_name, 50, 240);
    doc.text(service.contact, 50, 255);
    if (service.imei) {
      doc.text(`IMEI: ${service.imei}`, 50, 270);
    }

    // Service Details Section
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black).text('SERVICE DETAILS:', 50, 300);
    doc.fontSize(10).font('Helvetica').fillColor(black);
    
    doc.text(`Phone Model: ${service.phone_model}`, 50, 320);
    doc.text(`Description: ${service.description}`, 50, 335);
    
    // Draw line after service details
    drawLine(360);

    // Items Table Header
    const tableY = 380;
    doc.fontSize(12).font('Helvetica-Bold').fillColor(black);
    
    // Draw table header box
    drawBox(50, tableY - 10, 500, 25);
    
    // Table headers
    doc.text('Service', 60, tableY);
    doc.text('Description', 200, tableY);
    doc.text('Price', 400, tableY);
    doc.text('Total', 480, tableY);
    
    // Draw line under header
    drawLine(tableY + 15);

    // Service item
    let currentY = tableY + 25;
    
    // Draw row with light gray background
    doc.rect(50, currentY - 5, 500, 20).fill('#f8f9fa');
    
    const price = parseFloat(service.price);
    
    // Reset text color to black after background fill
    doc.fontSize(10).font('Helvetica').fillColor(black);
    doc.text('Phone Repair Service', 60, currentY);
    
    doc.fillColor(black);
    doc.text(service.description.substring(0, 30) + (service.description.length > 30 ? '...' : ''), 200, currentY);
    
    doc.fillColor(black);
    doc.text(`${price.toFixed(0)} MKD`, 400, currentY);
    
    doc.fillColor(black);
    doc.text(`${price.toFixed(0)} MKD`, 480, currentY);
    
    currentY += 20;

    // Draw line after items
    drawLine(currentY + 5);

    // Total Section
    const totalY = currentY + 20;
    const totalBoxX = 320;
    const totalBoxWidth = 230;

    // Draw box around total
    drawBox(totalBoxX, totalY - 10, totalBoxWidth, 30);

    // Label on the left
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(black)
      .text('Total Amount:', totalBoxX + 10, totalY);

    // Amount right-aligned within the box
    doc.fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(black)
      .text(`${price.toFixed(0)} MKD`, totalBoxX + 10, totalY, { width: totalBoxWidth - 20, align: 'right' });

    // Footer
    doc.fontSize(10).font('Helvetica').fillColor(black).text('Thank you for choosing our service!', { align: 'center' }, totalY + 50);

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Generate service invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice', error: error.message });
  }
});

module.exports = router;
