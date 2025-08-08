import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

// Initialize Sentry
export const initSentry = () => {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not configured. Error monitoring disabled.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.SENTRY_RELEASE || '1.0.0',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Profiling (optional, for performance insights)
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new ProfilingIntegration(),
    ],

    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers['x-api-key'];
        delete event.request.headers.cookie;
      }

      // Remove sensitive data from extra context
      if (event.extra) {
        delete event.extra.password;
        delete event.extra.token;
        delete event.extra.apiKey;
      }

      // Filter out rate limit errors (too noisy)
      if (event.exception?.values?.[0]?.value?.includes('rate limit')) {
        return null;
      }

      return event;
    },

    // Set user context
    initialScope: {
      tags: {
        component: 'gottaearn-api',
      },
    },
  });

  console.log('Sentry initialized for error monitoring');
};

// Express middleware for Sentry
export const sentryRequestHandler = Sentry.Handlers.requestHandler();
export const sentryTracingHandler = Sentry.Handlers.tracingHandler();
export const sentryErrorHandler = Sentry.Handlers.errorHandler({
  shouldHandleError(error) {
    // Only send 5xx errors to Sentry
    return error.status >= 500;
  },
});

// Custom error logging functions
export const logError = (error, context = {}) => {
  Sentry.withScope((scope) => {
    // Add context to the error
    Object.keys(context).forEach(key => {
      scope.setTag(key, context[key]);
    });

    // Set severity level
    scope.setLevel('error');
    
    Sentry.captureException(error);
  });
};

export const logWarning = (message, context = {}) => {
  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setTag(key, context[key]);
    });

    scope.setLevel('warning');
    Sentry.captureMessage(message);
  });
};

export const logInfo = (message, context = {}) => {
  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setTag(key, context[key]);
    });

    scope.setLevel('info');
    Sentry.captureMessage(message);
  });
};

// Set user context for requests
export const setSentryUser = (req, res, next) => {
  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
  }
  next();
};

// Performance monitoring for GraphQL
export const monitorGraphQLPerformance = (operationName, startTime) => {
  const duration = Date.now() - startTime;
  
  Sentry.addBreadcrumb({
    message: `GraphQL ${operationName}`,
    category: 'graphql',
    data: {
      duration: `${duration}ms`,
    },
    level: 'info',
  });

  // Alert on slow queries
  if (duration > 5000) { // 5 seconds
    logWarning(`Slow GraphQL query: ${operationName}`, {
      operation: operationName,
      duration,
      type: 'performance',
    });
  }
};

// Monitor external API calls
export const monitorExternalAPI = (apiName, endpoint, startTime, success = true) => {
  const duration = Date.now() - startTime;
  
  Sentry.addBreadcrumb({
    message: `${apiName} API call`,
    category: 'http',
    data: {
      endpoint,
      duration: `${duration}ms`,
      success,
    },
    level: success ? 'info' : 'error',
  });

  if (!success || duration > 10000) { // 10 seconds
    logWarning(`${apiName} API issue`, {
      api: apiName,
      endpoint,
      duration,
      success,
      type: 'external-api',
    });
  }
};

// Database query monitoring
export const monitorDatabaseQuery = (query, startTime, error = null) => {
  const duration = Date.now() - startTime;
  
  if (error) {
    logError(error, {
      query: query.substring(0, 100), // First 100 chars
      duration,
      type: 'database',
    });
  } else if (duration > 3000) { // 3 seconds
    logWarning('Slow database query', {
      query: query.substring(0, 100),
      duration,
      type: 'database-performance',
    });
  }
};

export default Sentry;
