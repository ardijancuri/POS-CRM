import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Scan,
  Download,
  Calendar
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import Quagga from 'quagga';

const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [descriptionSearch, setDescriptionSearch] = useState('');
  const [imeiSearch, setImeiSearch] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [colorSearch, setColorSearch] = useState('');
  const [storageSearch, setStorageSearch] = useState('');
  const [priceSearch, setPriceSearch] = useState('');
  const [conditionSearch, setConditionSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [createdDateSearch, setCreatedDateSearch] = useState('');
  const [activeTab, setActiveTab] = useState('smartphones');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 10;
  const [filteredCount, setFilteredCount] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [lockFields, setLockFields] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const scannerRef = useRef(null);
  const scanHandledRef = useRef(false);
  const modelDropdownRef = useRef(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [createdImeis, setCreatedImeis] = useState([]);
  const [editingImei, setEditingImei] = useState(null);
  const [editingImeiValue, setEditingImeiValue] = useState('');

  // Removed display-to-ISO conversion; relying on native date input localization

  // Settings-driven subcategories
  const [smartphoneSubcategories, setSmartphoneSubcategories] = useState(['iPhone', 'Samsung', 'Xiaomi']);
  const [accessorySubcategories, setAccessorySubcategories] = useState(['telephone', 'smart_watch', 'headphones', 'tablet']);
  const [smartphoneModels, setSmartphoneModels] = useState([]);


  // Barcode generation
  const generateBarcode = () => {
    // Generate a random 15-character alphanumeric string
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 15; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Generate unique barcode that doesn't exist in current products
  const generateUniqueBarcode = () => {
    let barcode;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      barcode = generateBarcode();
      attempts++;
      // Check if barcode already exists in current products list
      const exists = products.some(product => product.barcode === barcode);
      if (!exists || attempts >= maxAttempts) {
        break;
      }
    } while (true);

    return barcode;
  };

  const [formData, setFormData] = useState({
    name: '',
    imei: '',
    description: '',
    price: '',
    stock_status: 'enabled',
    stock_quantity: '',
    barcode: '', // Will be set in useEffect
    category: 'smartphones',
    subcategory: '',
    color: '',
    storage_gb: ''
  });

  useEffect(() => {
    fetchProducts();
  }, [currentPage, searchTerm, barcodeSearch, descriptionSearch, imeiSearch, activeTab, subcategoryFilter, colorSearch, storageSearch, priceSearch, stockSearch, conditionSearch, createdDateSearch, dateFrom, dateTo]);

  // Fetch subcategories from settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings');
        const ss = Array.isArray(res.data?.smartphone_subcategories) ? res.data.smartphone_subcategories : ['iPhone', 'Samsung', 'Xiaomi'];
        const as = Array.isArray(res.data?.accessory_subcategories) ? res.data.accessory_subcategories : ['telephone', 'smart_watch', 'headphones', 'tablet'];
        const sm = Array.isArray(res.data?.smartphone_models) ? res.data.smartphone_models : [];
        setSmartphoneSubcategories(ss);
        setAccessorySubcategories(as);
        setSmartphoneModels(sm);
      } catch (e) {
        // ignore; keep defaults
      }
    };
    fetchSettings();
  }, []);

  // Handle ESC key for modals
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        if (showModal) {
          setShowModal(false);
        }
        if (showScannerModal) {
          setShowScannerModal(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showModal, showScannerModal]);

  // Set initial barcode when component mounts
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      barcode: generateUniqueBarcode()
    }));
  }, []); // Empty dependency array to run only once

  // Enforce stock quantity = 1 for smartphones in UI
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      stock_quantity: prev.category === 'smartphones' ? '1' : prev.stock_quantity
    }));
  }, [/* category watcher */ formData.category]);

  // When model changes, reset storage and color only for new items (keep values when editing)
  useEffect(() => {
    const selected = smartphoneModels.find(m => m.name === formData.model);
    setFormData(prev => ({
      ...prev,
      storage_gb: editingProduct ? prev.storage_gb : '',
      color: editingProduct ? prev.color : '',
      price: selected && typeof selected.price === 'number' ? String(selected.price) : prev.price
    }));
  }, [formData.model]);

  // When storage changes and model has per-storage prices, apply it
  useEffect(() => {
    if (!formData.model || !formData.storage_gb) return;
    const selected = smartphoneModels.find(m => m.name === formData.model);
    const storagePrices = selected && selected.storage_prices && typeof selected.storage_prices === 'object' ? selected.storage_prices : null;
    if (storagePrices) {
      const key = String(formData.storage_gb);
      const v = storagePrices[key];
      if (typeof v === 'number' && !Number.isNaN(v)) {
        setFormData(prev => ({ ...prev, price: String(v) }));
      }
    }
  }, [formData.storage_gb, formData.model, smartphoneModels]);

  const fetchProducts = async () => {
    try {
      const hasClientFilters = Boolean(
        (conditionSearch && conditionSearch.trim()) || createdDateSearch || dateFrom || dateTo || (barcodeSearch && barcodeSearch.trim())
      );

      const params = new URLSearchParams({
        page: hasClientFilters ? 1 : currentPage,
        limit: hasClientFilters ? 1000 : PAGE_SIZE
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (barcodeSearch) {
        params.append('barcode', barcodeSearch);
      }

      if (descriptionSearch) {
        params.append('description', descriptionSearch);
      }

      if (imeiSearch) {
        params.append('imei', imeiSearch);
      }

      if (activeTab && activeTab !== 'all') {
        params.append('category', activeTab);
      }

      if (subcategoryFilter) {
        params.append('subcategory', subcategoryFilter);
      }

      if (colorSearch) {
        params.append('color', colorSearch);
      }

      if (storageSearch) {
        params.append('storage', storageSearch);
      }

      if (priceSearch) {
        params.append('price', priceSearch);
      }

      if (stockSearch) {
        params.append('stockQuantity', stockSearch);
      }

      // Client-side condition filtering after fetch (model metadata not in products API)

      const response = await axios.get(`/api/products?${params}`);
      let fetched = response.data.products;
      if (conditionSearch.trim()) {
        const q = conditionSearch.trim().toLowerCase();
        fetched = fetched.filter(p => {
          if (p.category !== 'smartphones') return false;
          const m = smartphoneModels.find(x => x.name === p.model);
          return m && String(m.condition || '').toLowerCase().includes(q);
        });
      }
      if (createdDateSearch) {
        fetched = fetched.filter(p => {
          if (!p.created_at) return false;
          const ymd = new Date(p.created_at).toISOString().split('T')[0];
          return ymd === createdDateSearch;
        });
      }
      if (barcodeSearch && barcodeSearch.trim()) {
        const q = barcodeSearch.trim().toLowerCase();
        fetched = fetched.filter(p => String(p.barcode || '').toLowerCase().includes(q));
      }
      if (dateFrom || dateTo) {
        fetched = fetched.filter(p => {
          if (!p.created_at) return true;
          const ymd = new Date(p.created_at).toISOString().split('T')[0];
          if (dateFrom && dateTo) return ymd >= dateFrom && ymd <= dateTo;
          if (dateFrom) return ymd >= dateFrom;
          if (dateTo) return ymd <= dateTo;
          return true;
        });
      }
      if (hasClientFilters) {
        const total = fetched.length;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        setFilteredCount(total);
        const safePage = Math.min(currentPage, pages);
        const start = (safePage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        setProducts(fetched.slice(start, end));
        setTotalPages(pages);
        if (safePage !== currentPage) {
          setCurrentPage(safePage);
        }
      } else {
        setProducts(fetched);
        const apiTotal = response.data?.pagination?.totalItems;
        setFilteredCount(typeof apiTotal === 'number' ? apiTotal : fetched.length);
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Build name automatically for smartphones (include subcategory)
    const autoSmartphoneName = [
      formData.subcategory || '',
      formData.model || '',
      formData.storage_gb || '',
      formData.color || ''
    ].filter(Boolean).join(' ').trim();

    const computedName = formData.category === 'smartphones'
      ? (autoSmartphoneName || 'Smartphone')
      : formData.name;

    // Convert string values to numbers for validation and handle empty image
    const submitData = {
      ...formData,
      name: computedName,
      price: parseInt(formData.price) || 0,
      stock_quantity: formData.category === 'smartphones' ? 1 : (parseInt(formData.stock_quantity) || 0),
      subcategory: formData.subcategory || '' // Keep empty string, don't convert to null
    };

    console.log('Submitting data:', submitData);

    try {
      if (editingProduct) {
        await axios.put(`/api/products/${editingProduct.id}`, submitData);
        toast.success('Product updated successfully');
        setShowModal(false);
        setEditingProduct(null);
        resetForm();
      } else {
        await axios.post('/api/products', submitData);
        toast.success('Product created successfully');
        // Track created IMEIs when locking fields for smartphones
        if (lockFields && formData.category === 'smartphones' && (formData.imei || '').trim()) {
          setCreatedImeis(prev => [String(formData.imei).trim(), ...prev]);
        }
        if (lockFields) {
          // Keep modal open and preserve current form values (but reset IMEI and barcode)
          setEditingProduct(null);
          setFormData(prev => ({
            ...prev,
            barcode: generateUniqueBarcode(),
            imei: ''
          }));
        } else {
          setShowModal(false);
          setEditingProduct(null);
          resetForm();
          setCreatedImeis([]);
        }
      }

      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);

      // Show detailed validation errors if available
      if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map(err => err.msg).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error(error.response?.data?.message || 'Failed to save product');
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      imei: product.imei || '',
      description: product.description || '',
      price: product.price,
      stock_status: product.stock_status,
      stock_quantity: product.stock_quantity,
      barcode: product.barcode || generateUniqueBarcode(), // Preserve existing barcode or generate new one if missing
      category: product.category || 'smartphones',
      model: product.model || '',
      subcategory: product.subcategory || '',
      color: product.color || '',
      storage_gb: product.storage_gb || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }

    try {
      await axios.delete(`/api/products/${productId}`);
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error(error.response?.data?.message || 'Failed to delete product');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      imei: '',
      description: '',
      price: '',
      stock_status: 'enabled',
      stock_quantity: '1',
      barcode: generateUniqueBarcode(), // Generate new barcode instead of empty string
      category: 'smartphones',
      model: '',
      subcategory: '',
      color: '',
      storage_gb: ''
    });
    setEditingProduct(null);
    setEditingImei(null);
    setEditingImeiValue('');
  };

  // Generate a Code128 barcode image (PNG data URL) for a given value
  const generateBarcodeImage = (value) => {
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, value || '', {
        format: 'CODE128',
        displayValue: true,
        font: 'monospace',
        fontSize: 20,
        textMargin: 8,
        width: 2,
        height: 60,
        margin: 10
      });
      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height
      };
    } catch (err) {
      console.error('Failed to generate barcode image:', err);
      toast.error('Failed to generate barcode image');
      return null;
    }
  };

  // Create and download a PDF with barcode and product info
  const handleDownloadBarcode = (product) => {
    try {
      const targetProduct = product || editingProduct || formData;
      const barcodeValue = targetProduct.barcode || '';

      const image = generateBarcodeImage(barcodeValue);
      if (!image) return;

      // Target label size: 3.15 × 1.4 inches (≈ 80.01mm × 35.56mm) in landscape
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [80.01, 35.56] });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const marginX = 4; // mm
      const marginY = 3; // mm
      const maxWidth = Math.max(10, pageWidth - marginX * 2);

      const aspectRatio = image.height > 0 ? image.width / image.height : 1;
      let displayWidth = maxWidth;
      let displayHeight = displayWidth / aspectRatio;
      const maxImageHeight = pageHeight * 0.5; // keep some room for text
      if (displayHeight > maxImageHeight) {
        displayHeight = maxImageHeight;
        displayWidth = displayHeight * aspectRatio;
      }

      const line1 = `${targetProduct.name || ''}${targetProduct.imei ? ' - ' + targetProduct.imei : ''}`.trim();
      const hasColor = !!targetProduct.color;
      const hasGb = !!targetProduct.storage_gb;
      const gbText = hasGb ? `${targetProduct.storage_gb}` : '';
      const line2 = `${hasColor ? targetProduct.color : ''}${hasColor && hasGb ? ' - ' : ''}${hasGb ? gbText : ''}`.trim();

      // Layout metrics
      const lineSpacing = 4; // mm per text line
      const gapTopToBarcode = 4; // space between top text and barcode
      const gapBarcodeToDetails = 6; // extra space between barcode and details (requested)

      const topTextHeight = line1 ? lineSpacing : 0;
      const bottomTextHeight = line2 ? lineSpacing : 0;

      const totalContentHeight = topTextHeight + (line1 ? gapTopToBarcode : 0) + displayHeight + (line2 ? gapBarcodeToDetails + bottomTextHeight : 0);
      let cursorY = Math.max(marginY, (pageHeight - totalContentHeight) / 2);

      // Draw top text (product name + IMEI)
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      if (line1) {
        cursorY += lineSpacing;
        doc.text(line1, pageWidth / 2, cursorY, { align: 'center' });
      }

      // Gap before barcode
      if (line1) cursorY += gapTopToBarcode;

      // Barcode image (centered)
      const x = (pageWidth - displayWidth) / 2;
      doc.addImage(image.dataUrl, 'PNG', x, cursorY, displayWidth, displayHeight);
      cursorY += displayHeight;

      // Bottom details under barcode with extra gap
      if (line2) {
        cursorY += gapBarcodeToDetails + lineSpacing;
        doc.text(line2, pageWidth / 2, cursorY, { align: 'center' });
      }

      const filenameSafe = (targetProduct.name || 'product')
        .toString()
        .replace(/[^a-z0-9\-_. ]/gi, '_')
        .slice(0, 60);
      const fileName = `${filenameSafe || 'product'}_${barcodeValue || 'barcode'}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Failed to create PDF:', error);
      toast.error('Failed to create PDF');
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    resetForm();
    // Generate a unique barcode for new products
    setFormData(prev => ({
      ...prev,
      barcode: generateUniqueBarcode()
    }));
    setShowModal(true);
  };

  const closeScanner = () => {
    setShowScannerModal(false);
  };

  const stopQuagga = () => {
    try {
      Quagga.offDetected(handleDetected);
    } catch (e) { }
    try {
      if (Quagga.stop) Quagga.stop();
    } catch (e) { }
  };

  const handleDetected = async (result) => {
    if (!result || !result.codeResult || !result.codeResult.code) return;
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;

    const code = (result.codeResult.code || '').trim();
    if (!code) {
      scanHandledRef.current = false;
      return;
    }

    try {
      const response = await axios.get(`/api/products/barcode/${encodeURIComponent(code)}`);
      const product = response.data;
      toast.success('Barcode found');
      stopQuagga();
      setShowScannerModal(false);
      handleEdit(product);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        toast.error('Barcode does not exist');
      } else {
        toast.error('Failed searching barcode');
        console.error('Barcode search failed:', error);
      }
      // Allow scanning again after a brief delay
      setTimeout(() => {
        scanHandledRef.current = false;
      }, 800);
    }
  };

  const editByImei = (imei) => {
    setEditingImei(imei);
    setEditingImeiValue(imei);
  };

  const saveImeiEdit = async (oldImei, newImei) => {
    try {
      if (!newImei.trim()) {
        toast.error('IMEI cannot be empty');
        return;
      }

      // Check if new IMEI already exists
      const params = new URLSearchParams({ limit: 1, page: 1 });
      params.set('imei', newImei.trim());
      const res = await axios.get(`/api/products?${params.toString()}`);
      const existingProducts = Array.isArray(res.data?.products) ? res.data.products : [];
      
      if (existingProducts.length > 0 && existingProducts[0].imei !== oldImei) {
        toast.error('IMEI already exists');
        return;
      }

      // Update the product with new IMEI
      const productToUpdate = products.find(p => p.imei === oldImei);
      if (!productToUpdate) {
        toast.error('Product not found');
        return;
      }

      await axios.put(`/api/products/${productToUpdate.id}`, {
        imei: newImei.trim()
      });

      // Update local state
      setProducts(prev => prev.map(p => 
        p.id === productToUpdate.id ? { ...p, imei: newImei.trim() } : p
      ));

      // Update createdImeis list
      setCreatedImeis(prev => prev.map(imei => 
        imei === oldImei ? newImei.trim() : imei
      ));

      setEditingImei(null);
      setEditingImeiValue('');
      toast.success('IMEI updated successfully');
    } catch (error) {
      console.error('Failed to update IMEI:', error);
      
      // Show more detailed error information
      if (error.response?.data?.message) {
        toast.error(`Failed to update IMEI: ${error.response.data.message}`);
      } else if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map(err => err.msg).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error('Failed to update IMEI');
      }
    }
  };

  const cancelImeiEdit = () => {
    setEditingImei(null);
    setEditingImeiValue('');
  };

  const handleImeiKeyPress = (e, oldImei, newImei) => {
    if (e.key === 'Enter') {
      saveImeiEdit(oldImei, newImei);
    } else if (e.key === 'Escape') {
      cancelImeiEdit();
    }
  };

  useEffect(() => {
    if (!showScannerModal) {
      stopQuagga();
      return;
    }

    scanHandledRef.current = false;
    const target = scannerRef.current;
    if (!target) return;

    Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target,
        constraints: {
          facingMode: 'environment'
        }
      },
      decoder: {
        readers: [
          'code_128_reader',
          'ean_reader',
          'ean_8_reader',
          'code_39_reader'
        ]
      },
      locate: true
    }, (err) => {
      if (err) {
        console.error('Quagga init error:', err);
        toast.error('Failed to start camera');
        setShowScannerModal(false);
        return;
      }
      Quagga.start();
      Quagga.onDetected(handleDetected);
    });

    return () => {
      stopQuagga();
    };
  }, [showScannerModal]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1); // Reset to first page when changing tabs

    // Reset subcategory filter when changing tabs
    setSubcategoryFilter('');
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      // Removed Quagga cleanup
    };
  }, []);

  // Close custom model dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const generateInventoryReport = async () => {
    try {
      const params = new URLSearchParams({ limit: 1000, page: 1 });
      if (activeTab && activeTab !== 'all') {
        params.set('category', activeTab);
      }
      const response = await axios.get(`/api/products?${params.toString()}`);
      let allProducts = Array.isArray(response.data?.products) ? response.data.products : [];

      // Optional date filtering by created_at (YYYY-MM-DD)
      if (dateFrom || dateTo) {
        allProducts = allProducts.filter(p => {
          if (!p.created_at) return true;
          const dt = new Date(p.created_at);
          const ymd = dt.toISOString().split('T')[0];
          if (dateFrom && dateTo) return ymd >= dateFrom && ymd <= dateTo;
          if (dateFrom) return ymd >= dateFrom;
          if (dateTo) return ymd <= dateTo;
          return true;
        });
      }

      if (allProducts.length === 0) {
        toast.error('No inventory items found for the selected range');
        return;
      }

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const lineHeight = 4.2;
      let y = 18;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      let title = 'Inventory Report';
      if (dateFrom && dateTo) title += ` (${new Date(dateFrom).toLocaleDateString('en-GB')} to ${new Date(dateTo).toLocaleDateString('en-GB')})`;
      else if (dateFrom) title += ` (From ${new Date(dateFrom).toLocaleDateString('en-GB')})`;
      else if (dateTo) title += ` (Until ${new Date(dateTo).toLocaleDateString('en-GB')})`;
      doc.text(title, margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, margin, y);
      y += 6;
      doc.text(`Items: ${allProducts.length}`, margin, y);
      y += 6;

      // Table header (Subcategory before Model)
      const colX = {
        category: margin,
        subcat: margin + 24,
        model: margin + 70,
        color: margin + 110,
        storage: margin + 135,
        price: margin + 160,
        stock: margin + 180
      };

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.text('Category', colX.category, y);
        doc.text('Subcat', colX.subcat, y);
        doc.text('Model/Name', colX.model, y);
        doc.text('Color', colX.color, y);
        doc.text('Storage', colX.storage, y);
        doc.text('Price', colX.price, y);
        doc.text('Stock', colX.stock, y);
        y += lineHeight + 1;
        doc.setDrawColor(150);
        doc.line(margin, y, pageWidth - margin, y);
        y += 2;
        doc.setFont('helvetica', 'normal');
      };

      drawHeader();
      // Extra top margin before the first row
      y += 3;

      const pageHeight = doc.internal.pageSize.getHeight();
      let stockEurTotal = 0;
      let stockMkdTotal = 0;
      for (const p of allProducts) {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
          drawHeader();
          y += 3; // margin before first row on new page
        }
        const categoryText = p.category === 'smartphones' ? 'Smartphone' : (p.category || '-');
        const subcatText = p.subcategory || '-';
        const modelText = p.category === 'smartphones' ? (p.model || p.name || '-') : (p.name || '-');
        const colorText = p.color || '-';
        const storageText = p.storage_gb ? String(p.storage_gb) : '-';
        const n = parseFloat(p.price);
        const currency = p.category === 'smartphones' ? 'EUR' : 'MKD';
        const priceText = Number.isFinite(n) ? `${n.toFixed(0)} ${currency}` : '-';
        const stockText = (p.stock_quantity ?? '').toString();

        doc.text(categoryText, colX.category, y);
        doc.text(String(subcatText).slice(0, 12), colX.subcat, y);
        doc.text(String(modelText).slice(0, 20), colX.model, y);
        doc.text(String(colorText).slice(0, 10), colX.color, y);
        doc.text(String(storageText).slice(0, 10), colX.storage, y);
        doc.text(priceText, colX.price, y);
        doc.text(stockText, colX.stock, y);

        // Separator line between rows
        doc.setDrawColor(220);
        doc.line(margin, y + 1.2, pageWidth - margin, y + 1.2);

        y += lineHeight + 1.5;

        // Accumulate stock totals
        if (Number.isFinite(n)) {
          const qty = parseFloat(p.stock_quantity) || 0;
          const lineTotal = n * qty;
          if (p.category === 'smartphones') stockEurTotal += lineTotal; else stockMkdTotal += lineTotal;
        }
      }



      // Add spacing before totals section
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 20;
      }
      y += 6;



      doc.setFont('helvetica', 'bold');
      doc.text('Totals - Stock (Inventory)', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Stock EUR: ${stockEurTotal.toFixed(0)} EUR`, margin, y);
      y += 5;
      doc.text(`Total Stock MKD: ${stockMkdTotal.toFixed(0)} MKD`, margin, y);

      const fileName = `inventory-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Inventory report generated');
    } catch (err) {
      console.error('Error generating inventory report:', err);
      toast.error('Failed to generate inventory report');
    }
  };

  const generateBarcodesReport = async () => {
    try {
      const params = new URLSearchParams({ limit: 1000, page: 1 });
      if (activeTab && activeTab !== 'all') {
        params.set('category', activeTab);
      }
      const response = await axios.get(`/api/products?${params.toString()}`);
      let allProducts = Array.isArray(response.data?.products) ? response.data.products : [];

      // Optional date filtering by created_at (YYYY-MM-DD)
      if (dateFrom || dateTo) {
        allProducts = allProducts.filter(p => {
          if (!p.created_at) return true;
          const dt = new Date(p.created_at);
          const ymd = dt.toISOString().split('T')[0];
          if (dateFrom && dateTo) return ymd >= dateFrom && ymd <= dateTo;
          if (dateFrom) return ymd >= dateFrom;
          if (dateTo) return ymd <= dateTo;
          return true;
        });
      }

      if (allProducts.length === 0) {
        toast.error('No products found for the selected range');
        return;
      }

      // Create doc with desired label size (3.15 x 1.4 in) landscape
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [80.01, 35.56] });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 4;
      const marginY = 3;

      allProducts.forEach((p, idx) => {
        if (idx > 0) doc.addPage();

        const barcodeValue = p.barcode || '';
        const image = generateBarcodeImage(barcodeValue);
        if (!image) return;

        const aspectRatio = image.height > 0 ? image.width / image.height : 1;
        const maxWidth = Math.max(10, pageWidth - marginX * 2);
        let displayWidth = maxWidth;
        let displayHeight = displayWidth / aspectRatio;
        const maxImageHeight = pageHeight * 0.5;
        if (displayHeight > maxImageHeight) {
          displayHeight = maxImageHeight;
          displayWidth = displayHeight * aspectRatio;
        }

        const line1 = `${p.name || ''}${p.imei ? ' - ' + p.imei : ''}`.trim();
        const hasColor = !!p.color;
        const hasGb = !!p.storage_gb;
        const gbText = hasGb ? `${p.storage_gb}` : '';
        const line2 = `${hasColor ? p.color : ''}${hasColor && hasGb ? ' - ' : ''}${hasGb ? gbText : ''}`.trim();

        const lineSpacing = 4;
        const gapTopToBarcode = 4;
        const gapBarcodeToDetails = 6;

        const topTextHeight = line1 ? lineSpacing : 0;
        const bottomTextHeight = line2 ? lineSpacing : 0;
        const totalContentHeight = topTextHeight + (line1 ? gapTopToBarcode : 0) + displayHeight + (line2 ? gapBarcodeToDetails + bottomTextHeight : 0);
        let cursorY = Math.max(marginY, (pageHeight - totalContentHeight) / 2);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (line1) {
          cursorY += lineSpacing;
          doc.text(line1, pageWidth / 2, cursorY, { align: 'center' });
        }
        if (line1) cursorY += gapTopToBarcode;

        const x = (pageWidth - displayWidth) / 2;
        doc.addImage(image.dataUrl, 'PNG', x, cursorY, displayWidth, displayHeight);
        cursorY += displayHeight;

        if (line2) {
          cursorY += gapBarcodeToDetails + lineSpacing;
          doc.text(line2, pageWidth / 2, cursorY, { align: 'center' });
        }
      });

      const fileName = `barcodes-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Barcode PDF generated');
    } catch (err) {
      console.error('Error generating barcodes PDF:', err);
      toast.error('Failed to generate barcodes PDF');
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Manage your inventory
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              value={barcodeSearch}
              onChange={(e) => { setBarcodeSearch(e.target.value); setCurrentPage(1); }}
              className="input text-sm pr-10 w-full"
              placeholder="Search by barcode..."
            />
            <button
              type="button"
              onClick={() => setShowScannerModal(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              title="Scan barcode to search"
            >
              <Scan className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="btn-primary flex-1 sm:flex-none text-sm py-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Inventory
          </button>

        </div>
      </div>

      {/* Category Tabs + Report Controls */}
      <div className="border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-1">
        <nav className="flex space-x-8">
          <button
            onClick={() => handleTabChange('smartphones')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'smartphones'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Smart Phones
          </button>
          <button
            onClick={() => handleTabChange('accessories')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'accessories'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Accessories
          </button>
          <button
            onClick={() => handleTabChange('all')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'all'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            All Products
          </button>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              lang="en-GB"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input text-sm w-36"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              lang="en-GB"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input text-sm w-36"
            />
          </div>
          <button
            onClick={async () => { await generateInventoryReport(); }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
            title="Generate PDF report of inventory in selected date range"
          >
            <Download className="h-4 w-4" />
            Generate Report
          </button>
          <button
            onClick={async () => { await generateBarcodesReport(); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
            title="Generate barcodes PDF (one per page) for selected date range"
          >
            <Download className="h-4 w-4" />
            Barcode
          </button>
        </div>
        </div>
      </div>

      

      {/* Products Table */}
      <div className="card">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subcategory
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Condition
                  </th>
                  {activeTab !== 'smartphones' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IMEI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  {activeTab === 'smartphones' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Search Row */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <td className="px-2 py-3">
                    <div className="w-full px-2 py-2 text-sm bg-gray-100 border border-gray-300 rounded-md text-gray-700">
                      {activeTab === 'smartphones' ? 'Smartphones' : 
                       activeTab === 'accessories' ? 'Accessories' : 
                       'All Categories'}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      placeholder="Subcategory..."
                      value={subcategoryFilter}
                      onChange={(e) => setSubcategoryFilter(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      placeholder="Model..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      placeholder="Condition..."
                      value={conditionSearch}
                      onChange={(e) => setConditionSearch(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  {activeTab !== 'smartphones' && (
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        placeholder="Description..."
                        value={descriptionSearch}
                        onChange={(e) => setDescriptionSearch(e.target.value)}
                        className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      placeholder="IMEI..."
                      value={imeiSearch}
                      onChange={(e) => setImeiSearch(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="Color..."
                        value={colorSearch}
                        onChange={(e) => setColorSearch(e.target.value)}
                        className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <input
                        type="text"
                        placeholder="Storage..."
                        value={storageSearch}
                        onChange={(e) => setStorageSearch(e.target.value)}
                        className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      placeholder="Price..."
                      value={priceSearch}
                      onChange={(e) => setPriceSearch(e.target.value)}
                      className="w-24 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="text"
                      placeholder="Stock..."
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                  {activeTab === 'smartphones' && (
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={createdDateSearch}
                        onChange={(e) => setCreatedDateSearch(e.target.value)}
                        className="w-36 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setDescriptionSearch('');
                        setImeiSearch('');
                        setSubcategoryFilter('');
                        setColorSearch('');
                        setStorageSearch('');
                        setPriceSearch('');
                        setStockSearch('');
                        setConditionSearch('');
                        setCreatedDateSearch('');
                      }}
                      className="w-full px-2 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      Clear
                    </button>
                  </td>
                </tr>
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.category === 'smartphones'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                        }`}>
                        {product.category === 'smartphones' ? 'Smart Phone' : 'Accessory'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.subcategory ? product.subcategory.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {product.category === 'smartphones' ? (product.model || product.name) : product.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.category === 'smartphones' ? (
                        (() => {
                          const m = smartphoneModels.find(x => x.name === product.model);
                          return m && m.condition ? m.condition : '-';
                        })()
                      ) : '-'}
                    </td>
                    {activeTab !== 'smartphones' && (
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={product.description || 'No description'}>
                          {product.description || '-'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.imei || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {product.category === 'smartphones' && product.color && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {product.color}
                          </span>
                        )}
                        {product.category === 'smartphones' && product.storage_gb && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            {String(product.storage_gb)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {parseInt(product.price)} {product.category === 'smartphones' ? 'EUR' : 'MKD'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.stock_quantity}
                    </td>
                    {activeTab === 'smartphones' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.created_at ? (
                          <div className="flex flex-col leading-tight">
                            <span>{new Date(product.created_at).toLocaleDateString('en-GB')}</span>
                            <span className="text-xs text-gray-500">{new Date(product.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDownloadBarcode(product)}
                          className="btn-secondary p-2 text-xs"
                          title="Download barcode PDF"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="btn-secondary p-2 text-xs"
                          title="Edit product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="btn-danger p-2 text-xs"
                          title="Delete product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {products.length === 0 && !loading && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating new inventory.
          </p>
          <div className="mt-6">
            <button
              onClick={openCreateModal}
              className="btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Inventory
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages} · Showing {(products || []).length} of {filteredCount}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0 px-4">
          <div className="relative top-4 mx-auto p-6 border w-full max-w-4xl shadow-lg rounded-md bg-white mb-14 md:my-10">
            <div className="mt-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </h3>
                {!editingProduct && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm select-none">
                      <span className="text-gray-700">Auto</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoCreate}
                        onClick={() => setAutoCreate(!autoCreate)}
                        className={`${autoCreate ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
                      >
                        <span
                          className={`${autoCreate ? 'translate-x-5' : 'translate-x-1'} inline-block h-5 w-5 transform rounded-full bg-white transition-transform`}
                        />
                      </button>
                    </label>
                    <label className="flex items-center gap-2 text-sm select-none">
                      <span className="text-gray-700">Lock fields</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={lockFields}
                        onClick={() => setLockFields(!lockFields)}
                        className={`${lockFields ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
                      >
                        <span
                          className={`${lockFields ? 'translate-x-5' : 'translate-x-1'} inline-block h-5 w-5 transform rounded-full bg-white transition-transform`}
                        />
                      </button>
                    </label>
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="space-y-4" onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
                  const isTextarea = tag === 'textarea';
                  if (!autoCreate && !isTextarea) {
                    e.preventDefault();
                  }
                }
              }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Barcode / ID
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.barcode}
                          onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                          className="input flex-1"
                          placeholder="Scan or enter barcode"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, barcode: generateUniqueBarcode() })}
                          className="btn-secondary whitespace-nowrap"
                          title="Generate new barcode"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Barcode is automatically generated. You can manually edit it or generate a new one.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
                        className="input"
                        required
                      >
                        <option value="accessories">Accessories</option>
                        <option value="smartphones">Smart Phones</option>
                      </select>
                    </div>

                    {formData.category === 'accessories' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subcategory
                        </label>
                        <select
                          value={formData.subcategory}
                          onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                          className="input"
                        >
                          <option value="">Select subcategory</option>
                          {accessorySubcategories.map((opt) => (
                            <option key={opt} value={opt}>{opt.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {formData.category === 'smartphones' && (
                      <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subcategory
                        </label>
                        <select
                          value={formData.subcategory}
                          onChange={(e) => setFormData({ ...formData, subcategory: e.target.value, model: '' })}
                          className="input"
                        >
                          <option value="">Select subcategory</option>
                          {smartphoneSubcategories.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div ref={modelDropdownRef}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                        <div className="relative">
                          <button
                            type="button"
                            className="input w-full flex items-center justify-between"
                            onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setModelSearch(''); }}
                          >
                            <span>
                              {formData.model || 'Select model'}
                              {(() => {
                                const m = smartphoneModels.find(x => x.name === formData.model);
                                return m && m.condition ? `  ` : '';
                              })()}
                            </span>
                            <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                          </button>
                          {modelDropdownOpen && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                              <div className="p-2 bg-gray-50 border-b sticky top-0">
                                <input
                                  type="text"
                                  value={modelSearch}
                                  onChange={(e) => setModelSearch(e.target.value)}
                                  className="input text-sm w-full"
                                  placeholder="Search models..."
                                />
                              </div>
                              {smartphoneModels
                                .filter((m) => !formData.subcategory || (m.subcategory || '') === formData.subcategory)
                                .filter((m) => {
                                  const q = modelSearch.trim().toLowerCase();
                                  if (!q) return true;
                                  return m.name.toLowerCase().includes(q) || String(m.condition || '').toLowerCase().includes(q);
                                })
                                .map((m) => (
                                  <button
                                    key={m.name}
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between text-sm"
                                    onClick={() => { setFormData({ ...formData, model: m.name }); setModelDropdownOpen(false); setModelSearch(''); }}
                                  >
                                    <span className="truncate pr-2">{m.name}</span>
                                    {m.condition && (
                                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                                        {m.condition}
                                      </span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      </>
                    )}

                    {formData.category !== 'smartphones' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="input"
                          placeholder="Product name"
                        />
                      </div>
                    )}

                    {/* Storage & Color moved to right column for smartphones */}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {formData.category === 'smartphones' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Storage</label>
                          <select
                            value={formData.storage_gb}
                            onChange={(e) => setFormData({ ...formData, storage_gb: e.target.value })}
                            className="input"
                            disabled={!formData.model}
                          >
                            <option value="">Select storage</option>
                            {(smartphoneModels.find(m => m.name === formData.model)?.storages || []).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                          <select
                            value={formData.color}
                            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                            className="input"
                            disabled={!formData.model}
                          >
                            <option value="">Select color</option>
                            {(smartphoneModels.find(m => m.name === formData.model)?.colors || []).map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {formData.category !== 'smartphones' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="input"
                          rows="3"
                          placeholder="Product description"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price {formData.category === 'smartphones' ? '(EUR)' : '(MKD)'}
                      </label>
                      <input
                        type="number"
                        step="1"
                        required
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="input"
                        placeholder={formData.category === 'smartphones' ? "0" : "0"}
                        disabled={formData.category === 'smartphones' && !!formData.model}
                      />
                      {formData.category === 'smartphones' && !!formData.model && (
                        <p className="text-xs text-gray-500 mt-1">Price is set by the selected model.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock Quantity
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.category === 'smartphones' ? '1' : formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                        className="input"
                        placeholder="0"
                        disabled={formData.category === 'smartphones'}
                      />
                      {formData.category === 'smartphones' && (
                        <p className="text-xs text-gray-500 mt-1">Stock for smartphones is fixed to 1.</p>
                      )}
                    </div>

                    

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IMEI
                      </label>
                      <input
                        type="text"
                        value={formData.imei}
                        onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                        className="input"
                        placeholder="Product IMEI (optional)"
                      />
                    </div>
                  </div>

                </div>

                {/* Actions */}
                <div className="md:col-span-2 flex space-x-3 pt-2">
                  <button type="submit" className="btn-primary flex-1">
                    {editingProduct ? 'Update' : 'Create'}
                  </button>
                  <button type="button" onClick={() => { 
                    setShowModal(false); 
                    setCreatedImeis([]); 
                    setEditingImei(null);
                    setEditingImeiValue('');
                  }} className="btn-secondary flex-1">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
          {/* Floating IMEIs panel to the right of modal */}
          {lockFields && formData.category === 'smartphones' && (
            <div className="hidden lg:block fixed z-50 right-6 top-24 w-80 bg-white border rounded-md shadow-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">Created IMEIs</h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      const text = createdImeis.join('\n');
                      navigator.clipboard?.writeText(text).then(() => toast.success('IMEIs copied'));
                    }}
                    disabled={createdImeis.length === 0}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setCreatedImeis([])}
                    disabled={createdImeis.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {createdImeis.length === 0 ? (
                <p className="text-xs text-gray-500">New IMEIs will appear here after you create items.</p>
              ) : (
                <ul className="text-sm text-gray-800 space-y-1 max-h-[60vh] overflow-auto">
                  {createdImeis.map((imei, idx) => (
                    <li key={`${imei}-${idx}`} className="flex items-center justify-between gap-2 bg-gray-50 border rounded px-2 py-1">
                      {editingImei === imei ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            type="text"
                            value={editingImeiValue}
                            onChange={(e) => setEditingImeiValue(e.target.value)}
                            onKeyDown={(e) => handleImeiKeyPress(e, imei, editingImeiValue)}
                            className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
                            placeholder="Enter new IMEI"
                            autoFocus
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded border-0"
                              onClick={() => saveImeiEdit(imei, editingImeiValue)}
                              title="Save IMEI"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs px-2 py-1 rounded border-0"
                              onClick={cancelImeiEdit}
                              title="Cancel edit"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="font-mono break-all flex-1 min-w-0">{imei}</span>
                          <button
                            type="button"
                            className="btn-secondary text-xs flex-shrink-0"
                            onClick={() => editByImei(imei)}
                            title="Edit IMEI"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}


      {/* Camera Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0 px-4">
          <div className="relative top-10 mx-auto p-4 border w-full max-w-2xl shadow-lg rounded-md bg-white mb-14">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-gray-900">Scan Barcode</h3>
              <button onClick={closeScanner} className="btn-secondary text-sm">Close</button>
            </div>
            <div className="aspect-video bg-black rounded overflow-hidden">
              <div ref={scannerRef} className="w-full h-full" />
            </div>
            <p className="mt-2 text-xs text-gray-500">Point your camera at the barcode. Supported: Code 128, EAN, EAN-8, Code 39.</p>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {/* Removed Barcode Scanner Modal */}
    </div>
  );
};

export default Inventory;


