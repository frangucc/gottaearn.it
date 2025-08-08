import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Base rate limit configuration
const createRateLimit = (windowMs, max, message, keyGenerator) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    }),
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || ((req) => req.ip),
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    },
  });
};

// Different rate limits for different user types
export const rateLimits = {
  // General API rate limit
  general: createRateLimit(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000, // 1 hour
    50, // 50 requests per hour for unauthenticated users
    'Too many requests from this IP, please try again later.',
  ),

  // User rate limit (authenticated users)
  user: createRateLimit(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_USER) || 100,
    'User rate limit exceeded. Please try again later.',
    (req) => `user:${req.user?.id || req.ip}`,
  ),

  // Admin rate limit (higher limits)
  admin: createRateLimit(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_ADMIN) || 1000,
    'Admin rate limit exceeded. Please try again later.',
    (req) => `admin:${req.user?.id || req.ip}`,
  ),

  // Mobile app rate limit (highest limits)
  mobile: createRateLimit(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_MOBILE) || 10000,
    'Mobile rate limit exceeded. Please try again later.',
    (req) => `mobile:${req.headers['x-api-key'] || req.ip}`,
  ),

  // Strict rate limit for sensitive operations
  strict: createRateLimit(
    900000, // 15 minutes
    5, // 5 requests per 15 minutes
    'Too many sensitive operations. Please wait before trying again.',
  ),

  // Rainforest API rate limit (to avoid hitting their limits)
  rainforest: createRateLimit(
    60000, // 1 minute
    10, // 10 requests per minute
    'Rainforest API rate limit exceeded. Please wait.',
    (req) => `rainforest:${req.user?.id || req.ip}`,
  ),
};

// Middleware to apply appropriate rate limit based on user role
export const dynamicRateLimit = (req, res, next) => {
  const userRole = req.user?.role;
  const isMobile = req.headers['user-agent']?.includes('GottaEarn-iOS') || 
                   req.headers['x-platform'] === 'ios';

  let rateLimitMiddleware;

  if (isMobile) {
    rateLimitMiddleware = rateLimits.mobile;
  } else if (userRole === 'admin') {
    rateLimitMiddleware = rateLimits.admin;
  } else if (userRole === 'user') {
    rateLimitMiddleware = rateLimits.user;
  } else {
    rateLimitMiddleware = rateLimits.general;
  }

  return rateLimitMiddleware(req, res, next);
};

export default rateLimits;
