import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import toast from 'react-hot-toast';

// HTTP link to GraphQL endpoint
const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:9000/api/v1/graphql',
});

// Auth link to add authorization headers
const authLink = setContext((_, { headers }) => {
  // Get auth token from localStorage (will implement auth later)
  const token = localStorage.getItem('auth-token');
  
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
  };
});

// Error link to handle GraphQL and network errors
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      console.error(
        `GraphQL error: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
      
      // Show user-friendly error messages
      if (message.includes('Unauthorized')) {
        toast.error('Please log in to continue');
        // Redirect to login or clear auth
        localStorage.removeItem('auth-token');
      } else if (message.includes('Forbidden')) {
        toast.error('You do not have permission to perform this action');
      } else {
        toast.error(`Error: ${message}`);
      }
    });
  }

  if (networkError) {
    console.error(`Network error: ${networkError}`);
    
    // Type guard for network errors with status codes
    const hasStatusCode = (error: any): error is { statusCode: number } => {
      return error && typeof error.statusCode === 'number';
    };
    
    if (hasStatusCode(networkError)) {
      if (networkError.statusCode === 401) {
        toast.error('Session expired. Please log in again.');
        localStorage.removeItem('auth-token');
      } else if (networkError.statusCode >= 500) {
        toast.error('Server error. Please try again later.');
      } else {
        toast.error('Network error. Please check your connection.');
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }
  }
});

// Create Apollo Client
export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          products: {
            // Handle pagination and refetches properly
            keyArgs: ['filters'],
            merge(existing = [], incoming, { args }) {
              // If offset is 0, it's a refetch - replace existing data
              if (args?.offset === 0) {
                return incoming;
              }
              // Otherwise, it's pagination - merge with existing
              return [...existing, ...incoming];
            },
          },
        },
      },
      Product: {
        fields: {
          categories: {
            merge: false, // Replace instead of merge
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
    },
    query: {
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
  connectToDevTools: import.meta.env.DEV,
});

export default apolloClient;
