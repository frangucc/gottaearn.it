import { useState, useEffect } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
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
  Package,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProductSearchModal } from '../components/ProductSearchModal';
import { ProductPreviewModal } from '../components/ProductPreviewModal';

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
      brand
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

const GET_FILTER_OPTIONS = gql`
  query GetFilterOptions {
    filterOptions {
      categories
      ageRanges
      genders
      priceRanges {
        label
        min
        max
      }
    }
  }
`;

const DELETE_PRODUCT = gql`
  mutation DeleteProduct($id: ID!) {
    deleteProduct(id: $id) {
      success
      message
    }
  }
`;

const UPDATE_PRODUCT = gql`
  mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
    updateProduct(id: $id, input: $input) {
      success
      message
      product {
        id
        asin
        title
        price
        image
        brand
        rating
        createdAt
        categories {
          id
          name
          ageGroup
          gender
        }
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

function ProductCard({ product, onEdit, onDelete }: { 
  product: Product; 
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const handleEdit = () => {
    onEdit(product);
    setShowMenu(false);
  };

  const handleDelete = () => {
    onDelete(product.id);
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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

  // Get dynamic filter options
  const { data: filterOptionsData } = useQuery(GET_FILTER_OPTIONS);
  
  // Use the appropriate data source
  const data = hasSegmentParams ? { products: segmentData?.productsBySegment || [] } : regularData;
  const loading = hasSegmentParams ? segmentLoading : regularLoading;
  const error = hasSegmentParams ? segmentError : regularError;
  
  // GraphQL mutations
  const [deleteProductMutation] = useMutation(DELETE_PRODUCT);
  const [updateProductMutation] = useMutation(UPDATE_PRODUCT);
  
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

  const handleDeleteProduct = async (productId: string) => {
    try {
      const result = await deleteProductMutation({
        variables: { id: productId },
        refetchQueries: [{ query: GET_PRODUCTS, variables: { limit: 20, offset: 0 } }]
      });
      
      if (result.data?.deleteProduct?.success) {
        toast.success('Product deleted successfully!');
      } else {
        toast.error(result.data?.deleteProduct?.message || 'Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  const handleUpdateProduct = async (updatedData: any) => {
    if (!editingProduct) return;
    
    try {
      const result = await updateProductMutation({
        variables: { 
          id: editingProduct.id, 
          input: updatedData 
        },
        refetchQueries: [{ query: GET_PRODUCTS, variables: { limit: 20, offset: 0 } }]
      });
      
      if (result.data?.updateProduct?.success) {
        toast.success('Product updated successfully!');
        setShowEditModal(false);
        setEditingProduct(null);
      } else {
        toast.error(result.data?.updateProduct?.message || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
    }
  };

  const handleClearFilters = () => {
    setSelectedCategory('');
    setSelectedAgeGroup('');
    setSelectedGender('');
    setSelectedPriceRange('');
    setActiveAgeGroups([]);
    setSearchTerm('');
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
  
  // Apply text search and price filters (segment filtering handles category/gender/age)
  const filteredProducts = products.filter((product: Product) => {
    // Text search filter
    const matchesSearch = !searchTerm || 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.asin.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Price filter
    const matchesPrice = !selectedPriceRange || (() => {
      if (!product.price) return true;
      const [min, max] = selectedPriceRange.includes('+') 
        ? [parseInt(selectedPriceRange.replace('+', '')), Infinity]
        : selectedPriceRange.split('-').map(p => parseInt(p));
      return product.price >= min && (max === Infinity || product.price <= max);
    })();
    
    return matchesSearch && matchesPrice;
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
          
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn btn-secondary"
            >
              <Filter className="w-4 h-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="btn btn-outline"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </button>
            )}
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
                    {filterOptionsData?.filterOptions?.categories?.map((category: string) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
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
                    {filterOptionsData?.filterOptions?.ageRanges?.map((ageRange: string) => {
                      const label = ageRange.replace('AGE_', '').replace('_', '-');
                      return <option key={ageRange} value={ageRange}>Ages {label}</option>;
                    })}
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
                    {filterOptionsData?.filterOptions?.genders?.map((gender: string) => (
                      <option key={gender} value={gender.toLowerCase()}>
                        {gender.charAt(0) + gender.slice(1).toLowerCase()}
                      </option>
                    ))}
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
                    {filterOptionsData?.filterOptions?.priceRanges?.map((priceRange: any) => {
                      const value = priceRange.max ? `${priceRange.min}-${priceRange.max}` : `${priceRange.min}+`;
                      return <option key={value} value={value}>{priceRange.label}</option>;
                    })}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products List */}
      {filteredProducts.length > 0 ? (
        <div className="space-y-4">
          {filteredProducts.map((product: Product) => (
            <ProductCard
              key={product.asin}
              product={product}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
            />
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
      {showSearchModal && (
        <ProductSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onProductsAdded={handleProductsAdded}
        />
      )}
      
      {showEditModal && editingProduct && (
        <ProductPreviewModal
          products={[editingProduct]}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          onConfirm={(productsWithSegmentation) => {
            if (productsWithSegmentation.length > 0) {
              const product = productsWithSegmentation[0];
              handleUpdateProduct({
                brand: product.brand,
                categories: product.selectedCategories,
                ageRanges: product.selectedAgeRanges,
                gender: product.selectedGender
              });
            }
          }}
        />
      )}
    </div>
  );
}
