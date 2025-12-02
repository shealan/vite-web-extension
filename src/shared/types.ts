export interface RequestInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ResponseInfo {
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface GraphQLOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  result?: unknown;
  cachedData?: unknown; // The merged/paginated cached data from Apollo Client
  request?: RequestInfo; // The HTTP request info for debugging
  response?: ResponseInfo; // The HTTP response info for debugging
  options?: QueryOptions | null; // Apollo query options/policy
  pollInterval?: number | null; // Polling interval in ms (if query is polling)
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
  | 'TAB_NAVIGATED'
  // Proxy-related message types
  | 'PROXY_REGISTER'
  | 'PROXY_UNREGISTER'
  | 'PROXY_INSTANCES_UPDATE'
  | 'PROXY_REQUEST'
  | 'PROXY_RESPONSE'
  | 'PROXY_TARGET_REFRESHED';

export interface ExtensionMessage {
  source: 'apollo-lite-devtools';
  type: MessageType;
  payload?: unknown;
  tabId?: number;
}

// RPC types for internal use
export type RpcMethod = 'getQueries' | 'getMutations' | 'getCache' | 'getClientInfo' | 'setMockData' | 'getMockData' | 'clearAllMocks' | 'setProxyTarget' | 'clearProxy' | 'executeProxyRequest' | 'setProxyEnabled' | 'getProxyEnabled';

// Proxy types
export interface ProxyInstance {
  tabId: number;
  url: string;
  title?: string;
  isConnected: boolean;
}

export interface ProxyRequest {
  requestId: string;
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  sourceTabId: number;
}

export interface ProxyResponse {
  requestId: string;
  data?: unknown;
  error?: string;
  duration?: number;
}

// Apollo query options/policy
export interface QueryOptions {
  fetchPolicy?: string | null;
  errorPolicy?: string | null;
  notifyOnNetworkStatusChange?: boolean;
  returnPartialData?: boolean;
  partialRefetch?: boolean;
  canonizeResults?: boolean | null;
}

// Raw query data from Apollo Client (used internally)
export interface RawWatchedQuery {
  id: string;
  operationName: string;
  queryString: string;
  variables?: Record<string, unknown>;
  cachedData?: unknown;
  lastResponse?: unknown; // Actual network response captured from fetch
  lastResponseTimestamp?: number;
  lastResponseDuration?: number; // Duration of the last network request in ms
  lastRequest?: RequestInfo; // HTTP request info for debugging
  lastResponseInfo?: ResponseInfo; // HTTP response info for debugging
  isProxied?: boolean; // Flag indicating if this response was proxied from another tab
  networkStatus: number;
  pollInterval?: number | null;
  options?: QueryOptions | null; // Apollo query options/policy
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
  lastResponseDuration?: number; // Duration of the last network request in ms
  lastRequest?: RequestInfo; // HTTP request info for debugging
  lastResponseInfo?: ResponseInfo; // HTTP response info for debugging
}
