import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Settings as SettingsIcon,
  Save,
  Building2,
  MapPin,
  Phone,
  Mail
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    company_name: '',
    company_address: '',
    company_city_state: '',
    company_phone: '',
    company_email: '',
    smartphone_subcategories: [],
    accessory_subcategories: [],
    smartphone_models: []
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await axios.put('/api/settings', settings);
      toast.success('Settings updated successfully');
    } catch (error) {
      console.error('Error updating settings:', error);
      
      if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map(err => err.msg).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error(error.response?.data?.message || 'Failed to update settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your company information and system settings
          </p>
        </div>
        <div className="flex items-center text-gray-400">
          <SettingsIcon className="h-6 w-6" />
        </div>
      </div>

      {/* 2-Column Layout for Settings Form and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Company Information
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name - Full Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={settings.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className="input"
                  placeholder="Enter company name"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This name will appear on invoices and receipts
                </p>
              </div>

              {/* 2-Column Layout for Address Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                    <input
                      type="text"
                      value={settings.company_address}
                      onChange={(e) => handleChange('company_address', e.target.value)}
                      className="input"
                      placeholder="Enter company address"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City & State
                  </label>
                  <input
                    type="text"
                    value={settings.company_city_state}
                    onChange={(e) => handleChange('company_city_state', e.target.value)}
                    className="input"
                    placeholder="e.g., New York, NY 10001"
                  />
                </div>
              </div>

              {/* 2-Column Layout for Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-gray-400 mr-2" />
                    <input
                      type="tel"
                      value={settings.company_phone}
                      onChange={(e) => handleChange('company_phone', e.target.value)}
                      className="input"
                      placeholder="e.g., (555) 123-4567"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-2" />
                    <input
                      type="email"
                      value={settings.company_email}
                      onChange={(e) => handleChange('company_email', e.target.value)}
                      className="input"
                      placeholder="e.g., info@company.com"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full"
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Subcategory Management */}
            <div className="mt-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Subcategory Management</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Smartphone subcategories */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Smartphone Subcategories</label>
                  <div className="space-y-2">
                    {settings.smartphone_subcategories?.map((item, idx) => (
                      <div key={`ss-${idx}`} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const list = [...(settings.smartphone_subcategories || [])];
                            list[idx] = e.target.value;
                            handleChange('smartphone_subcategories', list);
                          }}
                          className="input flex-1"
                        />
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => {
                            const list = (settings.smartphone_subcategories || []).filter((_, i) => i !== idx);
                            handleChange('smartphone_subcategories', list);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleChange('smartphone_subcategories', [...(settings.smartphone_subcategories || []), ''])}
                    >
                      Add Smartphone Subcategory
                    </button>
                  </div>
                </div>

                {/* Accessory subcategories */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Accessory Subcategories</label>
                  <div className="space-y-2">
                    {settings.accessory_subcategories?.map((item, idx) => (
                      <div key={`as-${idx}`} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const list = [...(settings.accessory_subcategories || [])];
                            list[idx] = e.target.value;
                            handleChange('accessory_subcategories', list);
                          }}
                          className="input flex-1"
                        />
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => {
                            const list = (settings.accessory_subcategories || []).filter((_, i) => i !== idx);
                            handleChange('accessory_subcategories', list);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleChange('accessory_subcategories', [...(settings.accessory_subcategories || []), ''])}
                    >
                      Add Accessory Subcategory
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Preview Section */}
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Preview</h3>
            <div className="bg-gray-50 p-4 rounded-lg border ">
              <div className="space-y-2">
                <h4 className="font-bold text-lg">{settings.company_name}</h4>
                {settings.company_address && (
                  <p className="text-sm text-gray-600">{settings.company_address}</p>
                )}
                {settings.company_city_state && (
                  <p className="text-sm text-gray-600">{settings.company_city_state}</p>
                )}
                {settings.company_phone && (
                  <p className="text-sm text-gray-600">Phone: {settings.company_phone}</p>
                )}
                {settings.company_email && (
                  <p className="text-sm text-gray-600">Email: {settings.company_email}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                This is how your company information will appear on invoices
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 