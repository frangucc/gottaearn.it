import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Tags, 
  Edit, 
  Trash2, 
  MoreVertical,
  Users,
  Package
} from 'lucide-react';
import toast from 'react-hot-toast';

// GraphQL queries


const GET_SEGMENTS = gql`
  query GetSegments {
    segments {
      id
      name
      ageRange
      gender
      keywords
      categories
      productCount
      confidence
      createdAt
    }
  }
`;

const REFRESH_SEGMENTS = gql`
  mutation RefreshSegments {
    refreshSegments {
      success
      message
      segmentCount
    }
  }
`;



interface Segment {
  id: string;
  name: string;
  ageRange: string;
  gender: string;
  keywords: string[];
  categories: string[];
  productCount: number;
  confidence: number;
  createdAt: string;
}



function SegmentCard({ segment, onProductCountClick }: { segment: Segment; onProductCountClick?: (segment: Segment) => void }) {
  const [showMenu, setShowMenu] = useState(false);

  const getAgeRangeColor = (ageRange: string) => {
    switch (ageRange) {
      case 'AGE_10_12':
      case 'TWEEN_10_12': return 'bg-blue-100 text-blue-800';
      case 'AGE_13_15':
      case 'TEEN_13_15': return 'bg-green-100 text-green-800';
      case 'AGE_16_18':
      case 'TEEN_16_18': return 'bg-green-100 text-green-800';
      case 'AGE_19_21':
      case 'ADULT_19_21': return 'bg-gray-100 text-gray-800';
      // Legacy values
      case 'TODDLER_1_3': return 'bg-pink-100 text-pink-800';
      case 'PRESCHOOL_3_5': return 'bg-purple-100 text-purple-800';
      case 'SCHOOL_AGE_6_12': return 'bg-blue-100 text-blue-800';
      case 'TEEN_13_17': return 'bg-green-100 text-green-800';
      case 'ADULT_18_PLUS': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAgeRangeLabel = (ageRange: string) => {
    switch (ageRange) {
      case 'AGE_10_12':
      case 'TWEEN_10_12': return 'Ages 10-12';
      case 'AGE_13_15':
      case 'TEEN_13_15': return 'Ages 13-15';
      case 'AGE_16_18':
      case 'TEEN_16_18': return 'Ages 16-18';
      case 'AGE_19_21':
      case 'ADULT_19_21': return 'Ages 19-21';
      // Legacy values
      case 'TODDLER_1_3': return 'Toddler (1-3)';
      case 'PRESCHOOL_3_5': return 'Preschool (3-5)';
      case 'SCHOOL_AGE_6_12': return 'School Age (6-12)';
      case 'TEEN_13_17': return 'Teen (13-17)';
      case 'ADULT_18_PLUS': return 'Adult (18+)';
      default: return ageRange;
    }
  };

  const getGenderIcon = (gender: string) => {
    switch (gender.toLowerCase()) {
      case 'male': return '👦';
      case 'female': return '👧';
      case 'unisex': return '👶';
      default: return '👤';
    }
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold text-lg">
              {segment.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {segment.name}
            </h3>
            
            <div className="flex items-center space-x-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAgeRangeColor(segment.ageRange)}`}>
                {getAgeRangeLabel(segment.ageRange)}
              </span>
              
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {getGenderIcon(segment.gender)} {segment.gender}
              </span>
              
              {segment.confidence && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {Math.round(segment.confidence * 100)}% confidence
                </span>
              )}
            </div>

            <div className="flex items-center text-sm text-gray-600 mb-2">
              <Package className="w-4 h-4 mr-1" />
              <button
                onClick={() => onProductCountClick?.(segment)}
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                {segment.productCount} products
              </button>
            </div>
            
            {segment.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {segment.keywords.slice(0, 3).map((keyword, index) => (
                  <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-50 text-blue-700">
                    {keyword}
                  </span>
                ))}
                {segment.keywords.length > 3 && (
                  <span className="text-xs text-gray-500">+{segment.keywords.length - 3} more</span>
                )}
              </div>
            )}
          </div>
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
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
              <div className="py-1">
                <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Segment
                </button>
                <button className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Segment
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Categories() {
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const navigate = useNavigate();

  const { data: segmentsData, loading: segmentsLoading, error: segmentsError, refetch } = useQuery(GET_SEGMENTS);
  const [refreshSegments, { loading: refreshLoading }] = useMutation(REFRESH_SEGMENTS);
  
  const loading = segmentsLoading || refreshLoading;
  const error = segmentsError;

  const segments = segmentsData?.segments || [];

  const handleRefreshSegments = async () => {
    try {
      toast.loading('Refreshing AI segments...');
      const result = await refreshSegments();
      if (result.data?.refreshSegments?.success) {
        toast.dismiss();
        toast.success(result.data.refreshSegments.message);
        // Refetch segments to get updated data
        refetch();
      } else {
        toast.dismiss();
        toast.error('Failed to refresh segments');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Error refreshing segments');
      console.error('Refresh error:', error);
    }
  };
  
  const handleViewSegmentProducts = (segment: Segment) => {
    // Navigate to products page with segment filters
    const params = new URLSearchParams();
    params.set('ageRange', segment.ageRange);
    params.set('gender', segment.gender);
    if (segment.categories.length > 0) {
      params.set('category', segment.categories[0]); // Use first category as filter
    }
    navigate(`/products?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="px-6">
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
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
            <Tags className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">
              Error loading categories
            </h3>
            <p className="text-red-600">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Get unique categories from segments
  const uniqueCategories: string[] = [...new Set(segments.flatMap((segment: Segment) => segment.categories))] as string[];
  
  // Filter segments (main display)
  const filteredSegments = segments.filter((segment: Segment) => {
    if (selectedAgeGroup && segment.ageRange !== selectedAgeGroup) return false;
    if (selectedGender && segment.gender !== selectedGender) return false;
    if (selectedCategory && !segment.categories.includes(selectedCategory)) return false;
    return true;
  });

  // Calculate segment stats by age range
  const segmentStats = segments.reduce((acc: Record<string, number>, segment: Segment) => {
    acc[segment.ageRange] = (acc[segment.ageRange] || 0) + segment.productCount;
    return acc;
  }, {});
  


  return (
    <div className="px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Product Segments</h1>
          <p className="text-gray-600 mt-1">AI-generated product segments based on age and gender targeting</p>
        </div>
        
        <button
          onClick={handleRefreshSegments}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Refresh Segments
        </button>
      </div>

      {/* AI Segment Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-pink-100 rounded-lg">
              <Users className="w-5 h-5 text-pink-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Ages 10-12</p>
              <p className="text-lg font-bold text-gray-900">
                {segmentStats.AGE_10_12 || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Ages 13-15</p>
              <p className="text-lg font-bold text-gray-900">
                {segmentStats.AGE_13_15 || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Ages 16-18</p>
              <p className="text-lg font-bold text-gray-900">
                {segmentStats.AGE_16_18 || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Ages 19-21</p>
              <p className="text-lg font-bold text-gray-900">
                {segmentStats.AGE_19_21 || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Age Group</label>
            <select
              value={selectedAgeGroup}
              onChange={(e) => setSelectedAgeGroup(e.target.value)}
              className="input"
            >
              <option value="">All Age Groups</option>
              <option value="AGE_10_12">Ages 10-12</option>
              <option value="AGE_13_15">Ages 13-15</option>
              <option value="AGE_16_18">Ages 16-18</option>
              <option value="AGE_19_21">Ages 19-21</option>
            </select>
          </div>
          
          <div>
            <label className="label">Gender</label>
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="input"
            >
              <option value="">All Genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="UNISEX">Unisex</option>
            </select>
          </div>
          
          <div>
            <label className="label">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input"
            >
              <option value="">All Categories</option>
              {uniqueCategories.map((category: string) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* AI Segments Grid */}
      {filteredSegments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSegments.map((segment: Segment) => (
            <SegmentCard 
              key={segment.id} 
              segment={segment} 
              onProductCountClick={handleViewSegmentProducts}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="text-center py-12">
            <Tags className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {selectedAgeGroup || selectedGender ? 'No segments found' : 'No AI segments yet'}
            </h3>
            <p className="text-gray-500 mb-6">
              {selectedAgeGroup || selectedGender
                ? 'No AI segments match your current filters. Try adjusting them.'
                : 'AI segments will appear here after products are processed and analyzed.'
              }
            </p>
            {!selectedAgeGroup && !selectedGender && (
              <button
                onClick={handleRefreshSegments}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Process Products for AI Segments
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
