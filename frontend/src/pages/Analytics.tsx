import React from 'react';
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react';

export function Analytics() {
  return (
    <div className="px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600">Track performance and user engagement</p>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Analytics Coming Soon
          </h3>
          <p className="text-gray-500">
            Detailed analytics and reporting features will be available here.
          </p>
        </div>
      </div>
    </div>
  );
}
