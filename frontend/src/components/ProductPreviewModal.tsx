import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Edit3, Check, Wand2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

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

interface AISegmentation {
  success: boolean;
  segments: Array<{
    id: string;
    name: string;
    description?: string;
    ageRange: string;
    gender: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  reasoning: string | null;
  confidence: number;
  // New AI suggestions
  suggestedCategories?: string[];
  suggestedBrand?: string;
  ageRanges?: string[];
  gender?: string;
  metadata?: {
    processedAt: string;
    aiModel: string;
    productAsin: string;
  };
  error?: string;
}

interface ProductWithSegmentation {
  product: Product;
  segmentation: AISegmentation | null;
  isLoading: boolean;
  error?: string;
}

interface ProductPreviewModalProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (productsWithSegmentation: ProductWithSegmentation[]) => void;
}

const AGE_RANGES = [
  { value: 'AGE_10_12', label: '10-12 years' },
  { value: 'AGE_13_15', label: '13-15 years' },
  { value: 'AGE_16_18', label: '16-18 years' },
  { value: 'AGE_19_21', label: '19-21 years' }
];

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'UNISEX', label: 'Unisex' }
];

const CATEGORIES = [
  { value: 'toys', label: 'Toys' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'sports', label: 'Sports' },
  { value: 'books', label: 'Books' },
  { value: 'music', label: 'Music' },
  { value: 'art', label: 'Art' },
  { value: 'collectibles', label: 'Collectibles' },
  { value: 'general', label: 'General' }
];

