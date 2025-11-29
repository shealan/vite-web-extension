export interface GraphQLOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  result?: unknown;
  cachedData?: unknown; // The merged/paginated cached data from Apollo Client
  error?: string;
  timestamp: number;
  duration?: number;
  status: 'loading' | 'success' | 'error';
}

export interface ApolloCache {
  data: Record<string, unknown>;
  timestamp: number;
}

export type MessageType =
  | 'APOLLO_CLIENT_DETECTED'
  | 'APOLLO_CLIENT_NOT_FOUND'
  | 'GRAPHQL_OPERATION'
  | 'CACHE_UPDATE'
  | 'REQUEST_CACHE'
  | 'DEVTOOLS_PANEL_OPENED'
  | 'DEVTOOLS_PANEL_CLOSED';

export interface ExtensionMessage {
  source: 'apollo-lite-devtools';
  type: MessageType;
  payload?: unknown;
  tabId?: number;
}
