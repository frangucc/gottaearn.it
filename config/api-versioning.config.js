// API Versioning Configuration
export const API_VERSIONS = {
  V1: 'v1',
  // V2: 'v2', // Future versions
};

export const CURRENT_VERSION = API_VERSIONS.V1;
export const SUPPORTED_VERSIONS = [API_VERSIONS.V1];

// Version detection middleware
export const detectApiVersion = (req, res, next) => {
  // Check version from URL path first
  const pathVersion = req.path.match(/^\/api\/(v\d+)\//)?.[1];
  
  // Check version from header
  const headerVersion = req.headers['api-version'];
  
  // Check version from query parameter
  const queryVersion = req.query.version;
  
  // Priority: URL > Header > Query > Default
  const requestedVersion = pathVersion || headerVersion || queryVersion || CURRENT_VERSION;
  
  // Validate version
  if (!SUPPORTED_VERSIONS.includes(requestedVersion)) {
    return res.status(400).json({
      error: 'Unsupported API version',
      requested: requestedVersion,
      supported: SUPPORTED_VERSIONS,
      current: CURRENT_VERSION,
    });
  }
  
  // Set version in request object
  req.apiVersion = requestedVersion;
  
  // Set response header
  res.set('API-Version', requestedVersion);
  
  next();
};

// Version-specific route handlers
export const versionedRoute = (handlers) => {
  return (req, res, next) => {
    const version = req.apiVersion || CURRENT_VERSION;
    const handler = handlers[version];
    
    if (!handler) {
      return res.status(501).json({
        error: 'Version not implemented',
        version,
        availableVersions: Object.keys(handlers),
      });
    }
    
    return handler(req, res, next);
  };
};

// Deprecation warnings
export const deprecationWarning = (version, deprecatedIn, removedIn) => {
  return (req, res, next) => {
    if (req.apiVersion === version) {
      res.set('Deprecation', 'true');
      res.set('Sunset', removedIn);
      res.set('Link', `</api/${CURRENT_VERSION}>; rel="successor-version"`);
      
      // Log deprecation usage
      console.warn(`Deprecated API version ${version} used`, {
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    }
    next();
  };
};

// Version compatibility helpers
export const isVersionSupported = (version) => {
  return SUPPORTED_VERSIONS.includes(version);
};

export const getLatestVersion = () => {
  return CURRENT_VERSION;
};

// Schema versioning for GraphQL
export const getGraphQLSchema = (version) => {
  switch (version) {
    case API_VERSIONS.V1:
      return import('../schemas/graphql/v1/schema.js');
    // case API_VERSIONS.V2:
    //   return import('../schemas/graphql/v2/schema.js');
    default:
      throw new Error(`Unsupported GraphQL schema version: ${version}`);
  }
};

// Database model versioning
export const getModelVersion = (modelName, version) => {
  const versionMap = {
    [API_VERSIONS.V1]: {
      Product: {
        // V1 product fields
        fields: ['id', 'asin', 'title', 'price', 'image', 'rating', 'createdAt'],
        relations: ['categories', 'collections'],
      },
      Category: {
        fields: ['id', 'name', 'ageGroup', 'gender', 'createdAt'],
        relations: ['products'],
      },
    },
    // V2 could have additional fields or different structure
  };
  
  return versionMap[version]?.[modelName];
};

// Response transformation based on version
export const transformResponse = (data, version, modelType) => {
  const modelConfig = getModelVersion(modelType, version);
  
  if (!modelConfig) {
    return data; // Return as-is if no version config
  }
  
  // Filter fields based on version
  if (Array.isArray(data)) {
    return data.map(item => filterFields(item, modelConfig.fields));
  } else {
    return filterFields(data, modelConfig.fields);
  }
};

const filterFields = (obj, allowedFields) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const filtered = {};
  allowedFields.forEach(field => {
    if (obj.hasOwnProperty(field)) {
      filtered[field] = obj[field];
    }
  });
  
  return filtered;
};

// Migration helpers for version upgrades
export const migrateRequest = (req, fromVersion, toVersion) => {
  // Handle request structure changes between versions
  switch (`${fromVersion}->${toVersion}`) {
    case 'v1->v2':
      // Example: rename fields, restructure data
      if (req.body?.productData) {
        // Migrate v1 productData structure to v2
        req.body.product = {
          ...req.body.productData,
          // Add new required fields for v2
          metadata: req.body.productData.extra || {},
        };
        delete req.body.productData;
      }
      break;
    default:
      // No migration needed
      break;
  }
  
  return req;
};

// API documentation versioning
export const getApiDocs = (version) => {
  const docs = {
    [API_VERSIONS.V1]: {
      openapi: '3.0.0',
      info: {
        title: 'GottaEarn.it API',
        version: '1.0.0',
        description: 'Product curation and discovery API',
      },
      servers: [
        {
          url: `${process.env.BACKEND_URL}/api/v1`,
          description: 'Development server',
        },
      ],
      // ... rest of OpenAPI spec
    },
  };
  
  return docs[version];
};

export default {
  API_VERSIONS,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  detectApiVersion,
  versionedRoute,
  deprecationWarning,
  isVersionSupported,
  getLatestVersion,
  getGraphQLSchema,
  transformResponse,
  migrateRequest,
  getApiDocs,
};
