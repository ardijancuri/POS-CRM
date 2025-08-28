import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Download } from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';

const AdminProducts = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState([]);
  const [smartphoneSubcategories, setSmartphoneSubcategories] = useState([]);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [modelCounts, setModelCounts] = useState({});
  const [newModel, setNewModel] = useState({ name: '', price: undefined, storages: [], colors: [], condition: '', subcategory: '', storage_prices: {} });
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockDetails, setStockDetails] = useState({ model: '', items: [] });
  const [modelSearch, setModelSearch] = useState('');

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      const sm = Array.isArray(res.data?.smartphone_models) ? res.data.smartphone_models : [];
      const ss = Array.isArray(res.data?.smartphone_subcategories) ? res.data.smartphone_subcategories : [];
      setModels(sm);
      setSmartphoneSubcategories(ss);
    } catch (e) {
      console.error('Failed to fetch settings:', e);
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  const fetchModelCounts = async () => {
    try {
      const res = await axios.get('/api/products/stats/models');
      setModelCounts(res.data?.modelCounts || {});
    } catch (e) {}
  };

  // Filter models based on search term
  const filteredModels = models.filter(model => {
    if (!modelSearch.trim()) return true;
    const searchLower = modelSearch.toLowerCase();
    return (
      model.name.toLowerCase().includes(searchLower) ||
      (model.subcategory && model.subcategory.toLowerCase().includes(searchLower))
    );
  });

  useEffect(() => {
    fetchSettings();
    fetchModelCounts();
  }, []);

  const handleDeleteModel = async (modelName) => {
    const confirmed = window.confirm(`Delete model "${modelName}"? This will not delete existing inventory items.`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await axios.get('/api/settings');
      const existing = Array.isArray(res.data?.smartphone_models) ? res.data.smartphone_models : [];
      const updatedModels = existing.filter(m => m.name !== modelName);
      await axios.put('/api/settings', { ...res.data, smartphone_models: updatedModels });
      toast.success('Model deleted');
      await Promise.all([fetchSettings(), fetchModelCounts()]);
    } catch (e) {
      console.error('Failed to delete model:', e);
      toast.error('Failed to delete model');
    } finally {
      setSaving(false);
    }
  };

  const generateProductsReport = async () => {
    try {
      // Get all models from settings
      const settingsRes = await axios.get('/api/settings');
      const allModels = Array.isArray(settingsRes.data?.smartphone_models) ? settingsRes.data.smartphone_models : [];

      // Get all products to calculate model statistics
      const params = new URLSearchParams({ limit: 1000, page: 1 });
      const response = await axios.get(`/api/products?${params.toString()}`);
      const allProducts = Array.isArray(response.data?.products) ? response.data.products : [];

      if (allModels.length === 0) {
        toast.error('No models found');
        return;
      }

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const lineHeight = 2.8;
      let y = 18;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const title = 'Products Report';
      doc.text(title, margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, margin, y);
      y += 6;
      doc.text(`Total Models: ${allModels.length}`, margin, y);
      y += 6;

      // Set smaller font for table content
      doc.setFontSize(8);

      // Table header - adjusted column widths
      const colX = {
        subcat: margin,
        model: margin + 20,
        condition: margin + 40,
        price: margin + 56,
        storages: margin + 77,
        colors: margin + 120,
        stock: margin + 180
      };

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.text('Subcategory', colX.subcat, y);
        doc.text('Model', colX.model, y);
        doc.text('Condition', colX.condition, y);
        doc.text('Price (EUR)', colX.price, y);
        doc.text('Storages', colX.storages, y);
        doc.text('Colors', colX.colors, y);
        doc.text('Stock', colX.stock, y);
        y += lineHeight + 1;
        doc.setDrawColor(150);
        doc.line(margin, y, pageWidth - margin, y);
        y += 2;
        doc.setFont('helvetica', 'normal');
      };

      drawHeader();
      y += 3; // Extra top margin before the first row

      const pageHeight = doc.internal.pageSize.getHeight();
      let totalStock = 0;
      let totalValue = 0;

      // Group products by model for statistics
      const modelStats = {};
      allProducts.forEach(product => {
        if (product.model) {
          if (!modelStats[product.model]) {
            modelStats[product.model] = {
              stock: 0,
              price: parseFloat(product.price) || 0
            };
          }
          modelStats[product.model].stock += product.stock_quantity || 0;
          // Use the first product's price for the model
          if (!modelStats[product.model].price) {
            modelStats[product.model].price = parseFloat(product.price) || 0;
          }
        }
      });

      // Display all models (including those with 0 products)
      for (const model of allModels) {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
          drawHeader();
          y += 3;
        }

        const modelName = model.name;
        const stats = modelStats[modelName] || { stock: 0, price: 0 };
        
        const subcatText = model.subcategory || 'N/A';
        const modelText = modelName;
        const conditionText = model.condition || 'N/A';
        const priceText = model.price ? `${model.price.toFixed(2)} EUR` : 'N/A';
        const storagesText = (model.storages || []).join(', ') || 'N/A';
        const colorsText = (model.colors || []).join(', ') || 'N/A';
        const stockText = stats.stock.toString();

        doc.text(subcatText, colX.subcat, y);
        doc.text(modelText, colX.model, y);
        doc.text(conditionText, colX.condition, y);
        doc.text(priceText, colX.price, y);
        doc.text(storagesText, colX.storages, y);
        doc.text(colorsText, colX.colors, y);
        doc.text(stockText, colX.stock, y);

        totalStock += stats.stock;
        totalValue += stats.price * stats.stock;

        // Consistent row height for all rows
        y += lineHeight;

        // Add separator line between rows (but not after the last row)
        const isLastModel = allModels.indexOf(model) === allModels.length - 1;
        if (!isLastModel && y < pageHeight - 20) {
          // Position separator line exactly in the middle between rows
          const separatorY = y - 1;
          doc.setDrawColor(200);
          doc.line(margin, separatorY, pageWidth - margin, separatorY);
          y += lineHeight;
        } else {
          // Ensure consistent row height even without separator
          y += lineHeight;
        }
      }

      // Summary
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Stock: ${totalStock} units`, margin, y);
      y += 5;
      doc.text(`Total Value: ${totalValue.toFixed(2)} EUR`, margin, y);

      // Save the PDF
      const filename = `products-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      toast.success('Products report generated successfully');

    } catch (error) {
      console.error('Error generating products report:', error);
      toast.error('Failed to generate products report');
    }
  };

  const handleAddModel = async () => {
    if (!newModel.subcategory || !newModel.subcategory.trim()) {
      toast.error('Subcategory is required');
      return;
    }
    if (!newModel.name.trim()) {
      toast.error('Model name is required');
      return;
    }
    if (!newModel.condition || !newModel.condition.trim()) {
      toast.error('Condition is required');
      return;
    }
    if (newModel.price === undefined || Number.isNaN(Number(newModel.price))) {
      toast.error('Price is required');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.get('/api/settings');
      const existing = Array.isArray(res.data?.smartphone_models) ? res.data.smartphone_models : [];
      let updated;
      if (editingModel) {
        // update existing model by name
        updated = {
          ...res.data,
          smartphone_models: existing.map(m =>
            m.name === editingModel.name
              ? {
                  name: editingModel.name,
                  price: typeof newModel.price === 'number' ? newModel.price : undefined,
                  storages: (newModel.storages || []).filter(s => s && s.trim() !== ''),
                  colors: (newModel.colors || []).filter(c => c && c.trim() !== ''),
                  condition: (newModel.condition || '').trim() || undefined,
                  subcategory: (newModel.subcategory || '').trim() || undefined,
                  storage_prices: newModel.storage_prices || undefined
                }
              : m
          )
        };
      } else {
        if (existing.find(m => m.name === newModel.name.trim())) {
          toast.error('Model with this name already exists');
          setSaving(false);
      return;
        }
        updated = {
          ...res.data,
          smartphone_models: [
            ...existing,
            {
              name: newModel.name.trim(),
              price: typeof newModel.price === 'number' ? newModel.price : undefined,
              storages: (newModel.storages || []).filter(s => s && s.trim() !== ''),
              colors: (newModel.colors || []).filter(c => c && c.trim() !== ''),
              condition: (newModel.condition || '').trim() || undefined,
              subcategory: (newModel.subcategory || '').trim() || undefined,
              storage_prices: newModel.storage_prices || undefined
            }
          ]
        };
      }
      await axios.put('/api/settings', updated);
      toast.success(editingModel ? 'Model updated' : 'Model added');
      setShowAddModelModal(false);
      setNewModel({ name: '', price: undefined, storages: [], colors: [], condition: '' });
      setEditingModel(null);
      fetchSettings();
    } catch (e) {
      console.error('Failed to add model:', e);
      toast.error('Failed to add model');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Products</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">Manage smartphone models and their details</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {/* Search by Model Name */}
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <input
              type="text"
              placeholder="Search by model / subcategory..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              className="input"
            />
            {modelSearch && (
              <button
                onClick={() => setModelSearch('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          
          <button
            onClick={generateProductsReport}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
            title="Generate PDF report of all products"
          >
            <Download className="h-4 w-4" />
            Generate Report
          </button>
          <button className="btn-primary w-full sm:w-auto" onClick={() => { setEditingModel(null); setShowAddModelModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {/* Search Results Info */}
          {modelSearch && (
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700">
                  Found {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} matching "{modelSearch}"
                </span>
                <button
                  onClick={() => setModelSearch('')}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Clear search
                </button>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subcategory</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Price (EUR)</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Storages</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colors</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-2 sm:px-4 lg:px-6 py-3" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredModels.map((m) => (
                  <tr 
                    key={m.name} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={async () => {
                      try {
                        const res = await axios.get('/api/products/stats/model-details', { params: { model: m.name } });
                        setStockDetails(res.data);
                        setShowStockModal(true);
                      } catch (e) {
                        toast.error('Failed to load stock details');
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        try {
                          const res = await axios.get('/api/products/stats/model-details', { params: { model: m.name } });
                          setStockDetails(res.data);
                          setShowStockModal(true);
                        } catch (err) {
                          toast.error('Failed to load stock details');
                        }
                      }
                    }}
                  >
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{m.subcategory || '-'}</td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-primary-700">{m.name}</td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{typeof m.price === 'number' ? m.price : '-'}</td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{m.condition ? m.condition : '-'}</td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {(m.storages || []).map((s) => (
                          <span key={String(s)} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {(m.colors || []).map((c) => (
                          <span key={c} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{modelCounts[m.name] ?? 0}</td>
                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="btn-secondary text-xs mr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingModel(m);
                            setNewModel({
                              name: m.name,
                              price: m.price,
                              storages: [...(m.storages || [])],
                              colors: [...(m.colors || [])],
                              condition: m.condition || '',
                              subcategory: m.subcategory || '',
                              storage_prices: m.storage_prices || {}
                            });
                            setShowAddModelModal(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger p-2"
                          title="Delete model"
                          aria-label="Delete model"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteModel(m.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {models.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-center text-sm text-gray-500">No models found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModelModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0 px-4">
          <div className="relative top-10 mx-auto p-6 border w-full max-w-xl shadow-lg rounded-md bg-white mb-14">
              <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">{editingModel ? 'Edit Model' : 'Add Smartphone Model'}</h3>
              <button onClick={() => setShowAddModelModal(false)} className="btn-secondary text-sm">Close</button>
              </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                        <select
                          className="input w-full"
                          required
                          value={newModel.subcategory || ''}
                          onChange={(e) => setNewModel({ ...newModel, subcategory: e.target.value })}
                        >
                          <option value="">Select subcategory</option>
                          {smartphoneSubcategories.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                      <input
                        type="text"
                          className="input w-full"
                        required
                          value={newModel.name}
                          onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                          placeholder="e.g., iPhone 14 Pro"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                      <input
                        type="text"
                          className="input w-full"
                          required
                          value={newModel.condition || ''}
                          onChange={(e) => setNewModel({ ...newModel, condition: e.target.value })}
                          placeholder="e.g., New, Used"
                      />
                    </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (EUR)</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                        <input
                          type="number"
                            className="input w-full pl-6"
                            required
                            value={newModel.price ?? ''}
                            onChange={(e) => setNewModel({ ...newModel, price: e.target.value === '' ? undefined : Number(e.target.value) })}
                            placeholder="e.g., 999"
                          />
                        </div>
                      </div>
                  </div>

                    <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Storages</label>
                <div className="flex flex-col gap-2">
                  {(newModel.storages || []).map((s, i) => (
                    <div key={`nm-s-${i}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input w-28"
                        value={s}
                        onChange={(e) => {
                          const list = [...(newModel.storages || [])];
                          list[i] = e.target.value;
                          setNewModel({ ...newModel, storages: list });
                        }}
                        placeholder="e.g., 128GB"
                      />
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                        <input
                          type="number"
                          className="input w-28 pl-6"
                          value={newModel.storage_prices?.[String(s)] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? undefined : Number(e.target.value);
                            setNewModel(prev => ({
                              ...prev,
                              storage_prices: { ...(prev.storage_prices || {}), [String(s)]: v }
                            }));
                          }}
                          placeholder="Price"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary bg-blue-500/80 hover:bg-blue-600/80 text-white max-w-fit"
                    onClick={() => setNewModel({ ...newModel, storages: [...(newModel.storages || []), ''] })}
                  >
                    Add Storage
                  </button>
                </div>
                    </div>
                      <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colors</label>
                <div className="flex flex-wrap gap-2">
                  {(newModel.colors || []).map((c, i) => (
                        <input
                      key={`nm-c-${i}`}
                          type="text"
                      className="input w-28"
                      value={c}
                      onChange={(e) => {
                        const list = [...(newModel.colors || [])];
                        list[i] = e.target.value;
                        setNewModel({ ...newModel, colors: list });
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="btn-secondary bg-purple-500/80 hover:bg-purple-600/80 text-white"
                    onClick={() => setNewModel({ ...newModel, colors: [...(newModel.colors || []), ''] })}
                  >
                    Add Color
                  </button>
                </div>
              </div>
              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={handleAddModel} disabled={saving}>
                    {saving ? 'Saving...' : (editingModel ? 'Update Model' : 'Save Model')}
                  </button>
                  <button type="button" className="btn-secondary flex-1" onClick={() => setShowAddModelModal(false)}>Cancel</button>
                </div>
                {editingModel && (
                  <div className="text-xs text-gray-500">You can edit storages and colors directly by adding rows below.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showStockModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0 px-4">
          <div className="relative top-10 mx-auto p-6 border w-full max-w-xl shadow-lg rounded-md bg-white mb-14">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Stock for {stockDetails.model}</h3>
              <button onClick={() => setShowStockModal(false)} className="btn-secondary text-sm">Close</button>
            </div>
            <div className="space-y-2">
              {stockDetails.items.length === 0 && (
                <div className="text-sm text-gray-500">No stock details available.</div>
              )}
              {stockDetails.items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm border rounded p-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{it.storage_gb ?? '-'}</span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">{it.color ?? '-'}</span>
                  </div>
                  <div className="font-medium">{it.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;


