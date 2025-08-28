import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users,
  User,
  Shield,
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import LoadingSpinner from '../../components/LoadingSpinner';
import UserProfileModal from '../../components/UserProfileModal';
import toast from 'react-hot-toast';

const UsersList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userFinancialData, setUserFinancialData] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    name: '',
    phone: '',
    email: ''
  });
  // No date range for users report

  useEffect(() => {
    fetchUsers();
    
    // Check if there was a recent order creation
    const lastOrderCreated = localStorage.getItem('lastOrderCreated');
    if (lastOrderCreated) {
      try {
        const orderData = JSON.parse(lastOrderCreated);
        const timeDiff = Date.now() - orderData.timestamp;
        
        // If the order was created within the last 30 seconds, refresh financial data
        if (timeDiff < 30000) {
          console.log('Recent order detected, refreshing financial data...');
          setTimeout(() => {
            if (users.length > 0) {
              const clientUsers = users.filter(user => user.role === 'client');
              if (clientUsers.length > 0) {
                fetchUserFinancialData(clientUsers);
              }
            }
          }, 1000); // Small delay to ensure users are loaded
        }
        
        // Clear the localStorage
        localStorage.removeItem('lastOrderCreated');
      } catch (error) {
        console.error('Error parsing lastOrderCreated:', error);
        localStorage.removeItem('lastOrderCreated');
      }
    }
  }, [currentPage, searchTerm]);

  // Handle ESC key for modals
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        if (showCreateModal) {
          setShowCreateModal(false);
        }
        if (isProfileModalOpen) {
          handleCloseProfileModal();
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showCreateModal, isProfileModalOpen]);

  // Listen for order creation events to refresh financial data
  useEffect(() => {
    const handleOrderCreated = () => {
      // Refresh financial data for all clients when an order is created
      if (users.length > 0) {
        const clientUsers = users.filter(user => user.role === 'client');
        if (clientUsers.length > 0) {
          fetchUserFinancialData(clientUsers);
        }
      }
    };

    window.addEventListener('orderCreated', handleOrderCreated);
    return () => {
      window.removeEventListener('orderCreated', handleOrderCreated);
    };
  }, [users]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: searchTerm
      });



      const response = await axios.get(`/api/users?${params}`);
      setUsers(response.data.users);
      setTotalPages(response.data.pagination.totalPages);
      
      // Fetch financial data for client users
      const clientUsers = response.data.users.filter(user => user.role === 'client');
      if (clientUsers.length > 0) {
        await fetchUserFinancialData(clientUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFinancialData = async (clientUsers) => {
    try {
      const financialData = {};
      
      await Promise.all(
        clientUsers.map(async (user) => {
          try {
            const response = await axios.get(`/api/users/${user.id}/profile`);
            const profile = response.data;
            
            // Use the financial summary from the backend (includes manual adjustments)
            const eurRevenue = profile.financialSummary?.eurRevenue ?? 0;
            const mkdRevenue = profile.financialSummary?.mkdRevenue ?? 0;
            const eurDebt = profile.financialSummary?.eurDebt ?? 0;
            const mkdDebt = profile.financialSummary?.mkdDebt ?? 0;

            financialData[user.id] = {
              revenueEUR: eurRevenue,
              revenueMKD: mkdRevenue,
              revenue: eurRevenue + mkdRevenue,
              debtEUR: eurDebt,
              debtMKD: mkdDebt,
              debt: eurDebt + mkdDebt
            };
          } catch (error) {
            console.error(`Error fetching financial data for user ${user.id}:`, error);
            financialData[user.id] = { revenue: 0, revenueEUR: 0, revenueMKD: 0, debt: 0, debtEUR: 0, debtMKD: 0 };
          }
        })
      );
      
      setUserFinancialData(financialData);
    } catch (error) {
      console.error('Error fetching user financial data:', error);
    }
  };

  const getRoleColor = (role) => {
    return role === 'admin' ? 'purple' : 'blue';
  };

  const handleViewProfile = (userId) => {
    setSelectedUserId(userId);
    setIsProfileModalOpen(true);
  };

  const handleCloseProfileModal = () => {
    setIsProfileModalOpen(false);
    setSelectedUserId(null);
    // Refresh financial data when modal is closed to reflect any changes
    if (users.length > 0) {
      const clientUsers = users.filter(user => user.role === 'client');
      if (clientUsers.length > 0) {
        fetchUserFinancialData(clientUsers);
      }
    }
  };

  const createUser = async () => {
    try {
      if (!createUserForm.name.trim()) {
        toast.error('Name is required');
        return;
      }

      await axios.post('/api/users', {
        name: createUserForm.name.trim(),
        phone: createUserForm.phone.trim() || undefined,
        email: createUserForm.email.trim() || undefined,
        role: 'client'
      });

      toast.success('Client user created successfully');
      setShowCreateModal(false);
      setCreateUserForm({ name: '', phone: '', email: '' });
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(error.response?.data?.message || 'Failed to create user');
    }
  };

  const deleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user '${userName}'? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/users/${userId}`);
      toast.success(`User '${userName}' deleted successfully`);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error.response?.status === 400) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to delete user');
      }
    }
  };



  const generateUsersReport = async () => {
    try {
      // Fetch up to 1000 users matching current filters
      const params = new URLSearchParams({ limit: 1000, page: 1 });
      if (searchTerm) params.append('search', searchTerm);
      // Force clients only for report regardless of UI role filter
      params.append('role', 'client');
      const res = await axios.get(`/api/users?${params.toString()}`);
      let allUsers = Array.isArray(res.data?.users) ? res.data.users : [];
      // Ensure only clients are included
      allUsers = allUsers.filter(u => u.role === 'client');

      // No date filtering for users report

      if (allUsers.length === 0) {
        toast.error('No users found for the selected range');
        return;
      }

      // Fetch financial summaries (debt and orders) for clients included in report
      const financialByUserId = {};
      await Promise.all(
        allUsers.map(async (u) => {
          try {
            const prof = await axios.get(`/api/users/${u.id}/profile`);
            const fs = prof.data?.financialSummary || {};
            financialByUserId[u.id] = {
              eurDebt: fs.eurDebt ?? 0,
              mkdDebt: fs.mkdDebt ?? 0,
              orders: (fs.pendingOrders ?? 0) + (fs.completedOrders ?? 0)
            };
          } catch {
            financialByUserId[u.id] = { eurDebt: 0, mkdDebt: 0, orders: 0 };
          }
        })
      );

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const lineHeight = 4.2;
      let y = 18;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Users Report', margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, margin, y);
      y += 6;
      doc.text(`Items: ${allUsers.length}`, margin, y);
      y += 6;

      const colX = {
        name: margin,
        joined: margin + 90,
        orders: margin + 120,
        debtEUR: margin + 145,
        debtMKD: margin + 175
      };

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.text('Name', colX.name, y);
        doc.text('Joined', colX.joined, y);
        doc.text('Orders', colX.orders, y);
        doc.text('Debt EUR', colX.debtEUR, y);
        doc.text('Debt MKD', colX.debtMKD, y);
        y += lineHeight + 1;
        doc.setDrawColor(150);
        doc.line(margin, y, pageWidth - margin, y);
        y += 2;
        doc.setFont('helvetica', 'normal');
      };

      drawHeader();
      y += 3;
      const pageHeight = doc.internal.pageSize.getHeight();
      let totalDebtEUR = 0, totalDebtMKD = 0;

      for (const u of allUsers) {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
          drawHeader();
          y += 3;
        }
        const joined = u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB') : '-';
        const fs = financialByUserId[u.id] || { eurDebt: 0, mkdDebt: 0, orders: 0 };
        totalDebtEUR += fs.eurDebt;
        totalDebtMKD += fs.mkdDebt;

        doc.text(String(u.name).slice(0, 28), colX.name, y);
        doc.text(joined, colX.joined, y);
        doc.text(String(fs.orders), colX.orders, y);
        doc.text(String(Math.round(fs.eurDebt)).padStart(1), colX.debtEUR, y);
        doc.text(String(Math.round(fs.mkdDebt)).padStart(1), colX.debtMKD, y);

        // row separator
        doc.setDrawColor(220);
        doc.line(margin, y + 1.2, pageWidth - margin, y + 1.2);
        y += lineHeight + 1.5;
      }

      // Totals Section
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 20;
      }
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Totals (Debt Only)', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Debt EUR: ${Math.round(totalDebtEUR)} EUR`, margin, y);
      y += 5;
      doc.text(`Total Debt MKD: ${Math.round(totalDebtMKD)} MKD`, margin, y);

      const fileName = `users-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Users report generated');
    } catch (err) {
      console.error('Error generating users report:', err);
      toast.error('Failed to generate users report');
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user accounts and permissions
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Search Users */}
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <input
              type="text"
              placeholder="Search by client name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary w-full sm:w-auto"
          >
            <User className="h-4 w-4 mr-2" />
            Add Client
          </button>
        </div>
      </div>



       {/* Users List */}
       <div className="card w-full">
         <div className="card-header">
           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
             <h3 className="text-lg font-medium text-gray-900">All Users</h3>
             <button
               onClick={generateUsersReport}
               className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
               title="Generate full users report"
             >
               <Download className="h-4 w-4" />
               Generate Report
             </button>
           </div>
         </div>
         <div className="card-body p-0">
           {users.length > 0 ? (
                         <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                   <tr>
                     <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                       User
                     </th>
                     <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                       Role
                     </th>
                     <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] hidden sm:table-cell">
                       Joined
                     </th>
                     <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]">
                       Revenue (EUR/MKD)
                     </th>
                     <th className="px-2 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]">
                       Debt (EUR/MKD)
                     </th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-gray-200">
                   {users.map((user) => (
                     <tr 
                       key={user.id} 
                       className={`hover:bg-gray-50 ${user.role === 'client' ? 'cursor-pointer' : ''}`}
                       onClick={user.role === 'client' ? () => handleViewProfile(user.id) : undefined}
                     >
                       <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[200px]">
                         <div className="flex items-center min-w-0">
                           <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                             <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary-100 flex items-center justify-center">
                               <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600" />
                             </div>
                           </div>
                           <div className="ml-2 sm:ml-4 min-w-0 flex-1">
                             <div className="text-sm font-medium text-gray-900 truncate">
                               {user.name}
                             </div>
                             <div className="text-xs sm:text-sm text-gray-500 truncate">
                               {user.email || user.phone || 'No contact info'}
                             </div>
                           </div>
                         </div>
                       </td>
                       <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[100px]">
                         <span className={`badge-${getRoleColor(user.role)} text-xs`}>
                           {user.role}
                         </span>
                       </td>
                       <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-gray-500 hidden sm:table-cell min-w-[120px]">
                         {new Date(user.created_at).toLocaleDateString()}
                       </td>
                       <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[140px]">
                         {user.role === 'client' ? (
                           <div className="flex items-center gap-2">
                             <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 whitespace-nowrap">
                               € {(userFinancialData[user.id]?.revenueEUR ?? 0).toFixed(0)}
                             </span>
                             <span className="text-[11px] font-medium text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 whitespace-nowrap">
                               {(userFinancialData[user.id]?.revenueMKD ?? 0).toFixed(0)} MKD
                             </span>
                           </div>
                         ) : (
                           <span className="text-sm text-gray-400">-</span>
                         )}
                       </td>
                       <td className="px-2 sm:px-4 lg:px-6 py-4 min-w-[140px]">
                         {user.role === 'client' ? (
                           <div className="flex items-center gap-2">
                             <span className="text-[11px] font-medium text-red-700 bg-red-100 px-2 py-1 rounded border border-red-700 whitespace-nowrap">
                               € {(userFinancialData[user.id]?.debtEUR ?? 0).toFixed(0)}
                             </span>
                             <span className="text-[11px] font-medium text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200 whitespace-nowrap">
                               {(userFinancialData[user.id]?.debtMKD ?? 0).toFixed(0)} MKD
                             </span>
                           </div>
                         ) : (
                           <span className="text-sm text-gray-400">-</span>
                         )}
                       </td>
                     </tr>
                   ))}
                 </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search criteria.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
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

      {/* User Statistics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 w-full">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-md bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                  <dd className="text-lg font-medium text-gray-900">{users.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-md bg-purple-100">
                <Shield className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Admins</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {users.filter(user => user.role === 'admin').length}
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
                <User className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Clients</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {users.filter(user => user.role === 'client').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={handleCloseProfileModal}
        userId={selectedUserId}
        onDeleteUser={deleteUser}
      />

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 !mt-0">
          <div className="relative top-10 mx-auto p-6 border w-11/12 max-w-md shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Client</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={createUserForm.name}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                    className="input w-full"
                    placeholder="Enter client name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={createUserForm.phone}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, phone: e.target.value })}
                    className="input w-full"
                    placeholder="Enter phone number (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    className="input w-full"
                    placeholder="Enter email (optional)"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-6">
                <button
                  onClick={createUser}
                  className="btn-primary flex-1"
                  disabled={!createUserForm.name.trim()}
                >
                  Create Client
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersList; 