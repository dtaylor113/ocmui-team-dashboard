import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a QueryClient instance with our configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes - data is considered "fresh" 
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 10 minutes after last use
      gcTime: 10 * 60 * 1000,
      // Retry failed requests twice
      retry: 2,
      // Only refetch on window focus if data is stale (older than staleTime)
      refetchOnWindowFocus: true,
      // Only refetch when coming back online if data is stale
      refetchOnReconnect: true,
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

export { queryClient };