export function ProductPreviewModal({ products, isOpen, onClose, onConfirm }: ProductPreviewModalProps) {
  const [productsWithSegmentation, setProductsWithSegmentation] = useState<ProductWithSegmentation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize products when modal opens
  useEffect(() => {
    if (isOpen && products.length > 0) {
      // Deduplicate products by ASIN to prevent duplicate processing
      const uniqueProducts = products.filter((product, index, self) => 
        index === self.findIndex(p => p.asin === product.asin)
      );
      
      console.log(`🔧 Deduplication: ${products.length} products → ${uniqueProducts.length} unique`);
      
      const initialProducts = uniqueProducts.map(product => ({
        product,
        segmentation: null,
        isLoading: true
      }));
      setProductsWithSegmentation(initialProducts);
      
      // Start AI segmentation for unique products only
      processAISegmentation(uniqueProducts);
    }
  }, [isOpen, products]);

  const processAISegmentation = async (products: Product[]) => {
    setIsProcessing(true);
    
    try {
      // Get AI segmentation for all products
      const response = await axios.post('/api/v1/products/preview-segmentation', {
        products: products
      });

      console.log('📊 Full API Response:', response.data);
      console.log('🔍 Response success:', response.data.success);
      console.log('📄 Response data:', response.data.data);

      if (response.data.success) {
        const segmentationResults = response.data.data;
        console.log('🤖 AI Segmentation Results:', segmentationResults);
        
        setProductsWithSegmentation(prev => 
          prev.map((item, index) => {
            const aiResult = segmentationResults[index]?.segmentation || null;
            console.log(`Product ${index} (${item.product.title.substring(0, 30)}...):`, aiResult);
            console.log(`🎯 Age Ranges:`, aiResult?.ageRanges);
            console.log(`🎯 Suggested Categories:`, aiResult?.suggestedCategories);
            console.log(`🎯 Suggested Brand:`, aiResult?.suggestedBrand);
            console.log(`🎯 Gender:`, aiResult?.gender);
            console.log(`🔄 Full Structure Check:`, JSON.stringify(aiResult, null, 2));
            return {
              ...item,
              segmentation: aiResult,
              error: segmentationResults[index]?.error,
              isLoading: false
            };
          })
        );
        
        toast.success(`AI analysis complete for ${products.length} products`);
      } else {
        throw new Error('Failed to get AI segmentation');
      }
    } catch (error: any) {
      console.error('AI segmentation error:', error);
      toast.error('Failed to analyze products with AI');
      
      // Mark all as failed
      setProductsWithSegmentation(prev => 
        prev.map(item => ({
          ...item,
          isLoading: false,
          error: 'AI analysis failed'
        }))
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrimarySegmentEdit = (productIndex: number, field: string, value: string) => {
    setProductsWithSegmentation(prev => 
      prev.map((item, index) => {
        if (index === productIndex && item.segmentation) {
          if (item.segmentation.segments && item.segmentation.segments.length > 0) {
            // Update first segment for backward compatibility
            const updatedSegments = [...item.segmentation.segments];
            updatedSegments[0] = {
              ...updatedSegments[0],
              [field]: value
            };
            
            return {
              ...item,
              segmentation: {
                ...item.segmentation,
                segments: updatedSegments,
                // Also update top-level fields for new structure
                ...(field === 'gender' && { gender: value }),
                ...(field === 'brand' && { suggestedBrand: value })
              }
            };
          } else {
            // Direct field update for new structure
            return {
              ...item,
              segmentation: {
                ...item.segmentation,
                ...(field === 'gender' && { gender: value }),
                ...(field === 'brand' && { suggestedBrand: value })
              }
            };
          }
        }
        return item;
      })
    );
  };

  const handleMultiSelectEdit = (productIndex: number, field: string, values: string[]) => {
    setProductsWithSegmentation(prev => 
      prev.map((item, index) => {
        if (index === productIndex && item.segmentation) {
          return {
            ...item,
            segmentation: {
              ...item.segmentation,
              ...(field === 'ageRanges' && { ageRanges: values }),
              ...(field === 'categories' && { suggestedCategories: values })
            }
          };
        }
        return item;
      })
    );
  };

  const handleConfirm = () => {
    // Filter out products that failed to process
    const validProducts = productsWithSegmentation.filter(item => 
      item.segmentation && !item.error && !item.isLoading
    );
    
    if (validProducts.length === 0) {
      toast.error('No valid products to add');
      return;
    }
    
    if (validProducts.length < productsWithSegmentation.length) {
      const failedCount = productsWithSegmentation.length - validProducts.length;
      toast.error(`${failedCount} products will be skipped due to errors`);
    }
    
    onConfirm(validProducts);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Wand2 className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Review AI Segmentation
              </h3>
              <p className="text-sm text-gray-600">
                Review and edit AI suggestions before adding {products.length} products
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isProcessing && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">AI is analyzing your products...</p>
            </div>
          )}

          <div className="space-y-4">
            {productsWithSegmentation.map((item, index) => (
              <ProductEditCard
                key={`${item.product.asin}-${index}`}
                product={item.product}
                segmentation={item.segmentation}
                isLoading={item.isLoading}
                error={item.error}
                onPrimarySegmentEdit={(field, value) => handlePrimarySegmentEdit(index, field, value)}
                onMultiSelectEdit={(field, values) => handleMultiSelectEdit(index, field, values)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              {productsWithSegmentation.filter(p => p.segmentation && !p.error).length} Ready
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              {productsWithSegmentation.filter(p => p.error).length} Failed
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
              {productsWithSegmentation.filter(p => p.isLoading).length} Processing
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || productsWithSegmentation.filter(p => p.segmentation && !p.error).length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Add Products</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual Product Edit Card Component
interface ProductEditCardProps {
  product: Product;
  segmentation: AISegmentation | null;
  isLoading: boolean;
  error?: string;
  onPrimarySegmentEdit: (field: string, value: string) => void;
  onMultiSelectEdit: (field: string, values: string[]) => void;
}

function ProductEditCard({ 
  product, 
  segmentation, 
  isLoading, 
  error, 
  onPrimarySegmentEdit,
  onMultiSelectEdit 
}: ProductEditCardProps) {
  const formatPrice = (product: Product) => {
    if (product.priceString) return product.priceString;
    if (product.price) return `$${product.price.toFixed(2)}`;
    return 'Price not available';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Product Header */}
      <div className="flex items-start space-x-4 mb-4">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-gray-400 text-xs">No Image</span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <h4 className="text-md font-medium text-gray-900 line-clamp-2 mb-2">
            {product.title}
          </h4>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span className="font-medium text-gray-900">
              {formatPrice(product)}
            </span>
            {product.brand && (
              <span>by {product.brand}</span>
            )}
          </div>
        </div>
      </div>

      {/* AI Segmentation Results */}
      {isLoading && (
        <div className="flex items-center space-x-2 text-gray-600 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>AI is analyzing this product...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center space-x-2 text-red-600 py-4">
          <AlertCircle className="w-4 h-4" />
          <span>Failed to analyze: {error}</span>
        </div>
      )}

      {segmentation && !isLoading && !error && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center space-x-2 mb-3">
            <Edit3 className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-gray-900">AI Segmentation Results</span>
            {segmentation.confidence && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {(segmentation.confidence * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Multi-Select Age Ranges */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Age Ranges
                <span className="text-xs text-gray-500 ml-1">(AI suggests: {segmentation.ageRanges?.map(age => AGE_RANGES.find(r => r.value === age)?.label).join(', ') || 'None'})</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {AGE_RANGES.map(range => {
                  const isSelected = segmentation.ageRanges?.includes(range.value) || false;
                  return (
                    <label key={range.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const currentRanges = segmentation.ageRanges || [];
                          const newRanges = e.target.checked 
                            ? [...currentRanges, range.value]
                            : currentRanges.filter(r => r !== range.value);
                          onMultiSelectEdit('ageRanges', newRanges);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{range.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Gender Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gender Target
                <span className="text-xs text-gray-500 ml-1">(AI suggests: {segmentation.gender || 'None'})</span>
              </label>
              <select
                value={segmentation.gender || (segmentation.segments?.[0]?.gender) || 'UNISEX'}
                onChange={(e) => onPrimarySegmentEdit('gender', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {GENDERS.map(gender => (
                  <option key={gender.value} value={gender.value}>
                    {gender.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Multi-Select Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Categories
                <span className="text-xs text-gray-500 ml-1">(AI suggests: {segmentation.suggestedCategories?.join(', ') || 'None'})</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(category => {
                  const isSelected = segmentation.suggestedCategories?.includes(category.value) || false;
                  return (
                    <label key={category.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const currentCategories = segmentation.suggestedCategories || [];
                          const newCategories = e.target.checked 
                            ? [...currentCategories, category.value]
                            : currentCategories.filter(c => c !== category.value);
                          onMultiSelectEdit('categories', newCategories);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{category.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Brand Override */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand Name
                <span className="text-xs text-gray-500 ml-1">(AI suggests: {segmentation.suggestedBrand || product.brand || 'None'})</span>
              </label>
              <input
                type="text"
                value={segmentation.suggestedBrand || product.brand || ''}
                onChange={(e) => onPrimarySegmentEdit('brand', e.target.value)}
                placeholder="Enter brand name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* AI Reasoning */}
          {segmentation.reasoning && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">AI Reasoning:</span> {segmentation.reasoning}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
