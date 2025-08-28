import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { 
  Package, 
  ShoppingCart, 
  Users, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalUsers: 0,
    totalRevenue: 0,
    eurRevenue: 0,
    mkdRevenue: 0,
    recentOrders: [],
    lowStockProducts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [ordersRes, modelsRes, usersRes, revenueRes] = await Promise.all([
        axios.get('/api/orders?limit=4'),
        axios.get('/api/products/stats/low-stock-models'),
        axios.get('/api/users?limit=5'),
        axios.get('/api/orders/revenue')
      ]);

      const orders = ordersRes.data.orders;
      const lowStockModels = (modelsRes.data.lowStockModels || []).slice(0, 4);

      // Calculate stats
      const totalRevenue = revenueRes.data.totalRevenue || 0;
      const eurRevenue = revenueRes.data.eurRevenue || 0;
      const mkdRevenue = revenueRes.data.mkdRevenue || 0;

      setStats({
        totalOrders: ordersRes.data.pagination.totalOrders,
        totalUsers: usersRes.data.pagination.totalUsers,
        totalRevenue,
        eurRevenue,
        mkdRevenue,
        recentOrders: orders,
        lowStockModels
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'badge bg-green-100 text-green-800';
      case 'pending': return 'badge bg-red-100 text-red-800';
      case 'shipped': return 'badge bg-blue-100 text-blue-800';
      default: return 'badge bg-gray-100 text-gray-800';
    }
  };

  const StatCard = ({ title, value, icon: Icon, change, link, color = 'blue' }) => (
    <div className="card">
      <div className="card-body">
        <div className="flex items-start">
          <div className={`flex-shrink-0 p-3 rounded-md bg-${color}-100`}>
            <Icon className={`h-6 w-6 text-${color}-600`} />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
              {change && (
                <dd className="mt-1">
                  <div className="flex items-center text-sm">
                    {change > 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-400" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-400" />
                    )}
                    <span className={`ml-1 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(change)}% from last month
                    </span>
                  </div>
                </dd>
              )}
            </dl>
          </div>
        </div>
        {link && (
          <div className="mt-4">
            <Link
              to={link}
              className="text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              View all <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your POS CRM system
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          icon={ShoppingCart}
          change={12}
          link="/admin/orders"
          color="blue"
        />

        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          change={8}
          link="/admin/users"
          color="purple"
        />
        <StatCard
          title="EUR Revenue"
          value={`${stats.eurRevenue.toFixed(0)} EUR`}
          icon={DollarSign}
          change={15}
          color="green"
        />
        <StatCard
          title="MKD Revenue"
          value={`${stats.mkdRevenue.toFixed(0)} MKD`}
          icon={DollarSign}
          change={15}
          color="blue"
        />
      </div>



      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Recent Orders</h3>
              <Link
                to="/admin/orders"
                className="text-sm font-medium text-primary-600 hover:text-primary-500"
              >
                View all
              </Link>
            </div>
          </div>
          <div className="card-body">
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                {stats.recentOrders.map((order) => (
                  <li key={order.id} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <ShoppingCart className="h-4 w-4 text-primary-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          Order #{order.id}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.client_name} • {order.total_amount} MKD
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`${getStatusBadgeClass(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Low Stock Models */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Low Stock Models</h3>
              <Link
                to="/admin/inventory"
                className="text-sm font-medium text-primary-600 hover:text-primary-500"
              >
                Manage
              </Link>
            </div>
          </div>
          <div className="card-body">
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                {stats.lowStockModels.map((model) => (
                  <li key={model.model} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                          <Package className="h-4 w-4 text-red-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {model.subcategory || 'N/A'} • {model.model}
                        </p>
                        <p className="text-sm text-gray-500">
                          {model.category} • {model.totalStock} total variations
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {model.outOfStockCount} out of stock • {model.lowStockCount} low stock
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {model.hasOutOfStock && model.hasLowStock ? (
                          <span className="badge bg-red-100 text-red-800">
                            Out of Stock + Low Stock
                          </span>
                        ) : model.hasOutOfStock ? (
                          <span className="badge bg-red-100 text-red-800">
                            Out of Stock
                          </span>
                        ) : (
                          <span className="badge bg-yellow-100 text-yellow-800">
                            Low Stock
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                {stats.lowStockModels.length === 0 && (
                  <li className="py-4 text-center text-sm text-gray-500">
                    All models have sufficient stock
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 