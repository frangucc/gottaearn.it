// GraphQL API tests
describe('GraphQL API', () => {
  let testUser, testAdmin, testProduct, testCategory;

  beforeEach(async () => {
    const seedData = await global.integrationUtils.seedTestData();
    testUser = seedData.user;
    testAdmin = seedData.admin;
    testProduct = seedData.product;
    testCategory = seedData.category;
  });

  describe('Product Queries', () => {
    test('should fetch products with pagination', async () => {
      const query = `
        query GetProducts($limit: Int, $offset: Int) {
          products(limit: $limit, offset: $offset) {
            edges {
              node {
                id
                asin
                title
                price
                rating
                categories {
                  id
                  name
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              totalCount
            }
          }
        }
      `;

      const variables = { limit: 10, offset: 0 };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.products.edges).toBeDefined();
      expect(Array.isArray(response.body.data.products.edges)).toBe(true);
      expect(response.body.data.products.pageInfo).toBeDefined();
    });

    test('should fetch single product by ASIN', async () => {
      const query = `
        query GetProduct($asin: String!) {
          product(asin: $asin) {
            id
            asin
            title
            price
            rating
            ratingsTotal
            image
            categories {
              id
              name
              ageGroup
              gender
            }
            createdAt
            updatedAt
          }
        }
      `;

      const variables = { asin: testProduct.asin };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.product.asin).toBe(testProduct.asin);
      expect(response.body.data.product.title).toBe(testProduct.title);
      expect(response.body.data.product.categories).toBeDefined();
    });

    test('should handle non-existent product gracefully', async () => {
      const query = `
        query GetProduct($asin: String!) {
          product(asin: $asin) {
            id
            title
          }
        }
      `;

      const variables = { asin: 'B08NONEXISTENT' };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.product).toBeNull();
    });

    test('should filter products by category', async () => {
      const query = `
        query GetProductsByCategory($categoryId: ID!) {
          products(categoryId: $categoryId) {
            edges {
              node {
                id
                title
                categories {
                  id
                }
              }
            }
          }
        }
      `;

      const variables = { categoryId: testCategory.id };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      response.body.data.products.edges.forEach(edge => {
        expect(edge.node.categories.some(cat => cat.id === testCategory.id)).toBe(true);
      });
    });
  });

  describe('Category Queries', () => {
    test('should fetch all categories', async () => {
      const query = `
        query GetCategories {
          categories {
            id
            name
            ageGroup
            gender
            productCount
            createdAt
          }
        }
      `;

      const response = await global.apiUtils.graphqlRequest(query, {}, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.categories).toBeDefined();
      expect(Array.isArray(response.body.data.categories)).toBe(true);
      expect(response.body.data.categories.length).toBeGreaterThan(0);
    });

    test('should filter categories by age group', async () => {
      const query = `
        query GetCategoriesByAge($ageGroup: AgeGroup!) {
          categories(ageGroup: $ageGroup) {
            id
            name
            ageGroup
          }
        }
      `;

      const variables = { ageGroup: 'TEEN' };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      response.body.data.categories.forEach(category => {
        expect(category.ageGroup).toBe('TEEN');
      });
    });
  });

  describe('Search Queries', () => {
    beforeEach(() => {
      // Mock Rainforest API
      global.apiUtils.mockRainforestAPI('xbox', 
        global.apiUtils.getRainforestMockResponse('xbox')
      );
    });

    test('should search products via GraphQL', async () => {
      const query = `
        query SearchProducts($input: ProductSearchInput!) {
          searchProducts(input: $input) {
            query
            results {
              asin
              title
              price
              rating
              image
              source
            }
            cached
            totalResults
          }
        }
      `;

      const variables = {
        input: {
          query: 'xbox',
          ageGroup: 'TEEN',
          maxResults: 10,
        },
      };

      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.searchProducts.query).toBe('xbox');
      expect(response.body.data.searchProducts.results).toBeDefined();
      expect(Array.isArray(response.body.data.searchProducts.results)).toBe(true);
    });

    test('should return cached search results', async () => {
      const query = `
        query SearchProducts($input: ProductSearchInput!) {
          searchProducts(input: $input) {
            query
            results {
              asin
              title
            }
            cached
          }
        }
      `;

      const variables = {
        input: { query: 'xbox controller', maxResults: 5 },
      };

      // First request
      await global.apiUtils.graphqlRequest(query, variables, testUser);

      // Second request should be cached
      const response = await global.apiUtils.graphqlRequest(query, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.searchProducts.cached).toBe(true);
    });
  });

  describe('User Queries', () => {
    test('should fetch current user profile', async () => {
      const query = `
        query GetMe {
          me {
            id
            email
            role
            name
            favorites {
              id
              title
            }
            chatSessions {
              id
              createdAt
            }
          }
        }
      `;

      const response = await global.apiUtils.graphqlRequest(query, {}, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.me.id).toBe(testUser.id);
      expect(response.body.data.me.email).toBe(testUser.email);
      expect(response.body.data.me.role).toBe(testUser.role);
    });

    test('should require authentication for user queries', async () => {
      const query = `
        query GetMe {
          me {
            id
            email
          }
        }
      `;

      const response = await global.apiUtils.graphqlRequest(query, {});

      global.apiUtils.expectGraphQLError(response, 'authentication');
    });
  });

  describe('Admin Mutations', () => {
    test('should create product as admin', async () => {
      const mutation = `
        mutation CreateProduct($input: CreateProductInput!) {
          createProduct(input: $input) {
            id
            asin
            title
            price
            categories {
              id
              name
            }
          }
        }
      `;

      const variables = {
        input: {
          asin: 'B08NEWGQL01',
          title: 'GraphQL Test Product',
          price: 99.99,
          image: 'https://example.com/gql-product.jpg',
          rating: 4.5,
          ratingsTotal: 1000,
          categoryIds: [testCategory.id],
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testAdmin);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.createProduct.asin).toBe(variables.input.asin);
      expect(response.body.data.createProduct.title).toBe(variables.input.title);
      expect(response.body.data.createProduct.categories).toHaveLength(1);
    });

    test('should reject product creation by non-admin', async () => {
      const mutation = `
        mutation CreateProduct($input: CreateProductInput!) {
          createProduct(input: $input) {
            id
            title
          }
        }
      `;

      const variables = {
        input: {
          asin: 'B08UNAUTHORIZED',
          title: 'Unauthorized Product',
          price: 50.00,
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testUser);

      global.apiUtils.expectGraphQLError(response, 'authorization');
    });

    test('should update product as admin', async () => {
      const mutation = `
        mutation UpdateProduct($asin: String!, $input: UpdateProductInput!) {
          updateProduct(asin: $asin, input: $input) {
            id
            asin
            title
            price
            rating
          }
        }
      `;

      const variables = {
        asin: testProduct.asin,
        input: {
          title: 'Updated via GraphQL',
          price: 129.99,
          rating: 4.9,
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testAdmin);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.updateProduct.title).toBe(variables.input.title);
      expect(response.body.data.updateProduct.price).toBe(variables.input.price);
      expect(response.body.data.updateProduct.rating).toBe(variables.input.rating);
    });

    test('should delete product as admin', async () => {
      const mutation = `
        mutation DeleteProduct($asin: String!) {
          deleteProduct(asin: $asin)
        }
      `;

      const variables = { asin: testProduct.asin };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testAdmin);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.deleteProduct).toBe(true);

      // Verify product is deleted
      const query = `
        query GetProduct($asin: String!) {
          product(asin: $asin) {
            id
          }
        }
      `;

      const checkResponse = await global.apiUtils.graphqlRequest(query, variables, testAdmin);
      global.apiUtils.expectGraphQLSuccess(checkResponse);
      expect(checkResponse.body.data.product).toBeNull();
    });
  });

  describe('User Mutations', () => {
    test('should add product to favorites', async () => {
      const mutation = `
        mutation AddToFavorites($productId: ID!) {
          addToFavorites(productId: $productId) {
            id
            favorites {
              id
              title
            }
          }
        }
      `;

      const variables = { productId: testProduct.id };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.addToFavorites.favorites).toHaveLength(1);
      expect(response.body.data.addToFavorites.favorites[0].id).toBe(testProduct.id);
    });

    test('should remove product from favorites', async () => {
      // First add to favorites
      await global.testDb.user.update({
        where: { id: testUser.id },
        data: {
          favorites: {
            connect: { id: testProduct.id },
          },
        },
      });

      const mutation = `
        mutation RemoveFromFavorites($productId: ID!) {
          removeFromFavorites(productId: $productId) {
            id
            favorites {
              id
            }
          }
        }
      `;

      const variables = { productId: testProduct.id };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.removeFromFavorites.favorites).toHaveLength(0);
    });
  });

  describe('Chat Mutations', () => {
    beforeEach(() => {
      // Mock Anthropic API
      global.apiUtils.mockAnthropicAPI(
        global.apiUtils.getAnthropicMockResponse('Here are some great Xbox recommendations!')
      );
    });

    test('should create chat session and get AI response', async () => {
      const mutation = `
        mutation SendChatMessage($input: ChatMessageInput!) {
          sendChatMessage(input: $input) {
            id
            messages {
              role
              content
              timestamp
            }
          }
        }
      `;

      const variables = {
        input: {
          message: 'I need a gaming headset for my Xbox',
          context: {
            ageGroup: 'TEEN',
            budget: 100,
          },
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testUser);

      global.apiUtils.expectGraphQLSuccess(response);
      expect(response.body.data.sendChatMessage.messages).toHaveLength(2);
      expect(response.body.data.sendChatMessage.messages[0].role).toBe('user');
      expect(response.body.data.sendChatMessage.messages[1].role).toBe('assistant');
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors', async () => {
      const mutation = `
        mutation CreateProduct($input: CreateProductInput!) {
          createProduct(input: $input) {
            id
          }
        }
      `;

      const variables = {
        input: {
          // Missing required asin field
          title: 'Invalid Product',
          price: 50.00,
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testAdmin);

      global.apiUtils.expectGraphQLError(response, 'validation');
    });

    test('should handle database constraint errors', async () => {
      const mutation = `
        mutation CreateProduct($input: CreateProductInput!) {
          createProduct(input: $input) {
            id
          }
        }
      `;

      const variables = {
        input: {
          asin: testProduct.asin, // Duplicate ASIN
          title: 'Duplicate Product',
          price: 50.00,
        },
      };

      const response = await global.apiUtils.graphqlRequest(mutation, variables, testAdmin);

      global.apiUtils.expectGraphQLError(response, 'already exists');
    });
  });

  describe('Performance', () => {
    test('should resolve nested queries efficiently', async () => {
      const startTime = Date.now();

      const query = `
        query ComplexQuery {
          products(limit: 10) {
            edges {
              node {
                id
                title
                categories {
                  id
                  name
                  products(limit: 5) {
                    edges {
                      node {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await global.apiUtils.graphqlRequest(query, {}, testUser);

      const duration = Date.now() - startTime;

      global.apiUtils.expectGraphQLSuccess(response);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle query complexity limits', async () => {
      // This would be a very complex query that should be rejected
      const complexQuery = `
        query OverlyComplexQuery {
          products {
            edges {
              node {
                categories {
                  products {
                    edges {
                      node {
                        categories {
                          products {
                            edges {
                              node {
                                id
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await global.apiUtils.graphqlRequest(complexQuery, {}, testUser);

      global.apiUtils.expectGraphQLError(response, 'complexity');
    });
  });
});
