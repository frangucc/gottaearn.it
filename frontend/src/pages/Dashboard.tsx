import React from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { 
  Package, 
  Tags, 
  TrendingUp, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign
} from 'lucide-react';

// GraphQL queries
const DASHBOARD_STATS = gql`
  query DashboardStats {
    products(limit: 1000) {
      id
      title
      price
      rating
      createdAt
    }
    categories {
      id
      name
      productCount
    }
  }
`;

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function StatCard({ title, value, change, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600 bg-blue-50',
    green: 'bg-green-500 text-green-600 bg-green-50',
    purple: 'bg-purple-500 text-purple-600 bg-purple-50',
    orange: 'bg-orange-500 text-orange-600 bg-orange-50',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-1">
              {change >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {Math.abs(change)}%
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color].split(' ')[2]}`}>
          <Icon className={`w-6 h-6 ${colorClasses[color].split(' ')[1]}`} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, loading, error } = useQuery(DASHBOARD_STATS);

  if (loading) {
    return (
      <div className="px-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card">
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="w-5 h-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error loading dashboard
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {error.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const products = data?.products || [];
  const categories = data?.categories || [];
  
  // Calculate stats
  const totalProducts = products.length;
  const totalCategories = categories.length;
  const averagePrice = products.length > 0 
    ? products.reduce((sum: number, p: any) => sum + (p.price || 0), 0) / products.length
    : 0;
  const averageRating = products.length > 0
    ? products.reduce((sum: number, p: any) => sum + (p.rating || 0), 0) / products.length
    : 0;

  // Recent products (last 7 days)
  const recentProducts = products.filter((p: any) => {
    const createdAt = new Date(p.createdAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return createdAt > weekAgo;
  });

  return (
    <div className="px-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Products"
          value={totalProducts.toLocaleString()}
          change={12.5}
          icon={Package}
          color="blue"
        />
        <StatCard
          title="Categories"
          value={totalCategories}
          change={5.2}
          icon={Tags}
          color="green"
        />
        <StatCard
          title="Avg. Price"
          value={`$${averagePrice.toFixed(2)}`}
          change={-2.1}
          icon={DollarSign}
          color="purple"
        />
        <StatCard
          title="Avg. Rating"
          value={averageRating.toFixed(1)}
          change={8.3}
          icon={TrendingUp}
          color="orange"
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Products */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Products</h3>
            <span className="text-sm text-gray-500">Last 7 days</span>
          </div>
          
          {recentProducts.length > 0 ? (
            <div className="space-y-3">
              {recentProducts.slice(0, 5).map((product: any) => (
                <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(product.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {product.price && (
                      <span className="text-sm font-medium text-gray-900">
                        ${product.price}
                      </span>
                    )}
                    {product.rating && (
                      <span className="text-xs text-gray-500">
                        ⭐ {product.rating}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No recent products</p>
            </div>
          )}
        </div>

        {/* Top Categories */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Top Categories</h3>
            <span className="text-sm text-gray-500">By product count</span>
          </div>
          
          {categories.length > 0 ? (
            <div className="space-y-3">
              {[...categories]
                .sort((a: any, b: any) => (b.productCount || 0) - (a.productCount || 0))
                .slice(0, 5)
                .map((category: any) => (
                  <div key={category.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-lg flex items-center justify-center mr-3">
                        <Tags className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {category.name}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {category.ageGroup} • {category.gender}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {category.productCount || 0} products
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Tags className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No categories found</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="btn-primary text-left p-4 h-auto">
              <Package className="w-5 h-5 mb-2" />
              <div>
                <p className="font-medium">Add Product</p>
                <p className="text-sm opacity-90">Search and add new products</p>
              </div>
            </button>
            
            <button className="btn-secondary text-left p-4 h-auto">
              <Tags className="w-5 h-5 mb-2" />
              <div>
                <p className="font-medium">Manage Categories</p>
                <p className="text-sm opacity-70">Organize product categories</p>
              </div>
            </button>
            
            <button className="btn-outline text-left p-4 h-auto">
              <TrendingUp className="w-5 h-5 mb-2" />
              <div>
                <p className="font-medium">View Analytics</p>
                <p className="text-sm opacity-70">Check performance metrics</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
