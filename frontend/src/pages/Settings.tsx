import React from 'react';
import { Settings as SettingsIcon, User, Key, Bell, Palette } from 'lucide-react';

export function Settings() {
  return (
    <div className="px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and application preferences</p>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <SettingsIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Settings Coming Soon
          </h3>
          <p className="text-gray-500">
            User preferences and configuration options will be available here.
          </p>
        </div>
      </div>
    </div>
  );
}
