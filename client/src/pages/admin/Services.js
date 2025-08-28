import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  RotateCcw,
  Wrench,
  Phone,
  User,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Download
} from 'lucide-react';

const Services = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [formData, setFormData] = useState({
    full_name: '',
    contact: '',
    phone_model: '',
    imei: '',
    description: '',
    price: '',
    status: 'in_service',
    profit: ''
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchServices();
  }, [currentPage, searchTerm, statusFilter]);

  // Handle ESC key for modals
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showModal) {
        setShowModal(false);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showModal]);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: currentPage,
        limit: 20
      });

      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);

      const response = await axios.get(`/api/services?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setServices(response.data.services);
      setTotalPages(response.data.pagination.pages);
    } catch (error) {
      console.error('Error fetching services:', error);
      toast.error('Failed to fetch services');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      contact: '',
      phone_model: '',
      imei: '',
      description: '',
      price: '',
      status: 'in_service',
      profit: ''
    });
    setEditingService(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      console.log('Submitting service data:', formData);
      
      if (editingService) {
        await axios.put(`/api/services/${editingService.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Service updated successfully');
      } else {
        await axios.post('/api/services', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Service created successfully');
      }
      
      setShowModal(false);
      resetForm();
      fetchServices();
    } catch (error) {
      console.error('Error saving service:', error);
      if (error.response?.data?.errors) {
        console.log('Validation errors:', error.response.data.errors);
        toast.error('Validation error: ' + error.response.data.errors[0].msg);
      } else {
        toast.error(error.response?.data?.error || 'Failed to save service');
      }
    }
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      full_name: service.full_name,
      contact: service.contact,
      phone_model: service.phone_model,
      imei: service.imei || '',
      description: service.description,
      price: service.price,
      status: service.status,
      profit: service.profit || ''
    });
    setShowModal(true);
  };

  const downloadInvoice = async (serviceId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/services/${serviceId}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `service-invoice-${serviceId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Invoice downloaded successfully');
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to download invoice');
    }
  };

  const generateServicesReport = async () => {
    try {
      // Get all services first
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/services?limit=1000&page=1', {
        headers: { Authorization: `Bearer ${token}` }
      });
      let allServices = response.data.services;
      
      // Filter services by date range if specified
      if (dateFrom || dateTo) {
        allServices = allServices.filter(service => {
          const serviceDate = new Date(service.created_at);
          const serviceDateStr = serviceDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          
          if (dateFrom && dateTo) {
            // Both dates specified - check if service is within range
            return serviceDateStr >= dateFrom && serviceDateStr <= dateTo;
          } else if (dateFrom) {
            // Only start date specified - check if service is after start date
            return serviceDateStr >= dateFrom;
          } else if (dateTo) {
            // Only end date specified - check if service is before end date
            return serviceDateStr <= dateTo;
          }
          return true;
        });
      }
      
      if (allServices.length === 0) {
        toast.error('No services found in the selected date range');
        return;
      }

      // Create PDF using jsPDF
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      
      // Set document properties
      doc.setProperties({
        title: 'Services Report',
        subject: 'Complete Services Summary',
        author: 'POS CRM System',
        creator: 'POS CRM System'
      });

      // Calculate totals first
      const totalPrice = allServices.reduce((sum, service) => sum + (parseFloat(service.price) || 0), 0);
      const totalProfit = allServices.reduce((sum, service) => sum + (parseFloat(service.profit) || 0), 0);
      
      // Add header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      
      // Show date range in title if specified
      let reportTitle = 'Services Report';
      if (dateFrom && dateTo) {
        const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
        const toDate = new Date(dateTo).toLocaleDateString('en-GB');
        reportTitle = `Services Report (${fromDate} to ${toDate})`;
      } else if (dateFrom) {
        const fromDate = new Date(dateFrom).toLocaleDateString('en-GB');
        reportTitle = `Services Report (From ${fromDate})`;
      } else if (dateTo) {
        const toDate = new Date(dateTo).toLocaleDateString('en-GB');
        reportTitle = `Services Report (Until ${toDate})`;
      }
      
      doc.text(reportTitle, 20, 20); // Left-aligned
      
      doc.setFontSize(10); // Smaller text
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, 30);
      doc.text(`Total Services: ${allServices.length}`, 20, 37);
      
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
        doc.text(`Total Price: ${totalPrice.toFixed(0)} MKD`, 20, 51);
        doc.text(`Total Profit: ${totalProfit.toFixed(0)} MKD`, 20, 58);
      } else {
        // No date filter - show totals at original position
        doc.text(`Total Price: ${totalPrice.toFixed(0)} MKD`, 20, 44);
        doc.text(`Total Profit: ${totalProfit.toFixed(0)} MKD`, 20, 51);
      }

      // Start services table
      let yPosition = dateFrom || dateTo ? 70 : 65; // Adjust position if date range is shown
      const pageHeight = 297; // A4 height in mm
      const margin = 10;
      const lineHeight = 4; // Compact row height
      const tableStartX = margin;
      const tableWidth = 185; // Adjusted width to better fit columns
      
      // Define column positions for better alignment
      const colCustomer = tableStartX;
      const colContact = tableStartX + 30;
      const colPhoneModel = tableStartX + 70;
      const colStatus = tableStartX + 120;
      const colPrice = tableStartX + 150;
      const colProfit = tableStartX + 170;
      
      // Table headers with gray background and border
      doc.setFontSize(9); // Slightly smaller for more compact look
      doc.setFont('helvetica', 'bold');
      
      // Draw gray background for header
      doc.setFillColor(240, 240, 240); // Light gray background
      doc.rect(tableStartX, yPosition - 3, tableWidth, lineHeight + 3, 'F');
      
      // Header text
      doc.setTextColor(0, 0, 0); // Black text
      doc.text('Customer', colCustomer, yPosition);
      doc.text('Contact', colContact, yPosition);
      doc.text('Phone Model', colPhoneModel, yPosition);
      doc.text('Status', colStatus, yPosition);
      doc.text('Price', colPrice + 15, yPosition, { align: 'right' });
      doc.text('Profit', colProfit + 15, yPosition, { align: 'right' });
      
      yPosition += lineHeight + 1; // Reduced spacing
      
      // Draw header bottom border
      doc.setDrawColor(100, 100, 100); // Darker line for header border
      doc.line(tableStartX, yPosition, tableStartX + tableWidth, yPosition);
      yPosition += 3; // Increased spacing after header line for better separation

      allServices.forEach((service, index) => {
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
          doc.text('Customer', colCustomer, yPosition);
          doc.text('Contact', colContact, yPosition);
          doc.text('Phone Model', colPhoneModel, yPosition);
          doc.text('Status', colStatus, yPosition);
          doc.text('Price', colPrice + 15, yPosition, { align: 'right' });
          doc.text('Profit', colProfit + 15, yPosition, { align: 'right' });
          
          yPosition += lineHeight + 1;
          doc.line(tableStartX, yPosition, tableStartX + tableWidth, yPosition);
          yPosition += 3; // Increased spacing after header line for better separation
        }

        // Table row data
        doc.setFontSize(8); // Smaller font for more compact rows
        doc.setFont('helvetica', 'normal');
        
        // Customer name
        const customerName = service.full_name || 'Unknown';
        const displayName = customerName.length > 20 ? customerName.substring(0, 20) + '..' : customerName;
        doc.text(displayName, colCustomer, yPosition);
        
        // Contact
        const contact = service.contact || '-';
        const displayContact = contact.length > 15 ? contact.substring(0, 15) + '..' : contact;
        doc.text(displayContact, colContact, yPosition);
        
        // Phone Model
        const phoneModel = service.phone_model || '-';
        const displayModel = phoneModel.length > 15 ? phoneModel.substring(0, 15) + '..' : phoneModel;
        doc.text(displayModel, colPhoneModel, yPosition);
        
        // Status
        const status = service.status.charAt(0).toUpperCase() + service.status.slice(1);
        doc.text(status, colStatus, yPosition);
        
        // Price and Profit - right-aligned for better readability
        const price = parseFloat(service.price) || 0;
        const profit = parseFloat(service.profit) || 0;
        
        doc.text(price > 0 ? price.toFixed(0) : '-', colPrice + 15, yPosition, { align: 'right' });
        doc.text(profit > 0 ? profit.toFixed(0) : '-', colProfit + 15, yPosition, { align: 'right' });
        
        // Add row separator after every row (positioned lower)
        if (index < allServices.length - 1) {
          doc.setDrawColor(200, 200, 200); // Medium gray line for row separation
          doc.line(tableStartX, yPosition + 1, tableStartX + tableWidth, yPosition + 1);
        }
        
        yPosition += lineHeight; // Move to next row position
      });

      // Save the PDF
      const fileName = `services-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success('Services report generated successfully!');
    } catch (error) {
      console.error('Error generating services report:', error);
      toast.error('Failed to generate services report');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/services/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Service deleted successfully');
      fetchServices();
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Failed to delete service');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status) => {
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <Clock className="h-3 w-3 mr-1" />
        In Service
      </span>
    );
  };

  if (loading && services.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Services</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Manage your service requests
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500 flex-shrink-0" />
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
            onClick={generateServicesReport}
            className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
            title="Generate PDF report of services in selected date range"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Generate Report</span>
            <span className="sm:hidden">Generate</span>
          </button>
          
          {/* Add Service Button */}
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary text-sm py-2 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="sm:inline">Add Service</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search services..."
                  className="input pl-10 w-full"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-full"
              >
                <option value="">All Statuses</option>
                <option value="in_service">In Service</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center h-10 w-full sm:w-auto"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div className="card">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IMEI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="h-5 w-5 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">
                          {service.full_name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Phone className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">{service.contact}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Wrench className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">{service.phone_model}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {service.imei || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate" title={service.description}>
                        {service.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                        <span className="text-sm font-medium text-gray-900">
                          {parseFloat(service.price).toFixed(0)} MKD
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(service.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {service.profit ? (
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 text-green-400 mr-1" />
                          <span className="text-sm font-medium text-green-600">
                            {parseFloat(service.profit).toFixed(0)} MKD
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {formatDate(service.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(service)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Edit Service"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadInvoice(service.id)}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Download Invoice"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(service.id)}
                          className="text-red-600 hover:text-red-900 p-1"
                          title="Delete Service"
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

          {services.length === 0 && !loading && (
            <div className="text-center py-12">
              <Wrench className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No services found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new service.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <nav className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </nav>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0">
          <div className="relative top-20 mx-auto p-5 border w-[800px] shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingService ? 'Edit Service' : 'Add New Service'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="input w-full"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact *
                      </label>
                      <input
                        type="text"
                        value={formData.contact}
                        onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                        className="input w-full"
                        placeholder="Phone number or email"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Model *
                      </label>
                      <input
                        type="text"
                        value={formData.phone_model}
                        onChange={(e) => setFormData({ ...formData, phone_model: e.target.value })}
                        className="input w-full"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IMEI (Optional)
                      </label>
                      <input
                        type="text"
                        value={formData.imei}
                        onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                        className="input w-full"
                        placeholder="Leave empty if not available"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="input w-full"
                        rows="3"
                        required
                      />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price (MKD) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="input w-full"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status *
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="input w-full"
                        required
                      >
                        <option value="in_service">In Service</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Profit (MKD) (Optional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.profit}
                        onChange={(e) => setFormData({ ...formData, profit: e.target.value })}
                        className="input w-full"
                        placeholder="Leave empty if not calculated yet"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                  >
                    {editingService ? 'Update' : 'Create'} Service
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Services;
