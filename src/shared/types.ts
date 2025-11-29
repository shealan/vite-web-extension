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
  | 'RPC_REQUEST'
  | 'RPC_RESPONSE'
  | 'TAB_NAVIGATED';

export interface ExtensionMessage {
  source: 'apollo-lite-devtools';
  type: MessageType;
  payload?: unknown;
  tabId?: number;
}

// RPC types for internal use
export type RpcMethod = 'getQueries' | 'getMutations' | 'getCache' | 'getClientInfo';

// Raw query data from Apollo Client (used internally)
export interface RawWatchedQuery {
  id: string;
  operationName: string;
  queryString: string;
  variables?: Record<string, unknown>;
  cachedData?: unknown;
  lastResponse?: unknown; // Actual network response captured from fetch
  lastResponseTimestamp?: number;
  networkStatus: number;
  pollInterval?: number | null;
}

// Raw mutation data from Apollo Client (used internally)
export interface RawMutation {
  id: string;
  operationName: string;
  mutationString: string;
  variables?: Record<string, unknown>;
  loading: boolean;
  error?: unknown;
  lastResponse?: unknown; // Actual network response captured from fetch
  lastResponseTimestamp?: number;
}
