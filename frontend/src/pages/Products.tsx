import { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Plus, 
  MoreVertical,
  Star,
  ExternalLink,
  Edit,
  Trash2,
  Package
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProductSearchModal } from '../components/ProductSearchModal';

// GraphQL queries
const GET_PRODUCTS = gql`
  query GetProducts($limit: Int, $offset: Int) {
    products(limit: $limit, offset: $offset) {
      id
      asin
      title
      price
      image
      rating
      ratingsTotal
      createdAt
      categories {
        id
        name
        ageGroup
        gender
      }
    }
  }
`;

const GET_PRODUCTS_BY_SEGMENT = gql`
  query GetProductsBySegment($ageRange: String!, $gender: String!, $category: String) {
    productsBySegment(ageRange: $ageRange, gender: $gender, category: $category) {
      id
      asin
      title
      price
      image
      rating
      ratingsTotal
      createdAt
      categories {
        id
        name
        ageGroup
        gender
      }
    }
  }
`;

interface Product {
  id: string;
  asin: string;
  title: string;
  price?: number;
  image?: string;
  rating?: number;
  ratingsTotal?: number;
  createdAt: string;
  categories: Array<{
    id: string;
    name: string;
    ageGroup: string;
    gender: string;
  }>;
}

function ProductCard({ product }: { product: Product }) {
  const [showMenu, setShowMenu] = useState(false);

  const handleEdit = () => {
    toast.success('Edit functionality coming soon!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    toast.error('Delete functionality coming soon!');
    setShowMenu(false);
  };

  const handleViewAmazon = () => {
    window.open(`https://amazon.com/dp/${product.asin}`, '_blank');
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start space-x-4">
        {/* Product Image */}
        <div className="flex-shrink-0">
          {product.image ? (
            <img
              src={product.image}
              alt={product.title}
              className="w-20 h-20 object-cover rounded-lg bg-gray-100"
              onError={(e) => {
                e.currentTarget.src = '';
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                {product.title}
              </h3>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500 mb-2">
                <span>ASIN: {product.asin}</span>
                {product.price && (
                  <span className="font-medium text-gray-900">${product.price}</span>
                )}
              </div>

              {/* Rating */}
              {product.rating && (
                <div className="flex items-center space-x-1 mb-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.floor(product.rating!)
                            ? 'text-yellow-400 fill-current'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">
                    {product.rating} ({product.ratingsTotal?.toLocaleString()} reviews)
                  </span>
                </div>
              )}

              {/* Categories */}
              <div className="flex flex-wrap gap-1 mb-2">
                {product.categories.map((category) => (
                  <span
                    key={category.id}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                  >
                    {category.name}
                  </span>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                Added {new Date(product.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                  <div className="py-1">
                    <button
                      onClick={handleViewAmazon}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on Amazon
                    </button>
                    <button
                      onClick={handleEdit}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Product
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Product
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Products() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedPriceRange, setSelectedPriceRange] = useState('');
  // Active AgeGroups used for filtering (can include multiple when coming from a segment range)
  const [activeAgeGroups, setActiveAgeGroups] = useState<string[]>([]);

  
  const [searchParams] = useSearchParams();
  
  // Check if we have segment parameters
  const ageRange = searchParams.get('ageRange');
  const gender = searchParams.get('gender');
  const category = searchParams.get('category');
  const hasSegmentParams = Boolean(ageRange && gender);
  
  // Use segment query if we have segment parameters, otherwise use regular products query
  const { data: segmentData, loading: segmentLoading, error: segmentError } = useQuery(GET_PRODUCTS_BY_SEGMENT, {
    variables: { 
      ageRange: ageRange || '', 
      gender: gender?.toUpperCase() || '', 
      category: category || undefined 
    },
    skip: !hasSegmentParams,
    notifyOnNetworkStatusChange: true,
  });
  
  const { data: regularData, loading: regularLoading, error: regularError, fetchMore, refetch } = useQuery(GET_PRODUCTS, {
    variables: { limit: 20, offset: 0 },
    skip: hasSegmentParams,
    notifyOnNetworkStatusChange: true,
  });
  
  // Use the appropriate data source
  const data = hasSegmentParams ? { products: segmentData?.productsBySegment || [] } : regularData;
  const loading = hasSegmentParams ? segmentLoading : regularLoading;
  const error = hasSegmentParams ? segmentError : regularError;
  
  // Helper function to map AgeRange to AgeGroup enums
  const ageRangeToAgeGroup = (ageRange: string): string[] => {
    const mapping: Record<string, string[]> = {
      'AGE_10_12': ['CHILD', 'TEEN'],
      'AGE_13_15': ['TEEN'], 
      'AGE_16_18': ['TEEN', 'YOUNG_ADULT'],
      'AGE_19_21': ['TEEN', 'YOUNG_ADULT', 'ADULT'], // Include TEEN for overlap
    };
    return mapping[ageRange] || [];
  };
  
  // Read URL parameters and set filters on component mount
  useEffect(() => {
    const category = searchParams.get('category');
    const ageRange = searchParams.get('ageRange');
    const gender = searchParams.get('gender');
    
    if (category) {
      setSelectedCategory(category);
      setShowFilters(true); // Show filters when coming from segment navigation
    }
    if (ageRange) {
      // Set the age range directly since we're now using AgeRange enum
      setSelectedAgeGroup(ageRange);
      setActiveAgeGroups([ageRange]);
      setShowFilters(true);
    }
    if (gender) {
      setSelectedGender(gender.toLowerCase());
      setShowFilters(true);
    }
  }, [searchParams]);

  const handleAddProduct = () => {
    setShowSearchModal(true);
  };

  const handleProductsAdded = (count: number) => {
    // Refetch products to show newly added ones
    refetch();
    toast.success(`Successfully added ${count} products!`);
  };

  const handleLoadMore = () => {
    if (data?.products) {
      fetchMore({
        variables: {
          offset: data.products.length,
        },
      });
    }
  };

  if (loading && !data) {
    return (
      <div className="px-6">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card">
              <div className="flex items-start space-x-4">
                <div className="w-20 h-20 bg-gray-200 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6">
        <div className="card bg-red-50 border-red-200">
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">
              Error loading products
            </h3>
            <p className="text-red-600">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const products = data?.products || [];
  
  // Debug logging
  console.log('Products loaded:', products.length);
  console.log('Selected filters:', { selectedCategory, selectedGender, selectedAgeGroup, activeAgeGroups, selectedPriceRange });
  if (products.length > 0) {
    console.log('Sample product:', products[0]);
    console.log('All product categories:', products.map((p: Product) => p.categories.map(c => c.name)).flat());
  }
  
  const filteredProducts = products.filter((product: Product) => {
    // Text search filter
    const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.asin.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Category filter - if product has no categories, show all products when no specific category is selected
    const matchesCategory = !selectedCategory || 
      (product.categories?.length > 0 ? 
        product.categories.some(cat => {
          const catName = cat.name.toLowerCase();
          const selectedCat = selectedCategory.toLowerCase();
          
          // Direct matches
          if (catName.includes(selectedCat) || selectedCat.includes(catName)) {
            return true;
          }
          
          // General products match any category
          if (catName === 'general') {
            return true;
          }
          
          // Related category mappings
          const categoryMappings: Record<string, string[]> = {
            'toys': ['gaming', 'collectibles', 'building'],
            'gaming': ['toys', 'collectibles', 'entertainment'],
            'beauty': ['cosmetics', 'skincare', 'fragrance'],
            'fashion': ['clothing', 'accessories', 'jewelry']
          };
          
          const relatedCategories = categoryMappings[selectedCat] || [];
          return relatedCategories.some((related: string) => catName.includes(related));
        })
        : true // Products without categories match all category filters
      );
    
    // Gender filter - if product has no categories, ignore gender filter
    const matchesGender = !selectedGender ||
      (product.categories?.length > 0 ? 
        product.categories.some(cat => 
          cat.gender && (
            cat.gender.toLowerCase() === selectedGender.toLowerCase() ||
            cat.gender.toLowerCase() === 'unisex'
          )
        )
        : true // Products without categories match all gender filters
      );
    
    // Age group filter - if product has no categories, ignore age filter
    const matchesAgeGroup = activeAgeGroups.length === 0 || 
      (product.categories?.length > 0 ? 
        product.categories.some(cat => {
          if (!cat.ageGroup) return false;
          const productAgeGroup = String(cat.ageGroup).toUpperCase();
          
          // Check if any active age ranges map to this product's age group
          return activeAgeGroups.some(ageRange => {
            const mappedAgeGroups = ageRangeToAgeGroup(ageRange);
            return mappedAgeGroups.some(mapped => mapped.toUpperCase() === productAgeGroup);
          });
        })
        : true // Products without categories match all age filters
      );
    
    // Price filter
    const matchesPrice = !selectedPriceRange || (() => {
      if (!product.price) return true;
      const [min, max] = selectedPriceRange.includes('+') 
        ? [parseInt(selectedPriceRange.replace('+', '')), Infinity]
        : selectedPriceRange.split('-').map(p => parseInt(p));
      return product.price >= min && (max === Infinity || product.price <= max);
    })();
    
    const result = matchesSearch && matchesCategory && matchesGender && matchesAgeGroup && matchesPrice;
    
    // Debug logging for first few products when filters are active
    if ((selectedCategory || selectedGender) && products.indexOf(product) < 3) {
      console.log(`Product: ${product.title}`);
      console.log(`  Categories: ${product.categories.map(c => c.name).join(', ')}`);
      console.log(`  Genders: ${product.categories.map(c => c.gender).join(', ')}`);
      console.log(`  AgeGroups: ${product.categories.map(c => c.ageGroup).join(', ')}`);
      console.log(`  ActiveAgeGroups: ${activeAgeGroups.join(', ')}`);
      console.log(`  MappedAgeGroups: ${activeAgeGroups.map(ar => ageRangeToAgeGroup(ar).join('|')).join(', ')}`);
      console.log(`  Matches - Category: ${matchesCategory}, Gender: ${matchesGender}, AgeGroup: ${matchesAgeGroup}, Overall: ${result}`);
    }
    
    return result;
  });
  
  const hasActiveFilters = Boolean(selectedCategory || selectedGender || selectedAgeGroup || selectedPriceRange || searchTerm);

  return (
    <div className="px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600">
            {hasActiveFilters
              ? `Showing ${filteredProducts.length} of ${products.length} products`
              : `Manage your curated Amazon products (${products.length} total)`}
          </p>
        </div>
        
        <button
          onClick={handleAddProduct}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search products by title or ASIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-outline"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Category</label>
                <select 
                  className="input"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  <option value="gaming">Gaming</option>
                  <option value="fashion">Fashion</option>
                  <option value="electronics">Electronics</option>
                  <option value="toys">Toys</option>
                  <option value="books">Books</option>
                  <option value="sports">Sports</option>
                </select>
              </div>
              
              <div>
                <label className="label">Age Group</label>
                <select 
                  className="input"
                  value={selectedAgeGroup}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAgeGroup(val);
                    setActiveAgeGroups(val ? [val] : []);
                  }}
                >
                  <option value="">All Ages</option>
                  <option value="AGE_10_12">Ages 10-12</option>
                  <option value="AGE_13_15">Ages 13-15</option>
                  <option value="AGE_16_18">Ages 16-18</option>
                  <option value="AGE_19_21">Ages 19-21</option>
                </select>
              </div>
              
              <div>
                <label className="label">Gender</label>
                <select 
                  className="input"
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                >
                  <option value="">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="unisex">Unisex</option>
                </select>
              </div>
              
              <div>
                <label className="label">Price Range</label>
                <select 
                  className="input"
                  value={selectedPriceRange}
                  onChange={(e) => setSelectedPriceRange(e.target.value)}
                >
                  <option value="">Any Price</option>
                  <option value="0-25">$0 - $25</option>
                  <option value="25-50">$25 - $50</option>
                  <option value="50-100">$50 - $100</option>
                  <option value="100+">$100+</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Products List */}
      {filteredProducts.length > 0 ? (
        <div className="space-y-4">
          {filteredProducts.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
          
          {/* Load More Button */}
          {products.length >= 20 && (
            <div className="text-center py-6">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="btn-outline"
              >
                {loading ? 'Loading...' : 'Load More Products'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? `No products match "${searchTerm}". Try adjusting your search.`
                : 'Start by adding some products to your catalog.'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={handleAddProduct}
                className="btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Product
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Product Search Modal */}
      <ProductSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onProductsAdded={handleProductsAdded}
      />
    </div>
  );
}
