import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Search, 
  ShoppingCart,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Scan,
  Download,
  Calendar,
  Share2,
  Edit
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [guestInfo, setGuestInfo] = useState({ name: '', email: '', phone: '' });
  const [orderType, setOrderType] = useState('client'); // 'client' or 'guest'
  const [selectedItems, setSelectedItems] = useState([]);
  const [orderStatus, setOrderStatus] = useState('pending'); // 'completed' or 'pending'
  const [productSearch, setProductSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showScannerModal, setShowScannerModal] = useState(false);
  const scannerRef = useRef(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editSelectedItems, setEditSelectedItems] = useState([]);
  const [editOrderStatus, setEditOrderStatus] = useState('pending');

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when searching
    fetchOrders();
  }, [searchTerm]);

  useEffect(() => {
    fetchOrders();
  }, [currentPage]);

  // Handle ESC key for modals
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showCreateModal) {
        closeCreateModal();
      }
      if (event.key === 'Escape' && showEditModal) {
        closeEditModal();
      }
      if (event.key === 'Escape' && showScannerModal) {
        closeScanner();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showCreateModal, showEditModal, showScannerModal]);

  // Barcode scanner effect
  useEffect(() => {
    if (!showScannerModal) return;

    // Load QuaggaJS dynamically
    const loadQuagga = async () => {
      try {
        const Quagga = (await import('quagga')).default;

        // Ensure any previous listeners/instances are cleaned up
        try {
          if (window.__quaggaOnDetected) {
            Quagga.offDetected(window.__quaggaOnDetected);
            window.__quaggaOnDetected = null;
          }
          Quagga.stop();
        } catch {}

        Quagga.init({
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: scannerRef.current,
            constraints: {
              width: 640,
              height: 480,
              facingMode: 'environment'
            },
          },
          locator: {
            patchSize: "medium",
            halfSample: true,
          },
          numOfWorkers: 2,
          frequency: 8,
          decoder: {
            readers: [
              "code_128_reader",
              "ean_reader",
              "ean_8_reader",
              "code_39_reader",
              "code_39_vin_reader",
              "codabar_reader",
              "upc_reader",
              "upc_e_reader",
              "i2of5_reader",
              "2of5_reader",
              "code_93_reader",
            ],
          },
        }, (err) => {
          if (err) {
            console.error('Quagga initialization failed:', err);
            toast.error('Failed to initialize scanner');
            return;
          }


          Quagga.start();

          let detectionLocked = false;
          let lastCode = '';
          let repeatCount = 0;
          let lastTs = 0;

          const onDetected = (result) => {
            const code = (result && result.codeResult && result.codeResult.code) ? result.codeResult.code.trim() : '';
            if (!code || detectionLocked) return;

            const now = Date.now();
            if (code === lastCode && now - lastTs < 1200) {
              repeatCount += 1;
            } else {
              lastCode = code;
              repeatCount = 1;
            }
            lastTs = now;

            if (repeatCount >= 2) {
              detectionLocked = true;
              handleBarcodeDetected(code).then((found) => {
                if (!found && showScannerModal) {
                  // allow scanning again if not found
                  detectionLocked = false;
                }
              }).catch(() => {
                detectionLocked = false;
              });
            }
          };

          Quagga.onDetected(onDetected);
          window.__quaggaOnDetected = onDetected;
        });
      } catch (error) {
        console.error('Failed to load Quagga:', error);
        toast.error('Failed to load barcode scanner');
      }
    };

    loadQuagga();

    return () => {
      // Cleanup Quagga when component unmounts or modal closes
      try {
        const Quagga = window.Quagga || (window.require && window.require('quagga'));
        if (Quagga) {
          if (window.__quaggaOnDetected) {
            Quagga.offDetected(window.__quaggaOnDetected);
            window.__quaggaOnDetected = null;
          }
          Quagga.stop();
        }
      } catch {}

      // Stop any active video tracks to release camera
      try {
        const video = document.querySelector('video');
        const stream = video && video.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(t => t.stop());
        }
      } catch {}
    };
  }, [showScannerModal]);

  const fetchClients = async () => {
    try {
      const response = await axios.get('/api/users/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to fetch clients');
    }
  };

  const fetchProducts = async (search = '') => {
    try {
      const params = new URLSearchParams({ 
        limit: 20, 
        stock: 'in_stock',
        sortBy: 'created_at',
        sortOrder: 'desc'
      });
      if (search) params.set('search', search);
      const response = await axios.get(`/api/products?${params.toString()}`);
      setProducts(response.data.products);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    }
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
    fetchClients();
    setProductSearch('');
    setClientSearch('');
    setSelectedClient('');
    setSelectedItems([]);
    setOrderStatus('pending');
    setGuestInfo({ name: '', email: '', phone: '' });
    fetchProducts('');
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setProductSearch('');
    setClientSearch('');
    setSelectedClient('');
    setSelectedItems([]);
    setOrderStatus('pending');
    setGuestInfo({ name: '', email: '', phone: '' });
    if (showScannerModal) {
      closeScanner();
    }
  };

  useEffect(() => {
    if (!showCreateModal) return;
    const handle = setTimeout(() => {
      fetchProducts(productSearch);
    }, 300);
    return () => clearTimeout(handle);
  }, [productSearch, showCreateModal]);

  // Search effect for edit modal
  useEffect(() => {
    if (!showEditModal) return;
    const handle = setTimeout(() => {
      fetchProducts(productSearch);
    }, 300);
    return () => clearTimeout(handle);
  }, [productSearch, showEditModal]);

  const addItemToOrder = (product) => {
    const existingItem = selectedItems.find(item => item.productId === product.id);
    
    if (existingItem) {
      // Check if adding one more would exceed available stock
      if (existingItem.quantity >= product.stock_quantity) {
        toast.error(`Cannot add more ${product.name}. Only ${product.stock_quantity} in stock.`);
        return;
      }
      
      setSelectedItems(selectedItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      // Check if product has stock available
      if (product.stock_quantity <= 0) {
        toast.error(`Cannot add ${product.name}. Out of stock.`);
        return;
      }
      
      setSelectedItems([...selectedItems, {
        productId: product.id,
        quantity: 1,
        price: product.price,
        name: product.name,
        category: product.category
      }]);
    }
  };

  const addItemToEditOrder = (product) => {
    const existingItem = editSelectedItems.find(item => item.productId === product.id);
    
    if (existingItem) {
      // Check if adding one more would exceed available stock
      if (existingItem.quantity >= product.stock_quantity) {
        toast.error(`Cannot add more ${product.name}. Only ${product.stock_quantity} in stock.`);
        return;
      }
      
      setEditSelectedItems(editSelectedItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      // Check if product has stock available
      if (product.stock_quantity <= 0) {
        toast.error(`Cannot add ${product.name}. Out of stock.`);
        return;
      }
      
      setEditSelectedItems([...editSelectedItems, {
        productId: product.id,
        quantity: 1,
        price: product.price,
        name: product.name,
        category: product.category
      }]);
    }
  };

  const removeItemFromOrder = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.productId !== productId));
  };

  const updateItemQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeItemFromOrder(productId);
    } else {
      // Find the product to check stock
      const product = products.find(p => p.id === productId);
      if (product && quantity > product.stock_quantity) {
        toast.error(`Cannot set quantity to ${quantity}. Only ${product.stock_quantity} in stock.`);
        return;
      }
      
      setSelectedItems(selectedItems.map(item =>
        item.productId === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const createOrder = async () => {
    try {
      if (selectedItems.length === 0) {
        toast.error('Please add at least one item to the order');
        return;
      }

      const orderData = {
        items: selectedItems,
        status: orderType === 'guest' ? 'completed' : orderStatus
      };

      if (orderType === 'client') {
        if (!selectedClient) {
          toast.error('Please select a client');
          return;
        }
        orderData.clientId = parseInt(selectedClient);
      } else {
        if (!guestInfo.name) {
          toast.error('Please enter guest name');
          return;
        }
        orderData.guestName = guestInfo.name;
        if (guestInfo.email) {
        orderData.guestEmail = guestInfo.email;
        }
        if (guestInfo.phone) {
        orderData.guestPhone = guestInfo.phone;
        }
      }

      await axios.post('/api/orders', orderData);
      toast.success('Order created successfully');
      setShowCreateModal(false);
      resetCreateForm();
      fetchOrders();
      
      // If this was a client order, trigger a refresh of the Users page
      if (orderType === 'client' && selectedClient) {
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('orderCreated', { 
          detail: { clientId: parseInt(selectedClient), status: orderData.status } 
        }));
        
        // Also store in localStorage to trigger refresh when Users page is loaded
        localStorage.setItem('lastOrderCreated', JSON.stringify({
          clientId: parseInt(selectedClient),
          status: orderData.status,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error(error.response?.data?.message || 'Failed to create order');
    }
  };

  const resetCreateForm = () => {
    setSelectedClient('');
    setGuestInfo({ name: '', email: '', phone: '' });
    setOrderType('client');
    setSelectedItems([]);
    setOrderStatus('pending');
  };

  const updateEditOrder = async () => {
    try {
      if (editSelectedItems.length === 0) {
        toast.error('Please add at least one item to the order');
        return;
      }

      const orderData = {
        items: editSelectedItems,
        status: editOrderStatus
      };

      console.log('Sending order update data:', orderData);
      console.log('Edit selected items:', editSelectedItems);

      await axios.put(`/api/orders/${editingOrder.id}`, orderData);
      toast.success('Order updated successfully');
      closeEditModal();
      fetchOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingOrder(null);
    setEditSelectedItems([]);
    setEditOrderStatus('pending');
  };

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: 10
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await axios.get(`/api/orders?${params}`);
      setOrders(response.data.orders);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.put(`/api/orders/${orderId}/status`, { status: newStatus });
      toast.success('Order status updated successfully');
      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const downloadInvoice = async (orderId) => {
    try {
      const response = await axios.get(`/api/orders/${orderId}/invoice`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Open PDF in new tab instead of downloading
      window.open(url, '_blank');
      
      // Clean up the URL object after a delay to ensure the PDF loads
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
      
      toast.success('Invoice opened in new tab');
    } catch (error) {
      console.error('Error opening invoice:', error);
      toast.error('Failed to open invoice');
    }
  };

  const shareInvoiceWhatsApp = async (orderId) => {
    try {
      // First download the file so user can attach it
      const response = await axios.get(`/api/orders/${orderId}/invoice`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Try native share first (mobile devices)
      try {
        const file = new File([blob], `invoice-${orderId}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Invoice #${orderId}`,
            text: `Invoice #${orderId}`
          });
          toast.success('Invoice shared successfully!');
          return;
        }
      } catch (shareErr) {
        // Native share failed, fall back to download + WhatsApp
      }
      
      // Fallback: Download file and open WhatsApp
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      // Clean up
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
      
      // Send WhatsApp message with instructions
      const msg = `Invoice #${orderId} has been downloaded to your device. Please attach the PDF file from your Downloads folder to this WhatsApp message.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      
      toast.success('Invoice downloaded and WhatsApp opened. Please attach the PDF file.');
    } catch (error) {
      console.error('Error sharing invoice:', error);
      toast.error('Failed to share invoice');
    }
  };

  const deleteOrder = async (orderId) => {
    try {
      await axios.delete(`/api/orders/${orderId}`);
      toast.success('Order deleted successfully');
      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  const handleEditOrder = async (order) => {
    try {
      // Fetch order details to get current items
      const response = await axios.get(`/api/orders/${order.id}`);
      const orderDetails = response.data;
      
      setEditingOrder(order);
      // Map the items to include category for proper currency display and fix field names
      const itemsWithCategory = (orderDetails.items || []).map(item => ({
        ...item,
        productId: item.product_id, // Map product_id to productId for frontend compatibility
        name: item.product_name, // Map product_name to name for frontend compatibility
        category: item.category || 'accessories' // fallback to accessories if category is missing
      }));
      setEditSelectedItems(itemsWithCategory);
      setEditOrderStatus(order.status);
      setShowEditModal(true);
      
      // Fetch products for the edit modal
      fetchProducts('');
    } catch (error) {
      console.error('Error fetching order details:', error);
      toast.error('Failed to load order details');
    }
  };

  const handleDeleteOrder = (orderId) => {
    if (window.confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
      deleteOrder(orderId);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-red-600" />;

      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'badge bg-green-100 text-green-800';
      case 'pending': return 'badge bg-red-100 text-red-800';

      default: return 'badge bg-gray-100 text-gray-800';
    }
  };

  // Barcode scanning functions
  const openScanner = () => {
    setShowScannerModal(true);
  };

  const closeScanner = () => {
    try {
      const Quagga = window.Quagga || (window.require && window.require('quagga'));
      if (Quagga) {
        if (window.__quaggaOnDetected) {
          Quagga.offDetected(window.__quaggaOnDetected);
          window.__quaggaOnDetected = null;
        }
        Quagga.stop();
      }
    } catch {}
    try {
      const video = document.querySelector('video');
      const stream = video && video.srcObject;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(t => t.stop());
      }
    } catch {}
    setShowScannerModal(false);
  };

  const handleBarcodeDetected = async (barcode) => {
    try {
      const code = (barcode || '').trim();
      if (!code) return false;

      // Exact lookup endpoint for barcode
      const response = await axios.get(`/api/products/barcode/${encodeURIComponent(code)}`);
      const product = response.data;

      if (product && product.id) {
        addItemToOrder(product);
        toast.success(`Product "${product.name}" added to cart!`);
        closeScanner();
        return true;
      }

      toast.error('Product not found with this barcode');
      return false;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        toast.error('Product not found with this barcode');
        return false;
      }
      console.error('Error searching for product:', error);
      toast.error('Failed to search for product');
      return false;
    }
  };

  const generateOrdersReport = async () => {
    try {
      // Get all orders first
      const response = await axios.get('/api/orders?limit=1000&page=1');
      let allOrders = response.data.orders;
      
      // Filter orders by date range if specified
      if (dateFrom || dateTo) {
        allOrders = allOrders.filter(order => {
          const orderDate = new Date(order.created_at);
          const orderDateStr = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          
          if (dateFrom && dateTo) {
            // Both dates specified - check if order is within range
            return orderDateStr >= dateFrom && orderDateStr <= dateTo;
          } else if (dateFrom) {
            // Only start date specified - check if order is after start date
            return orderDateStr >= dateFrom;
          } else if (dateTo) {
            // Only end date specified - check if order is before end date
            return orderDateStr <= dateTo;
          }
          return true;
        });
      }
      
      if (allOrders.length === 0) {
        toast.error('No orders found in the selected date range');
        return;
      }

      // Create PDF using jsPDF
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      
      // Set document properties
      doc.setProperties({
        title: 'Orders Report',
        subject: 'Complete Orders Summary',
        author: 'POS CRM System',
        creator: 'POS CRM System'
      });

      // Add header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      
      // Show date range in title if specified
      let reportTitle = 'Orders Report';
      if (dateFrom && dateTo) {
        const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
        const toDate = new Date(dateTo).toLocaleDateString('en-GB');
        reportTitle = `Orders Report (${fromDate} to ${toDate})`;
      } else if (dateFrom) {
        const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
        reportTitle = `Orders Report (From ${fromDate})`;
      } else if (dateTo) {
        const toDate = new Date(dateTo).toLocaleDateString('en-GB');
        reportTitle = `Orders Report (Until ${toDate})`;
      }
      
      doc.text(reportTitle, 20, 20); // Left-aligned
      
      doc.setFontSize(10); // Smaller text
      doc.setFont('helvetica', 'normal');
      // Calculate totals first
      const totalEur = allOrders.reduce((sum, order) => sum + (parseFloat(order.eur_total) || 0), 0);
      const totalMkd = allOrders.reduce((sum, order) => sum + (parseFloat(order.mkd_total) || 0), 0);
      
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, 30);
      doc.text(`Total Orders: ${allOrders.length}`, 20, 37);
      
      // Show date range info if specified
      if (dateFrom || dateTo) {
        let dateRangeText = '';
        if (dateFrom && dateTo) {
          const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
          const toDate = new Date(dateTo).toLocaleDateString('en-GB');
          dateRangeText = `Date Range: ${fromDate} to ${toDate}`;
        } else if (dateFrom) {
          const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
          dateRangeText = `From Date: ${fromDate}`;
        } else if (dateTo) {
          const toDate = new Date(dateTo).toLocaleDateString('en-GB');
          dateRangeText = `Until Date: ${toDate}`;
        }
        doc.text(dateRangeText, 20, 44);
        
        // Move totals down one line
        doc.text(`Total EUR: ${totalEur.toFixed(0)} EUR`, 20, 51);
        doc.text(`Total MKD: ${totalMkd.toFixed(0)} MKD`, 20, 58);
      } else {
        // No date filter - show totals at original position
        doc.text(`Total EUR: ${totalEur.toFixed(0)} EUR`, 20, 44);
        doc.text(`Total MKD: ${totalMkd.toFixed(0)} MKD`, 20, 51);
      }

      // Start orders table
      let yPosition = dateFrom || dateTo ? 70 : 65; // Adjust position if date range is shown
      const pageHeight = 297; // A4 height in mm
      const margin = 10;
      const lineHeight = 4; // Reduced from 6 to 4 for even tighter spacing
      const tableStartX = margin;
      const tableWidth = 185; // Adjusted width to better fit columns
      
      // Define column positions for better alignment
      const colOrderId = tableStartX;
      const colClient = tableStartX + 25;
      const colStatus = tableStartX + 70;
      const colDateTime = tableStartX + 110;
      const colEur = tableStartX + 150;
      const colMkd = tableStartX + 170;
      
      // Table headers with gray background and border
      doc.setFontSize(9); // Slightly smaller for more compact look
      doc.setFont('helvetica', 'bold');
      
      // Draw gray background for header
      doc.setFillColor(240, 240, 240); // Light gray background
      doc.rect(tableStartX, yPosition - 3, tableWidth, lineHeight + 3, 'F');
      
      // Header text
      doc.setTextColor(0, 0, 0); // Black text
      doc.text('Order ID', colOrderId, yPosition);
      doc.text('Client', colClient, yPosition);
      doc.text('Status', colStatus, yPosition);
      doc.text('Date & Time', colDateTime, yPosition);
      doc.text('EUR', colEur + 15, yPosition, { align: 'right' });
      doc.text('MKD', colMkd + 15, yPosition, { align: 'right' });
      
      yPosition += lineHeight + 1; // Reduced spacing
      
      // Draw header bottom border
      doc.setDrawColor(100, 100, 100); // Darker line for header border
      doc.line(tableStartX, yPosition, tableStartX + tableWidth, yPosition);
      yPosition += 3; // Reduced spacing after header line

      allOrders.forEach((order, index) => {
        // Check if we need a new page
        if (yPosition > pageHeight - 35) { // Reduced margin for more content per page
          doc.addPage();
          yPosition = 15; // Start closer to top
          
          // Redraw headers on new page
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          
          // Draw gray background for header
          doc.setFillColor(240, 240, 240); // Light gray background
          doc.rect(tableStartX, yPosition - 3, tableWidth, lineHeight + 3, 'F');
          
          // Header text
          doc.setTextColor(0, 0, 0); // Black text
          doc.text('Order ID', colOrderId, yPosition);
          doc.text('Client', colClient, yPosition);
          doc.text('Status', colStatus, yPosition);
          doc.text('Date & Time', colDateTime, yPosition);
          doc.text('EUR', colEur + 15, yPosition, { align: 'right' });
          doc.text('MKD', colMkd + 15, yPosition, { align: 'right' });
          
          yPosition += lineHeight + 1;
          doc.line(tableStartX, yPosition, tableStartX + tableWidth, yPosition);
          yPosition += 1;
        }

        // Table row data
        doc.setFontSize(8); // Smaller font for more compact rows
        doc.setFont('helvetica', 'normal');
        
        // Order ID
        doc.text(`#${order.id}`, colOrderId, yPosition);
        
        // Client info - more compact format
        const clientName = order.client_name || order.guest_name || 'Unknown';
        const clientType = order.client_name ? 'C' : 'G';
        const displayName = clientName.length > 18 ? clientName.substring(0, 18) + '..' : clientName;
        doc.text(`${clientType}: ${displayName}`, colClient, yPosition);
        
        // Status - capitalize first letter
        const status = order.status.charAt(0).toUpperCase() + order.status.slice(1);
        doc.text(status, colStatus, yPosition);
        
        // Date and time - more compact format
        const orderDate = new Date(order.created_at);
        const dateStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timeStr = orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        doc.text(`${dateStr} ${timeStr}`, colDateTime, yPosition);
        
        // Amounts - right-aligned for better readability
        const eurAmount = parseFloat(order.eur_total) || 0;
        const mkdAmount = parseFloat(order.mkd_total) || 0;
        
        // Right-align amounts
        const eurText = eurAmount > 0 ? eurAmount.toFixed(0) : '-';
        const mkdText = mkdAmount > 0 ? mkdAmount.toFixed(0) : '-';
        
        doc.text(eurText, colEur + 15, yPosition, { align: 'right' });
        doc.text(mkdText, colMkd + 15, yPosition, { align: 'right' });
        
        // Add row separator after every row (positioned higher)
        if (index < allOrders.length - 1) {
          doc.setDrawColor(200, 200, 200); // Medium gray line for row separation
          doc.line(tableStartX, yPosition + 1, tableStartX + tableWidth, yPosition + 1);
        }
        
        yPosition += lineHeight; // Move to next row position
      });

      // Save the PDF
      const fileName = `orders-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success('Orders report generated successfully!');
    } catch (error) {
      console.error('Error generating orders report:', error);
      toast.error('Failed to generate orders report');
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and track all orders
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Search Orders */}
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <input
              type="text"
              placeholder="Search by order ID or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="btn-primary w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Order
          </button>
        </div>
      </div>





      {/* Orders List */}
      <div className="card w-full">
        <div className="card-header">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <h3 className="text-lg font-medium text-gray-900">All Orders</h3>
            <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:gap-3">
              {/* Date Range Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input text-sm w-36"
                  placeholder="From"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input text-sm w-36"
                  placeholder="To"
                />
              </div>
              
              {/* Generate Report Button */}
              <button
                onClick={generateOrdersReport}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                title="Generate PDF report of orders in selected date range"
              >
                <Download className="h-4 w-4" />
                Generate Report
              </button>
            </div>
          </div>
        </div>
        <div className="card-body p-0">
          {orders.length > 0 ? (
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                      Order
                    </th>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                      Client
                    </th>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                      Amounts
                    </th>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                      Status
                    </th>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] hidden sm:table-cell">
                      Date
                    </th>
                    <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[120px]">
                        <div className="flex items-center min-w-0">
                          <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary-100 flex items-center justify-center">
                              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600" />
                            </div>
                          </div>
                          <div className="ml-2 sm:ml-4 min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              Order #{order.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[200px]">
                        <div className="min-w-0">
                          {order.client_name ? (
                            <>
                              <div className="text-sm text-gray-900 truncate">{order.client_name}</div>
                              <div className="text-sm text-gray-500 truncate">{order.client_email}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm text-gray-900 truncate">{order.guest_name} (Guest)</div>
                              {order.guest_email && (
                              <div className="text-sm text-gray-500 truncate">{order.guest_email}</div>
                              )}
                              {order.guest_phone && (
                                <div className="text-xs text-gray-400 truncate">{order.guest_phone}</div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-gray-900 min-w-[120px]">
                        <div className="space-y-1">
                          {order.eur_total > 0 && (
                            <div className="text-green-700 font-medium">
                              {parseInt(order.eur_total)} EUR
                            </div>
                          )}
                          {order.mkd_total > 0 && (
                            <div className="text-blue-700 font-medium">
                              {parseInt(order.mkd_total)} MKD
                            </div>
                          )}
                          {order.eur_total === 0 && order.mkd_total === 0 && (
                            <div className="text-gray-500">
                              {parseInt(order.total_amount)} MKD
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[100px]">
                        <div className="flex items-center min-w-0">
                          {getStatusIcon(order.status)}
                          <span className={`ml-2 ${getStatusBadgeClass(order.status)} truncate`}>
                            {order.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-gray-500 hidden sm:table-cell min-w-[100px]">
                        <div className="truncate">
                        {new Date(order.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm font-medium min-w-[120px]">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="text-blue-600 hover:text-blue-900 p-1"
                              title="Edit Order"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Delete Order"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => downloadInvoice(order.id)}
                              className="text-primary-600 hover:text-primary-900 p-1"
                              title="Open Invoice"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => shareInvoiceWhatsApp(order.id)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Share via WhatsApp"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                          </div>
                          <select
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                            className="mt-1 sm:mt-0 text-xs sm:text-sm border border-gray-300 rounded px-1 sm:px-2 py-1"
                          >
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingCart className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search criteria.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Order Statistics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 w-full">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-md bg-blue-100">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Orders</dt>
                  <dd className="text-lg font-medium text-gray-900">{orders.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-md bg-yellow-100">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {orders.filter(order => order.status === 'pending').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-md bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {orders.filter(order => order.status === 'completed').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
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

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0">
          <div className="relative top-10 mx-auto p-6 border w-11/12 max-w-7xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Order</h3>
                <button
                  onClick={closeCreateModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left Column - Customer & Order */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Order Type</label>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="client"
                          checked={orderType === 'client'}
                          onChange={(e) => setOrderType(e.target.value)}
                          className="mr-2"
                        />
                        Registered Client
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="guest"
                          checked={orderType === 'guest'}
                          onChange={(e) => setOrderType(e.target.value)}
                          className="mr-2"
                        />
                        Guest Customer
                      </label>
                    </div>
                  </div>

                  {orderType === 'client' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Search Client</label>
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="input w-full"
                          placeholder="Search client by name..."
                        />
                      </div>
                      
                      {/* Filtered Clients List */}
                      {clientSearch.trim() && (
                        <div className="max-h-48 overflow-y-auto border rounded-md">
                          {clients
                            .filter(client => 
                              client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                              (client.email && client.email.toLowerCase().includes(clientSearch.toLowerCase()))
                            )
                            .slice(0, 3)
                            .map(client => (
                              <div
                                key={client.id}
                                className={`flex items-center justify-between p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                                  selectedClient === client.id ? 'bg-blue-50 border-blue-200' : ''
                                }`}
                                onClick={() => setSelectedClient(client.id)}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-sm text-gray-900">{client.name}</div>
                                </div>
                                {selectedClient === client.id && (
                                  <div className="text-blue-600">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            ))}
                          {clients.filter(client => 
                            client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                            (client.email && client.email.toLowerCase().includes(clientSearch.toLowerCase()))
                          ).length === 0 && (
                            <div className="p-3 text-center text-sm text-gray-500">
                              No clients found
                      </div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
                        <div className="flex space-x-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="completed"
                              checked={orderStatus === 'completed'}
                              onChange={(e) => setOrderStatus(e.target.value)}
                              className="mr-2"
                            />
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Completed</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="pending"
                              checked={orderStatus === 'pending'}
                              onChange={(e) => setOrderStatus(e.target.value)}
                              className="mr-2"
                            />
                            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">Pending</span>
                          </label>
              </div>
            </div>
          </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
                        <input
                          type="text"
                          value={guestInfo.name}
                          onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                          className="input w-full"
                          placeholder="Enter guest name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Guest Email</label>
                        <input
                          type="email"
                          value={guestInfo.email}
                          onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                          className="input w-full"
                          placeholder="Enter guest email"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Guest Phone</label>
                        <input
                          type="tel"
                          value={guestInfo.phone}
                          onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                          className="input w-full"
                          placeholder="Enter guest phone (optional)"
                        />
        </div>
                      <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                          <span className="text-sm text-green-800">Guest orders are automatically marked as completed</span>
              </div>
            </div>
          </div>
                  )}

                  {/* Selected Items and Total under controls */}
                  {selectedItems.length > 0 && (
                  <div>
                      <div className="border-t my-3" />
                      <label className="block text-sm font-medium text-gray-700 mb-2">Order Items</label>
                      <div className="max-h-64 overflow-y-auto space-y-4 pr-1">
                        {/* EUR Products (Smartphones) */}
                        {selectedItems.filter(item => item.category === 'smartphones').length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-green-700 mb-2 border-b border-green-200 pb-1">
                              EUR Products (Smartphones)
                          </div>
                            <div className="space-y-2">
                              {selectedItems
                                .filter(item => item.category === 'smartphones')
                                .map(item => (
                                  <div key={item.productId} className="flex items-center justify-between p-2 bg-green-50 rounded h-16 border border-green-200">
                                    <div>
                                      <div className="font-medium text-sm">{item.name}</div>
                                      <div className="text-xs text-green-600">
                                        {parseInt(item.price)} EUR each
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="number"
                                        min="1"
                                        max={products.find(p => p.id === item.productId)?.stock_quantity || 1}
                                        value={item.quantity}
                                        onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value))}
                                        className="w-16 input text-center h-8 py-1"
                                      />
                                      <button
                                        onClick={() => removeItemFromOrder(item.productId)}
                                        className="text-red-600 hover:text-red-800 text-sm"
                                      >
                                        Remove
                          </button>
                                    </div>
                        </div>
                      ))}
                    </div>
        </div>
                        )}

                        {/* MKD Products (Accessories) */}
                        {selectedItems.filter(item => item.category !== 'smartphones').length > 0 && (
                    <div>
                            <div className="text-sm font-medium text-blue-700 mb-2 border-b border-blue-200 pb-1">
                              MKD Products (Accessories)
                            </div>
                      <div className="space-y-2">
                              {selectedItems
                                .filter(item => item.category !== 'smartphones')
                                .map(item => (
                                  <div key={item.productId} className="flex items-center justify-between p-2 bg-blue-50 rounded h-16 border border-blue-200">
                            <div>
                                      <div className="font-medium text-sm">{item.name}</div>
                                      <div className="text-xs text-blue-600">
                                        {parseInt(item.price)} MKD each
                                      </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                min="1"
                                max={products.find(p => p.id === item.productId)?.stock_quantity || 1}
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value))}
                                        className="w-16 input text-center h-8 py-1"
                              />
                              <button
                                onClick={() => removeItemFromOrder(item.productId)}
                                        className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                            </div>
                          </div>
                        )}
              </div>
                      <div className="mt-3 p-3 bg-blue-50 rounded">
                        {(() => {
                          const mkdTotal = selectedItems
                            .filter(item => item.category !== 'smartphones')
                            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                          const eurTotal = selectedItems
                            .filter(item => item.category === 'smartphones')
                            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                          
                          return (
                            <div className="space-y-1">
                              {mkdTotal > 0 && (
                                <div className="text-lg font-bold text-blue-800">Total MKD: {mkdTotal.toFixed(0)} MKD</div>
                              )}
                              {eurTotal > 0 && (
                                <div className="text-lg font-bold text-green-800">Total EUR: {eurTotal.toFixed(0)} EUR</div>
                              )}
              </div>
                          );
                        })()}
            </div>
          </div>
                  )}
                </div>

                {/* Right Column - Select Products */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Products
                    </label>
                    <div className="mb-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="input w-full pr-12"
                          placeholder="Search by name or barcode..."
                        />
                        <button
                          onClick={openScanner}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                          title="Scan barcode"
                        >
                          <Scan className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[32rem] overflow-y-auto border rounded-md">
                      {products.map(product => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                          onClick={() => addItemToOrder(product)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded bg-gray-200 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate" title={product.name}>{product.name}</div>
                              <div className="text-xs text-gray-500 truncate" title={product.barcode || ''}>{product.barcode || '—'}</div>
                              <div className="text-xs text-gray-600">
                                {parseInt(product.price)} {product.category === 'smartphones' ? 'EUR' : 'MKD'}
                              </div>
                            </div>
                          </div>
                          <button
                            className="btn-secondary text-xs"
                            onClick={(e) => { e.stopPropagation(); addItemToOrder(product); }}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-6">
                <button
                  onClick={createOrder}
                  className="btn-primary flex-1"
                  disabled={selectedItems.length === 0}
                >
                  Create Order
                </button>
                <button
                  onClick={closeCreateModal}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0">
          <div className="relative top-10 mx-auto p-6 border w-11/12 max-w-7xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Order #{editingOrder?.id}</h3>
                <button
                  onClick={closeEditModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left Column - Order Details */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
                    <select
                      value={editOrderStatus}
                      onChange={(e) => setEditOrderStatus(e.target.value)}
                      className="input w-full"
                    >
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Items</label>
                    <div className="max-h-64 overflow-y-auto border rounded-md">
                      {editSelectedItems.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border-b last:border-b-0">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-gray-500">
                              {item.price} {item.category === 'smartphones' ? 'EUR' : 'MKD'}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQuantity = parseInt(e.target.value) || 1;
                                // Find the product to check stock
                                const product = products.find(p => p.id === item.productId);
                                if (product && newQuantity > product.stock_quantity) {
                                  toast.error(`Cannot set quantity to ${newQuantity}. Only ${product.stock_quantity} in stock.`);
                                  return;
                                }
                                
                                const newItems = [...editSelectedItems];
                                newItems[index].quantity = newQuantity;
                                setEditSelectedItems(newItems);
                              }}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => {
                                setEditSelectedItems(editSelectedItems.filter((_, i) => i !== index));
                              }}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {editSelectedItems.length === 0 && (
                        <div className="p-3 text-center text-sm text-gray-500">
                          No items in order
                        </div>
                      )}
                    </div>
                    
                    {/* Totals Section */}
                    {editSelectedItems.length > 0 && (
                      <div className="mt-3 p-3 bg-gray-50 rounded border">
                        <div className="text-sm font-medium text-gray-700 mb-2">Order Totals</div>
                        <div className="space-y-2">
                          {(() => {
                            const eurTotal = editSelectedItems
                              .filter(item => item.category === 'smartphones')
                              .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                            const mkdTotal = editSelectedItems
                              .filter(item => item.category !== 'smartphones')
                              .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                            
                            return (
                              <>
                                {eurTotal > 0 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">EUR Total:</span>
                                    <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-1 rounded">
                                      {eurTotal.toFixed(0)} EUR
                                    </span>
                                  </div>
                                )}
                                {mkdTotal > 0 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">MKD Total:</span>
                                    <span className="text-sm font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                      {mkdTotal.toFixed(0)} MKD
                                    </span>
                                  </div>
                                )}
                                <div className="border-t pt-2 mt-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700">Total Items:</span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {editSelectedItems.reduce((sum, item) => sum + item.quantity, 0)}
                                    </span>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Add Products */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add Products</label>
                    <div className="mb-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="input w-full pr-12"
                          placeholder="Search by name or barcode..."
                        />
                        <button
                          onClick={openScanner}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                          title="Scan barcode"
                        >
                          <Scan className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[32rem] overflow-y-auto border rounded-md">
                      {products
                        .filter(product => 
                          !productSearch || 
                          product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          (product.barcode && product.barcode.toLowerCase().includes(productSearch.toLowerCase()))
                        )
                        .map(product => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                          onClick={() => addItemToEditOrder(product)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded bg-gray-200 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate" title={product.name}>{product.name}</div>
                              <div className="text-xs text-gray-500 truncate" title={product.barcode || ''}>{product.barcode || '—'}</div>
                              <div className="text-xs text-gray-600">
                                {parseInt(product.price)} {product.category === 'smartphones' ? 'EUR' : 'MKD'}
                              </div>
                            </div>
                          </div>
                          <button
                            className="btn-secondary text-xs"
                            onClick={(e) => { e.stopPropagation(); addItemToEditOrder(product); }}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                      {products.filter(product => 
                        !productSearch || 
                        product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                        (product.barcode && product.barcode.toLowerCase().includes(productSearch.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-3 text-center text-sm text-gray-500">
                          {productSearch ? 'No products found matching your search' : 'No products available'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-6">
                <button
                  onClick={updateEditOrder}
                  className="btn-primary flex-1"
                  disabled={editSelectedItems.length === 0}
                >
                  Update Order
                </button>
                <button
                  onClick={closeEditModal}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
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
    </div>
  );
};

export default Orders; 