import winston from 'winston';
import path from 'path';

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.align(),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create transports
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
  })
);

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: parseInt(process.env.LOG_MAX_SIZE?.replace('m', '')) * 1024 * 1024 || 10485760, // 10MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: parseInt(process.env.LOG_MAX_SIZE?.replace('m', '')) * 1024 * 1024 || 10485760,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    })
  );

  // HTTP requests log
  transports.push(
    new winston.transports.File({
      filename: 'logs/http.log',
      level: 'http',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create specialized loggers
export const apiLogger = logger.child({ service: 'api' });
export const dbLogger = logger.child({ service: 'database' });
export const cacheLogger = logger.child({ service: 'cache' });
export const authLogger = logger.child({ service: 'auth' });
export const rainforestLogger = logger.child({ service: 'rainforest-api' });
export const graphqlLogger = logger.child({ service: 'graphql' });

// HTTP request logging middleware
export const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    apiVersion: req.apiVersion,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.http('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      contentLength: res.get('content-length'),
    });

    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow HTTP Request', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        userId: req.user?.id,
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Database query logging
export const logDatabaseQuery = (query, params, duration, error = null) => {
  const logData = {
    query: query.substring(0, 200), // Truncate long queries
    duration: `${duration}ms`,
    hasParams: !!params,
  };

  if (error) {
    dbLogger.error('Database Query Error', {
      ...logData,
      error: error.message,
      stack: error.stack,
    });
  } else if (duration > 1000) {
    dbLogger.warn('Slow Database Query', logData);
  } else {
    dbLogger.debug('Database Query', logData);
  }
};

// Cache operation logging
export const logCacheOperation = (operation, key, hit = null, duration = null) => {
  const logData = {
    operation,
    key: key.substring(0, 100), // Truncate long keys
  };

  if (hit !== null) {
    logData.hit = hit;
  }
  if (duration !== null) {
    logData.duration = `${duration}ms`;
  }

  cacheLogger.debug('Cache Operation', logData);
};

// Authentication logging
export const logAuthEvent = (event, userId, details = {}) => {
  authLogger.info('Auth Event', {
    event,
    userId,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// API rate limit logging
export const logRateLimit = (ip, userId, limit, remaining) => {
  logger.warn('Rate Limit Hit', {
    ip,
    userId,
    limit,
    remaining,
    timestamp: new Date().toISOString(),
  });
};

// External API logging
export const logExternalAPI = (apiName, endpoint, method, duration, success, error = null) => {
  const logData = {
    api: apiName,
    endpoint,
    method,
    duration: `${duration}ms`,
    success,
  };

  if (error) {
    logData.error = error.message;
    logger.error(`${apiName} API Error`, logData);
  } else if (duration > 10000) {
    logger.warn(`Slow ${apiName} API Call`, logData);
  } else {
    logger.info(`${apiName} API Call`, logData);
  }
};

// GraphQL operation logging
export const logGraphQLOperation = (operationName, query, variables, duration, errors = null) => {
  const logData = {
    operation: operationName,
    query: query.substring(0, 200),
    hasVariables: !!variables,
    duration: `${duration}ms`,
  };

  if (errors && errors.length > 0) {
    logData.errors = errors.map(err => err.message);
    graphqlLogger.error('GraphQL Operation Error', logData);
  } else if (duration > 3000) {
    graphqlLogger.warn('Slow GraphQL Operation', logData);
  } else {
    graphqlLogger.info('GraphQL Operation', logData);
  }
};

// Business logic logging
export const logBusinessEvent = (event, data = {}) => {
  logger.info('Business Event', {
    event,
    ...data,
    timestamp: new Date().toISOString(),
  });
};

// Security event logging
export const logSecurityEvent = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Performance monitoring
export const logPerformanceMetric = (metric, value, context = {}) => {
  logger.info('Performance Metric', {
    metric,
    value,
    ...context,
    timestamp: new Date().toISOString(),
  });
};

// Error logging with context
export const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  });
};

export default logger;
