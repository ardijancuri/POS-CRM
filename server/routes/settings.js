const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, run } = require('../database/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get settings (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM settings ORDER BY id LIMIT 1');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Settings not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to get settings' });
  }
});

// Update settings (admin only)
router.put('/', [
  authenticateToken,
  requireAdmin,
  body('company_name').trim().isLength({ min: 1, max: 255 }).withMessage('Company name is required and must be less than 255 characters'),
  body('company_address').optional().trim(),
  body('company_city_state').optional().trim().isLength({ max: 255 }).withMessage('City/State must be less than 255 characters'),
  body('company_phone').optional().trim().isLength({ max: 100 }).withMessage('Phone must be less than 100 characters'),
  body('company_email').optional().trim().isEmail().withMessage('Email must be a valid email address'),
  body('smartphone_subcategories').optional().custom((value) => {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) return true;
    throw new Error('smartphone_subcategories must be an array of strings');
  }),
  body('accessory_subcategories').optional().custom((value) => {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) return true;
    throw new Error('accessory_subcategories must be an array of strings');
  }),
  body('smartphone_models').optional().custom((value) => {
    if (value === null || value === undefined) return true;
    if (!Array.isArray(value)) throw new Error('smartphone_models must be an array');
    // Each model: { brand?: string, name: string, storages: string[] | number[], colors: string[], price?: number, storage_prices?: Record<string, number>, condition?: string, subcategory?: string }
    for (const m of value) {
      if (typeof m !== 'object' || !m) throw new Error('Each model must be an object');
      if (typeof m.name !== 'string' || m.name.trim() === '') throw new Error('Model name is required');
      if (!Array.isArray(m.storages) || !m.storages.every(s => typeof s === 'string' || typeof s === 'number')) {
        throw new Error('Model storages must be an array of strings');
      }
      if (!Array.isArray(m.colors) || !m.colors.every(c => typeof c === 'string')) throw new Error('Model colors must be string array');
      if (m.price !== undefined && typeof m.price !== 'number') throw new Error('Model price must be a number');
      if (m.storage_prices !== undefined) {
        if (typeof m.storage_prices !== 'object' || Array.isArray(m.storage_prices)) throw new Error('storage_prices must be an object');
        for (const [k, v] of Object.entries(m.storage_prices)) {
          if (typeof k !== 'string') throw new Error('storage_prices keys must be strings');
          if (typeof v !== 'number') throw new Error('storage_prices values must be numbers');
        }
      }
      if (m.condition !== undefined && typeof m.condition !== 'string') throw new Error('Model condition must be a string');
      if (m.subcategory !== undefined && typeof m.subcategory !== 'string') throw new Error('Model subcategory must be a string');
    }
    return true;
  })
], async (req, res) => {
  try {
    // Fetch previous settings to compare model price changes
    const prevSettingsResult = await query('SELECT smartphone_models FROM settings ORDER BY id LIMIT 1');
    const prevModels = Array.isArray(prevSettingsResult.rows?.[0]?.smartphone_models)
      ? prevSettingsResult.rows[0].smartphone_models
      : [];

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { company_name, company_address, company_city_state, company_phone, company_email, smartphone_subcategories, accessory_subcategories, smartphone_models } = req.body;

    const result = await query(
      `UPDATE settings 
       SET company_name = $1, company_address = $2, company_city_state = $3, company_phone = $4, company_email = $5, smartphone_subcategories = COALESCE($6, smartphone_subcategories), accessory_subcategories = COALESCE($7, accessory_subcategories), smartphone_models = COALESCE($8, smartphone_models), updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM settings ORDER BY id LIMIT 1)
       RETURNING *`,
      [company_name, company_address, company_city_state, company_phone, company_email, smartphone_subcategories ? JSON.stringify(smartphone_subcategories) : null, accessory_subcategories ? JSON.stringify(accessory_subcategories) : null, smartphone_models ? JSON.stringify(smartphone_models) : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Settings not found' });
    }

    // After updating settings, propagate model price changes to products
    try {
      const updatedModels = Array.isArray(result.rows[0].smartphone_models)
        ? result.rows[0].smartphone_models
        : [];

      const prevPriceByName = new Map();
      for (const m of prevModels) {
        if (m && typeof m.name === 'string') prevPriceByName.set(m.name, m.price);
      }

      const updates = [];
      for (const m of updatedModels) {
        if (!m || typeof m.name !== 'string') continue;
        if (typeof m.price !== 'number') continue; // only propagate numeric prices
        const prevPrice = prevPriceByName.get(m.name);
        if (prevPrice === undefined || prevPrice === m.price) continue; // skip if unchanged or previously undefined
        // Update all smartphone products with this model to new price
        updates.push(query(
          'UPDATE products SET price = $1 WHERE category = $2 AND model = $3',
          [m.price, 'smartphones', m.name]
        ));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch (propErr) {
      // Log but don't fail settings update
      console.error('Failed to propagate model price changes to products:', propErr);
    }

    // Propagate per-storage price changes where provided
    try {
      const updatedModels = Array.isArray(result.rows[0].smartphone_models)
        ? result.rows[0].smartphone_models
        : [];
      const storagePriceUpdates = [];
      for (const m of updatedModels) {
        if (!m || typeof m.name !== 'string') continue;
        if (!m.storage_prices || typeof m.storage_prices !== 'object') continue;
        for (const [storageKey, price] of Object.entries(m.storage_prices)) {
          if (typeof storageKey !== 'string') continue;
          if (typeof price !== 'number') continue;
          storagePriceUpdates.push(query(
            `UPDATE products SET price = $1 WHERE category = 'smartphones' AND model = $2 AND storage_gb = $3`,
            [price, m.name, storageKey]
          ));
        }
      }
      if (storagePriceUpdates.length > 0) await Promise.all(storagePriceUpdates);
    } catch (e) {
      console.error('Failed to propagate storage-specific price changes:', e);
    }

    // Propagate storage/color edits for models to existing products
    try {
      const updatedModels = Array.isArray(result.rows[0].smartphone_models)
        ? result.rows[0].smartphone_models
        : [];

      const prevByName = new Map();
      for (const m of prevModels) {
        if (!m || typeof m.name !== 'string') continue;
        prevByName.set(m.name, m);
      }

      const normalize = (v) => String(v ?? '').trim();
      const toLower = (v) => normalize(v).toLowerCase();

      const propagationQueries = [];

      for (const updated of updatedModels) {
        if (!updated || typeof updated.name !== 'string') continue;
        const prev = prevByName.get(updated.name);
        if (!prev) continue; // New model; nothing to propagate

        const prevStorages = Array.isArray(prev.storages) ? prev.storages.map(normalize) : [];
        const newStorages = Array.isArray(updated.storages) ? updated.storages.map(normalize) : [];
        const prevColors = Array.isArray(prev.colors) ? prev.colors.map(normalize) : [];
        const newColors = Array.isArray(updated.colors) ? updated.colors.map(normalize) : [];

        // 1) Handle potential renames when lengths match: map by index
        if (prevStorages.length === newStorages.length) {
          for (let i = 0; i < prevStorages.length; i++) {
            const oldVal = prevStorages[i];
            const newVal = newStorages[i];
            if (toLower(oldVal) !== toLower(newVal) && newVal !== '') {
              propagationQueries.push(
                query(
                  `UPDATE products SET storage_gb = $1 WHERE category = 'smartphones' AND model = $2 AND storage_gb = $3`,
                  [newVal, updated.name, oldVal]
                )
              );
            }
          }
        }

        if (prevColors.length === newColors.length) {
          for (let i = 0; i < prevColors.length; i++) {
            const oldVal = prevColors[i];
            const newVal = newColors[i];
            if (toLower(oldVal) !== toLower(newVal) && newVal !== '') {
              propagationQueries.push(
                query(
                  `UPDATE products SET color = $1 WHERE category = 'smartphones' AND model = $2 AND color = $3`,
                  [newVal, updated.name, oldVal]
                )
              );
            }
          }
        }

        // 2) If values removed, clear from existing products to keep consistency
        const newStoragesLower = new Set(newStorages.map(toLower));
        for (const oldVal of prevStorages) {
          if (!newStoragesLower.has(toLower(oldVal))) {
            propagationQueries.push(
              query(
                `UPDATE products SET storage_gb = NULL WHERE category = 'smartphones' AND model = $1 AND storage_gb = $2`,
                [updated.name, oldVal]
              )
            );
          }
        }

        const newColorsLower = new Set(newColors.map(toLower));
        for (const oldVal of prevColors) {
          if (!newColorsLower.has(toLower(oldVal))) {
            propagationQueries.push(
              query(
                `UPDATE products SET color = NULL WHERE category = 'smartphones' AND model = $1 AND color = $2`,
                [updated.name, oldVal]
              )
            );
          }
        }
      }

      if (propagationQueries.length > 0) {
        await Promise.all(propagationQueries);
      }
    } catch (propErr) {
      console.error('Failed to propagate model storage/color edits to products:', propErr);
    }

    res.json({
      message: 'Settings updated successfully',
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

module.exports = router; 