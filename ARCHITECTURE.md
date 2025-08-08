# GottaEarn.it Architecture

## Overview

GottaEarn.it is a dual-purpose platform consisting of an **Admin Tool** for product curation and a **Front-End Chat Application** for product discovery. The system enables administrators to curate Amazon products via Rainforest API and provides users with an intelligent chatbot interface to discover age-appropriate products through conversational search.

## Core Objectives

- **Admin Tool**: Curate Amazon products by categories, age groups, and demographics (boys/girls)
- **User Experience**: Provide personalized product discovery through AI-powered chat interface
- **Data Intelligence**: Track search patterns to surface popular products into curated collections
- **Swift Integration**: Support front-end Swift application with fast product retrieval

## System Architecture

### Frontend Applications

#### Admin Dashboard
- **Purpose**: Product curation and category management
- **Users**: Administrators with elevated permissions
- **Features**:
  - Search Amazon products via Rainforest API
  - Create/manage categories (age groups, gender segments, genres)
  - Curate product collections
  - View analytics on product popularity and search trends
  - Manage user roles and permissions

#### User Chat Interface
- **Purpose**: Conversational product discovery
- **Users**: End users seeking product recommendations
- **Features**:
  - AI-powered chat for product search and recommendations
  - Age-appropriate product filtering
  - Personalized suggestions based on preferences
  - Search history and favorites
  - Integration with Swift mobile app

### Backend Services

#### API Layer
- **Framework**: Node.js with TypeScript
- **API Architecture**: GraphQL + REST hybrid
  - GraphQL for complex queries and real-time data (Swift app integration)
  - REST for simple CRUD operations and file uploads
- **API Versioning**: `/api/v1/graphql`, `/api/v1/rest` for backwards compatibility
- **Authentication**: Auth.js for session management + JWT for mobile
- **Role-based Access**: Admin vs. User permissions
- **Rate Limiting**: Redis-based with tiered limits (admin: 1000/hr, user: 100/hr)
- **Caching Layer**: Redis for GraphQL queries and API responses
- **Error Monitoring**: Sentry integration for real-time error tracking
- **CORS Configuration**: S3-ready for cross-origin file uploads
- **Request Validation**: Zod schemas for type-safe API validation
- **Endpoints**:
  - Product search and curation (full CRUD)
  - Category management (full CRUD)
  - Chat/conversation handling
  - Analytics and reporting
  - Swift API endpoints for mobile consumption

#### Database Layer
- **Primary Database**: Neon (PostgreSQL)
- **ORM**: Prisma for type-safe database operations
- **Schema Design**:
  - Products (ASIN, title, price, images, metadata)
  - Categories (age groups, gender, genres)
  - Collections (curated product groupings)
  - Search Analytics (frequency, popularity scoring)
  - User Sessions and Chat History

#### External Integrations
- **Rainforest API**: Amazon product data retrieval
- **Anthropic API**: AI chat capabilities and product recommendations
- **AWS S3**: File storage for product images and assets

### Data Flow

1. **Admin Curation**:
   - Admin searches products via Rainforest API
   - Products stored in Neon with metadata
   - Products assigned to categories/collections
   - Search frequency tracked for popularity scoring

2. **User Discovery**:
   - User interacts with AI chat interface
   - Anthropic API processes queries and preferences
   - System retrieves relevant products from Neon
   - Popular searches influence future curation

3. **Intelligence Layer**:
   - Track product search frequency and user interactions
   - Reddit-like ranking algorithm for product popularity
   - Auto-promote frequently searched items to curated collections
   - User favorites and engagement scoring
   - Generate insights for admin decision-making
   - Real-time ranking updates based on user behavior

## Technology Stack

### Frontend
- **Framework**: React with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Theme System**: Light/Purple/Pink/Blue/Dark modes
- **State Management**: React Query for server state
- **GraphQL Client**: Apollo Client for efficient data fetching
- **Dev Ports**: Frontend (7000), Backend (9000)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js with TypeScript
- **API Layer**: GraphQL (Apollo Server) + REST endpoints
- **Database**: Neon (PostgreSQL) with read replicas
- **ORM**: Prisma with connection pooling
- **Authentication**: Auth.js + JWT for mobile clients
- **Caching**: Redis cluster (queries, sessions, rankings)
- **Rate Limiting**: express-rate-limit + Redis store
- **Error Monitoring**: Sentry for error tracking and performance
- **Logging**: Winston with structured logging
- **File Upload**: S3 with CORS configuration
- **Validation**: Zod for runtime type checking
- **API Documentation**: GraphQL Playground + OpenAPI/Swagger

### External Services
- **Product Data**: Rainforest API with rate limiting
- **AI Chat**: Anthropic Claude API
- **File Storage**: AWS S3 + CloudFront CDN
- **Caching**: Redis Cloud or AWS ElastiCache
- **Error Monitoring**: Sentry.io
- **Analytics**: Mixpanel or PostHog for user behavior
- **Email**: SendGrid for notifications
- **Deployment**: Railway with environment promotion

### Mobile Integration
- **Platform**: Swift (iOS)
- **API Communication**: GraphQL for efficient data fetching
- **Real-time**: GraphQL subscriptions for live updates
- **Offline Support**: Apollo iOS client with caching
- **Image Loading**: S3 CDN integration with signed URLs

## Database Schema (High-Level)

