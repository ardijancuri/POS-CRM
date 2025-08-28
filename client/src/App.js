import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

import AdminDashboard from './pages/admin/Dashboard';
import AdminInventory from './pages/admin/Inventory';
import AdminOrders from './pages/admin/Orders';
import AdminServices from './pages/admin/Services';
import AdminUsers from './pages/admin/Users';
import AdminSettings from './pages/admin/Settings';
import AdminProductsPage from './pages/admin/Products';
import LoadingSpinner from './components/LoadingSpinner';

const PrivateRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const App = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Public routes */}
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} 
        />


        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminDashboard />
              </Layout>
            </PrivateRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin/inventory"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminInventory />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/products"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminProductsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminOrders />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/services"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminServices />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminUsers />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <PrivateRoute requireAdmin>
              <Layout>
                <AdminSettings />
              </Layout>
            </PrivateRoute>
          }
        />

        {/* No client routes - admin only */}

        {/* Default redirect */}
        <Route 
          path="/" 
          element={<Navigate to="/dashboard" replace />} 
        />
        <Route 
          path="*" 
          element={<Navigate to="/dashboard" replace />} 
        />
      </Routes>
    </div>
  );
};

export default App; 