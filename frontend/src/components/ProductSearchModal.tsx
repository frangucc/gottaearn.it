import React, { useState } from 'react';
import { X, Search, Plus, Check, ExternalLink, Loader2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ProductPreviewModal } from './ProductPreviewModal';

interface Product {
  asin: string;
  title: string;
  price?: number;
  priceString?: string;
  image?: string;
  rating?: number;
  ratingsTotal?: number;
  brand?: string;
  link?: string;
  isPrime?: boolean;
  isBestseller?: boolean;
  isAmazonChoice?: boolean;
  availability?: string;
}

interface SearchResult {
  searchTerm: string;
  products: Product[];
  totalResults: number;
  page: number;
  hasNextPage: boolean;
}

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductsAdded: (count: number) => void;
}

export function ProductSearchModal({ isOpen, onClose, onProductsAdded }: ProductSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedProductsForPreview, setSelectedProductsForPreview] = useState<Product[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);
    setSelectedProducts(new Set());

    try {
      const response = await axios.post('/api/v1/products/search', {
        searchTerm: searchTerm.trim(),
        maxResults: 20
      });

      if (response.data.success) {
        // Deduplicate products by ASIN to prevent duplicate entries
        const uniqueProducts = response.data.data.products.reduce((acc: any[], product: any) => {
          if (!acc.find(p => p.asin === product.asin)) {
            acc.push(product);
          }
          return acc;
        }, []);
        
        console.log(`🔍 Search Results: ${response.data.data.products.length} total, ${uniqueProducts.length} unique products`);
        
        const deduplicatedData = {
          ...response.data.data,
          products: uniqueProducts
        };
        
        setSearchResults(deduplicatedData);
        toast.success(`Found ${uniqueProducts.length} unique products`);
      } else {
        toast.error('Search failed');
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast.error(error.response?.data?.error || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleProductSelection = (asin: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(asin)) {
      newSelected.delete(asin);
    } else {
      newSelected.add(asin);
    }
    setSelectedProducts(newSelected);
  };

  const handleAddSelected = () => {
    if (selectedProducts.size === 0) {
      toast.error('Please select at least one product');
      return;
    }

    if (!searchResults) return;

    // Get selected product data and show preview modal
    const selectedProductData = searchResults.products.filter(
      product => selectedProducts.has(product.asin)
    );

    setSelectedProductsForPreview(selectedProductData);
    setShowPreviewModal(true);
  };

  const handlePreviewConfirm = async (productsWithSegmentation: any[]) => {
    console.log('🚀 Frontend: handlePreviewConfirm called with:', productsWithSegmentation?.length, 'products');
    setIsAdding(true);
    setShowPreviewModal(false);

    try {
      console.log('🔍 Frontend: Raw productsWithSegmentation data:', productsWithSegmentation);
      
      // Now use the existing add-selected endpoint but with the edited segmentation data
      const productsToAdd = productsWithSegmentation.map(item => ({
        ...item.product,
        aiSegmentation: item.segmentation
      }));

      console.log('📦 Frontend: Mapped productsToAdd data:', productsToAdd);
      console.log('🎯 Frontend: First product aiSegmentation:', productsToAdd[0]?.aiSegmentation);

      console.log('📡 Frontend: About to make API request to /api/v1/products/add-selected-with-segmentation');
      
      const response = await axios.post('/api/v1/products/add-selected-with-segmentation', {
        products: productsToAdd,
        searchTerm: searchResults?.searchTerm
      });

      console.log('✅ Frontend: API response received:', response.data);
      console.log('🔍 Frontend: Response data structure:', {
        success: response.data.success,
        dataType: typeof response.data.data,
        dataKeys: response.data.data ? Object.keys(response.data.data) : null,
        added: response.data.data?.added,
        failed: response.data.data?.failed
      });

      if (response.data.success) {
        const { added, failed } = response.data.data;
        
        console.log(`📊 Frontend: Processing results - Added: ${added}, Failed: ${failed}`);
        
        if (added > 0) {
          toast.success(`Successfully added ${added} products with AI segmentation!`);
          onProductsAdded?.(added);
        }
        
        if (failed > 0) {
          toast.error(`Failed to add ${failed} products`);
        }
        
        // Always show success if we got a successful response, even if no products were processed
        if (added === 0 && failed === 0) {
          toast.success('Products processed successfully');
        }

        // Reset state
        setSearchResults(null);
        setSelectedProducts(new Set());
        setSearchTerm('');
        setSelectedProductsForPreview([]);
        
        if (added > 0) {
          onClose();
        }
      } else {
        toast.error('Failed to add products');
      }
    } catch (error: any) {
      console.error('Add products error:', error);
      toast.error(error.response?.data?.error || 'Failed to add products');
    } finally {
      setIsAdding(false);
    }
  };

  const handlePreviewCancel = () => {
    setShowPreviewModal(false);
    setSelectedProductsForPreview([]);
  };

  const formatPrice = (product: Product) => {
    if (product.priceString) return product.priceString;
    if (product.price) return `$${product.price.toFixed(2)}`;
    return 'Price not available';
  };

  const formatRating = (rating?: number, total?: number) => {
    if (!rating) return null;
    return (
      <div className="flex items-center text-sm text-gray-600">
        <div className="flex items-center">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className={`text-xs ${
                i < Math.floor(rating) ? 'text-yellow-400' : 'text-gray-300'
              }`}
            >
              ★
            </span>
          ))}
        </div>
        <span className="ml-1">
          {rating.toFixed(1)} {total && `(${total.toLocaleString()})`}
        </span>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block w-full max-w-6xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Search Amazon Products
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search for products (e.g., 'gaming headset', 'nike shoes')..."
                  className="input pl-10"
                  disabled={isSearching}
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchTerm.trim()}
                className="btn-primary"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Search Results */}
          {searchResults && (
            <div>
              {/* Results Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-md font-medium text-gray-900">
                    Search Results for "{searchResults.searchTerm}"
                  </h4>
                  <p className="text-sm text-gray-600">
                    {searchResults.products.length} products found
                    {selectedProducts.size > 0 && ` • ${selectedProducts.size} selected`}
                  </p>
                </div>
                
                {selectedProducts.size > 0 && (
                  <button
                    onClick={handleAddSelected}
                    disabled={isAdding}
                    className="btn-primary"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Selected ({selectedProducts.size})
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Products Grid */}
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <div className="grid gap-4 p-4">
                  {searchResults.products.map((product, index) => {
                    const isSelected = selectedProducts.has(product.asin);
                    
                    return (
                      <div
                        key={`${product.asin}-${index}`}
                        className={`flex items-start space-x-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-primary-500 bg-primary-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleProductSelection(product.asin)}
                      >
                        {/* Checkbox */}
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected 
                              ? 'border-primary-500 bg-primary-500' 
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>

                        {/* Product Image */}
                        <div className="flex-shrink-0">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-16 h-16 object-cover rounded-lg bg-gray-100"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                            {product.title}
                          </h5>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                            <span className="font-medium text-gray-900">
                              {formatPrice(product)}
                            </span>
                            {product.brand && (
                              <span>by {product.brand}</span>
                            )}
                          </div>

                          {formatRating(product.rating, product.ratingsTotal)}

                          {/* Badges */}
                          <div className="flex items-center space-x-2 mt-2">
                            {product.isPrime && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Prime
                              </span>
                            )}
                            {product.isBestseller && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                Bestseller
                              </span>
                            )}
                            {product.isAmazonChoice && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Amazon's Choice
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0">
                          {product.link && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(product.link, '_blank');
                              }}
                              className="p-2 text-gray-400 hover:text-gray-600"
                              title="View on Amazon"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!searchResults && !isSearching && (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                Search Amazon Products
              </h4>
              <p className="text-gray-600">
                Enter a search term above to find products to add to your catalog.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Product Preview Modal */}
      <ProductPreviewModal
        isOpen={showPreviewModal}
        products={selectedProductsForPreview}
        onClose={handlePreviewCancel}
        onConfirm={handlePreviewConfirm}
      />
    </div>
  );
}
