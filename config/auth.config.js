// Auth.js configuration for GottaEarn.it
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "@auth/core/providers/google";
import GitHubProvider from "@auth/core/providers/github";
import CredentialsProvider from "@auth/core/providers/credentials";
import { prisma } from '../backend/src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const authConfig = {
  // Database adapter for user/session storage
  adapter: PrismaAdapter(prisma),
  
  // Authentication providers
  providers: [
    // Google OAuth (for easy admin access)
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    
    // GitHub OAuth (for developers)
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    
    // Email/Password for custom accounts
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password required");
        }

        // Find user in database
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user || !user.hashedPassword) {
          throw new Error("Invalid credentials");
        }

        // Verify password
        const isValid = await bcrypt.compare(credentials.password, user.hashedPassword);
        
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
        };
      }
    })
  ],

  // Session configuration
  session: {
    strategy: "jwt", // Use JWT for mobile app compatibility
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  // JWT configuration
  jwt: {
    secret: process.env.AUTH_SECRET,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  // Callbacks for customizing behavior
  callbacks: {
    // JWT callback - runs when JWT is created
    async jwt({ token, user, account }) {
      // Add user info to token on sign in
      if (user) {
        token.role = user.role;
        token.userId = user.id;
      }
      
      // Add provider info
      if (account) {
        token.provider = account.provider;
      }
      
      return token;
    },

    // Session callback - runs when session is accessed
    async session({ session, token }) {
      // Add custom fields to session
      if (token) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.provider = token.provider;
      }
      
      return session;
    },

    // Sign in callback - control who can sign in
    async signIn({ user, account, profile }) {
      // Allow OAuth providers
      if (account?.provider === "google" || account?.provider === "github") {
        // Auto-create user if doesn't exist
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email }
        });

        if (!existingUser) {
          // Create new user with default role
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              role: "USER", // Default role
              provider: account.provider,
            }
          });
        }
        
        return true;
      }

      // Allow credentials provider
      if (account?.provider === "credentials") {
        return true;
      }

      return false;
    },

    // Redirect callback - control where users go after sign in
    async redirect({ url, baseUrl }) {
      // Redirect to admin dashboard if admin
      if (url.includes('/admin')) {
        return `${baseUrl}/admin`;
      }
      
      // Default redirect
      return baseUrl;
    }
  },

  // Custom pages
  pages: {
    signIn: '/auth/signin',
    signUp: '/auth/signup',
    error: '/auth/error',
  },

  // Events for logging
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`User signed in: ${user.email} via ${account?.provider}`);
      
      // Log to your logging system
      if (global.logger) {
        global.logger.info('User signed in', {
          userId: user.id,
          email: user.email,
          provider: account?.provider,
          isNewUser,
        });
      }
    },
    
    async signOut({ session, token }) {
      console.log(`User signed out: ${session?.user?.email}`);
    },
  },

  // Debug mode for development
  debug: process.env.NODE_ENV === 'development',
  
  // Security settings
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: `gottaearn.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  }
};

// Helper functions for API routes
export const getServerSession = async (req, res) => {
  return await getServerSession(req, res, authConfig);
};

// JWT utilities for mobile app
export const generateMobileToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'mobile'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

export const verifyMobileToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Role-based access control
export const requireAuth = (requiredRole = null) => {
  return async (req, res, next) => {
    try {
      const session = await getServerSession(req, res);
      
      if (!session?.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (requiredRole && session.user.role !== requiredRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = session.user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid session' });
    }
  };
};

// Admin-only middleware
export const requireAdmin = requireAuth('ADMIN');

export default authConfig;