### Core Entities
- **Products**: Amazon product data with ASIN, pricing, images
- **Categories**: Age groups, gender segments, product genres
- **Collections**: Curated product groupings
- **Users**: Authentication and role management
- **SearchAnalytics**: Track query frequency and popularity
- **ChatSessions**: Conversation history and context

### Relationships
- Products ↔ Categories (many-to-many)
- Products ↔ Collections (many-to-many)
- Users ↔ ChatSessions (one-to-many)
- Users ↔ ProductFavorites (many-to-many)
- SearchAnalytics → Products (tracking popularity)
- ProductRankings → Products (Reddit-like scoring)
- UserInteractions → Products (engagement tracking)

## Security & Permissions

### Role-Based Access
- **Admin**: Full CRUD on products, categories, analytics access
- **User**: Read-only product access, chat functionality
- **Mobile API**: JWT-based authentication with refresh tokens
- **API Keys**: Secure storage of Rainforest and Anthropic credentials

### Data Protection
- User session management via Auth.js
- JWT tokens for mobile authentication (short-lived + refresh)
- API rate limiting with Redis (tiered by user role)
- Request validation with Zod schemas
- CORS policies for cross-origin requests
- Secure file uploads to S3 with signed URLs
- SQL injection prevention via Prisma ORM
- XSS protection with helmet.js

### API Security
- **Versioning**: Semantic versioning for backwards compatibility
- **Rate Limits**: 100 req/hr (users), 1000 req/hr (admins), 10000 req/hr (mobile)
- **Authentication**: Multi-factor auth for admin accounts
- **Monitoring**: Real-time error tracking and alerting
- **Validation**: Input sanitization and type checking

## Deployment Strategy

### Railway Deployment
- **Environment**: Production-ready Node.js hosting
- **Database**: Neon PostgreSQL with connection pooling
- **File Storage**: AWS S3 integration
- **Environment Variables**: Secure API key management

### Scalability Considerations
- Database indexing for fast product queries
- Caching layer for frequently accessed products
- API rate limiting for external service calls
- Image optimization and CDN delivery

## Testing Strategy

### Test-Driven Development (TDD)
- **Write tests first**: All features developed using TDD approach
- **Red-Green-Refactor**: Standard TDD cycle for all components
- **Test coverage**: Minimum 70% code coverage across all layers
- **Continuous testing**: Tests run on every commit and deployment

### Testing Pyramid

#### Unit Tests (70%)
- **Framework**: Jest with TypeScript support
- **Scope**: Individual functions, classes, and components
- **Mocking**: External dependencies mocked (Redis, APIs, database)
- **Speed**: Fast execution (< 1 second per test)
- **Coverage**: Business logic, utilities, validation, caching

#### Integration Tests (20%)
- **Framework**: Jest with Testcontainers
- **Scope**: Component interactions, database operations, cache integration
- **Real services**: PostgreSQL and Redis containers for realistic testing
- **Data**: Seeded test data with cleanup between tests
- **Coverage**: API layers, database queries, cache strategies

#### API/Endpoint Tests (8%)
- **Framework**: Supertest with Jest
- **Scope**: HTTP endpoints, GraphQL queries/mutations, authentication
- **Mocking**: External APIs (Rainforest, Anthropic) mocked with Nock
- **Validation**: Request/response formats, error handling, rate limiting
- **Coverage**: All REST and GraphQL endpoints

#### End-to-End Tests (2%)
- **Framework**: Playwright or Cypress
- **Scope**: Full user workflows, admin operations, mobile API integration
- **Environment**: Production-like test environment
- **Coverage**: Critical user journeys, admin workflows

### Test Organization
```
tests/
├── unit/                 # Unit tests
│   ├── cache.test.js
│   ├── auth.test.js
│   └── utils.test.js
├── integration/          # Integration tests
│   ├── product-search.test.js
│   └── user-management.test.js
├── api/                  # API endpoint tests
│   ├── products.test.js
│   ├── graphql.test.js
│   └── auth.test.js
├── e2e/                  # End-to-end tests
│   ├── admin-workflow.test.js
│   └── user-journey.test.js
└── setup/                # Test configuration
    ├── jest.setup.js
    ├── integration.setup.js
    └── api.setup.js
```

### Test Data Management
- **Factories**: Faker.js for generating realistic test data
- **Fixtures**: Predefined data sets for consistent testing
- **Cleanup**: Automatic database/cache cleanup between tests
- **Isolation**: Each test runs in isolation with fresh data

### Continuous Integration
- **Pre-commit**: Unit tests run before code commits
- **Pull requests**: Full test suite runs on PR creation
- **Deployment**: Integration and API tests run before deployment
- **Performance**: Test execution time monitoring and optimization

### Test Utilities
- **Authentication helpers**: Easy user/admin context creation
- **API mocking**: Consistent external API mocking
- **Database seeding**: Reusable test data creation
- **Assertion helpers**: Custom matchers for common validations

## Future Enhancements

- **Machine Learning**: Product recommendation algorithms
- **Analytics Dashboard**: Advanced reporting and insights
- **Multi-platform**: Android support alongside Swift
- **Social Features**: User reviews and product sharing
- **Inventory Tracking**: Real-time Amazon availability status
- **Performance Testing**: Load testing with Artillery or K6
- **Visual Regression**: Screenshot testing for UI components
- **Accessibility Testing**: Automated a11y testing integration

---

This architecture provides a scalable foundation for both administrative product curation and user-facing product discovery, with intelligent data collection to improve recommendations over time. The comprehensive testing strategy ensures reliability and maintainability through test-driven development.
