// Apollo Lite DevTools - Injected Script
// This runs in the page context to intercept GraphQL operations and access Apollo Client internals
(function() {
  'use strict';

  const SOURCE = 'apollo-lite-devtools-page';
  let fetchHooked = false;

  function postMessage(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, '*');
  }

  function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function getApolloClient() {
    // Check common locations for Apollo Client
    if (window.__APOLLO_CLIENT__) return window.__APOLLO_CLIENT__;
    if (window.APOLLO_CLIENT) return window.APOLLO_CLIENT;

    // Check for Apollo DevTools hook
    if (window.__APOLLO_DEVTOOLS_GLOBAL_HOOK__) {
      const hook = window.__APOLLO_DEVTOOLS_GLOBAL_HOOK__;
      if (hook.ApolloClient) return hook.ApolloClient;
    }

    return null;
  }

  function extractCache() {
    const client = getApolloClient();
    if (!client || !client.cache) return null;

    try {
      if (typeof client.cache.extract === 'function') {
        return client.cache.extract();
      }
      if (client.cache.data && client.cache.data.data) {
        return client.cache.data.data;
      }
      return null;
    } catch (e) {
      console.error('[Apollo Lite] Failed to extract cache:', e);
      return null;
    }
  }

  // Get cached data for a specific query using Apollo Client's diff method
  // This is how the official Apollo DevTools gets the merged/paginated data
  function getCachedDataForQuery(operationName, query, variables) {
    const client = getApolloClient();
    if (!client || !client.cache) return null;

    try {
      // Try to read the query directly from the cache
      // This returns the merged result for paginated queries
      const result = client.cache.readQuery({
        query: parseQuery(query),
        variables: variables,
      });
      return result;
    } catch (e) {
      // Query not in cache or parse error - this is normal for new queries
      return null;
    }
  }

  // Simple GraphQL query parser (minimal implementation)
  // For full support, we'd need graphql-tag, but this works for most cases
  function parseQuery(queryString) {
    // If it's already a DocumentNode, return it
    if (queryString && queryString.kind === 'Document') {
      return queryString;
    }

    // Try to use gql if available globally
    if (window.gql) {
      try {
        return window.gql(queryString);
      } catch (e) {
        // Fall through
      }
    }

    // Try to access Apollo's internal parser
    const client = getApolloClient();
    if (client && client.cache && client.cache.policies && client.cache.policies.rootTypenamesById) {
      // Apollo Client 3.x has gql available through various means
      try {
        // Try using the cache's read method which can accept string queries in some versions
        return { kind: 'Document', definitions: [], __raw: queryString };
      } catch (e) {
        // Fall through
      }
    }

    return null;
  }

  // Get all active watched queries and their cached data
  // This mirrors the approach used by official Apollo DevTools
  function getWatchedQueries() {
    const client = getApolloClient();
    if (!client || !client.queryManager) return [];

    const queries = [];

    try {
      // Apollo Client 3.4+ uses getObservableQueries
      let observableQueries;
      if (typeof client.queryManager.getObservableQueries === 'function') {
        observableQueries = client.queryManager.getObservableQueries('active');
      } else if (client.queryManager.queries) {
        // Older versions
        observableQueries = client.queryManager.queries;
      }

      if (observableQueries) {
        observableQueries.forEach((oq, queryId) => {
          try {
            // Get the query info which contains the cached diff
            const queryInfo = oq.queryInfo || (oq.observableQuery && oq.observableQuery.queryInfo);

            let cachedData = null;
            let document = null;
            let variables = null;

            if (queryInfo) {
              // This is how Apollo DevTools gets the cached data
              if (typeof queryInfo.getDiff === 'function') {
                const diff = queryInfo.getDiff();
                cachedData = diff ? diff.result : null;
              }
              document = queryInfo.document;
              variables = queryInfo.variables;
            }

            // Fallback: try to get from observable query directly
            if (!cachedData && oq.getCurrentResult) {
              try {
                const result = oq.getCurrentResult(false);
                cachedData = result ? result.data : null;
              } catch (e) {
                // Ignore
              }
            }

            // Get document from options if not found
            if (!document && oq.options) {
              document = oq.options.query;
            }
            if (!variables && oq.options) {
              variables = oq.options.variables;
            }

            // Extract operation name from document
            let operationName = 'Unknown';
            if (document && document.definitions) {
              for (const def of document.definitions) {
                if (def.kind === 'OperationDefinition' && def.name) {
                  operationName = def.name.value;
                  break;
                }
              }
            }

            queries.push({
              id: queryId,
              operationName,
              cachedData,
              variables,
            });
          } catch (e) {
            console.error('[Apollo Lite] Error processing query:', e);
          }
        });
      }
    } catch (e) {
      console.error('[Apollo Lite] Failed to get watched queries:', e);
    }

    return queries;
  }

  // Hook into fetch immediately to capture all GraphQL requests
  function hookFetch() {
    if (fetchHooked) return;
    fetchHooked = true;

    const originalFetch = window.fetch;

    window.fetch = async function(input, init) {
      const startTime = Date.now();

      // Check if this is a GraphQL request
      let isGraphQL = false;
      let operationData = null;
      let operationType = 'query';

      try {
        if (init && init.body && typeof init.body === 'string') {
          const body = JSON.parse(init.body);
          if (body.query) {
            isGraphQL = true;
            operationData = body;

            const queryStr = body.query || '';
            const trimmed = queryStr.trim();
            if (trimmed.startsWith('mutation')) {
              operationType = 'mutation';
            } else if (trimmed.startsWith('subscription')) {
              operationType = 'subscription';
            }

            console.log('[Apollo Lite] Intercepted GraphQL request:', body.operationName || 'Unknown');

            // Send loading state immediately
            postMessage('GRAPHQL_OPERATION_START', {
              operationName: operationData.operationName || 'Unknown',
              type: operationType,
              query: operationData.query,
              variables: operationData.variables,
              timestamp: startTime,
            });
          }
        }
      } catch (e) {
        // Not JSON or not GraphQL
      }

      const response = await originalFetch.call(window, input, init);

      if (isGraphQL && operationData) {
        const duration = Date.now() - startTime;

        // Clone response to read body without consuming it
        const clonedResponse = response.clone();

        try {
          const result = await clonedResponse.json();

          console.log('[Apollo Lite] GraphQL response received:', operationData.operationName || 'Unknown', duration + 'ms');

          // Wait a bit for Apollo to process the response and update cache
          setTimeout(function() {
            // Try to get the cached data for this operation
            let cachedData = null;
            const watchedQueries = getWatchedQueries();
            const matchingQuery = watchedQueries.find(q => q.operationName === operationData.operationName);
            if (matchingQuery) {
              cachedData = matchingQuery.cachedData;
            }

            postMessage('GRAPHQL_OPERATION_COMPLETE', {
              operationName: operationData.operationName || 'Unknown',
              type: operationType,
              query: operationData.query,
              variables: operationData.variables,
              result: result,
              cachedData: cachedData, // The merged/paginated cached data from Apollo
              error: result.errors ? JSON.stringify(result.errors) : undefined,
              timestamp: startTime,
              duration: duration,
              status: result.errors ? 'error' : 'success',
            });

            // Also send updated cache
            const updatedCache = extractCache();
            if (updatedCache) {
              postMessage('CACHE_UPDATE', { data: updatedCache, timestamp: Date.now() });
            }
          }, 150); // Give Apollo time to process the response
        } catch (e) {
          console.error('[Apollo Lite] Failed to parse GraphQL response:', e);

          // Send error state
          postMessage('GRAPHQL_OPERATION_COMPLETE', {
            operationName: operationData.operationName || 'Unknown',
            type: operationType,
            query: operationData.query,
            variables: operationData.variables,
            error: 'Failed to parse response',
            timestamp: startTime,
            duration: Date.now() - startTime,
            status: 'error',
          });
        }
      }

      return response;
    };

    console.log('[Apollo Lite] Fetch interceptor installed');
  }

  // Listen for messages from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'apollo-lite-devtools-content') return;

    var type = event.data.type;

    if (type === 'REQUEST_CACHE') {
      var cache = extractCache();
      if (cache) {
        postMessage('CACHE_UPDATE', { data: cache, timestamp: Date.now() });
      }

      // Also send watched queries data
      var watchedQueries = getWatchedQueries();
      if (watchedQueries.length > 0) {
        postMessage('WATCHED_QUERIES', { queries: watchedQueries, timestamp: Date.now() });
      }
    }

    if (type === 'REQUEST_WATCHED_QUERIES') {
      var watchedQueries = getWatchedQueries();
      postMessage('WATCHED_QUERIES', { queries: watchedQueries, timestamp: Date.now() });
    }
  });

  // Install fetch interceptor immediately
  hookFetch();

  // Send connected message - we're ready to intercept GraphQL even without Apollo Client detected
  postMessage('APOLLO_CLIENT_DETECTED', { version: 'interceptor-mode' });

  // Also try to detect Apollo Client for cache access
  function checkForApolloClient() {
    const client = getApolloClient();
    if (client) {
      console.log('[Apollo Lite] Apollo Client found!', client);
      postMessage('APOLLO_CLIENT_DETECTED', { version: client.version || 'unknown', hasCache: true });

      // Send initial cache
      const cache = extractCache();
      if (cache) {
        postMessage('CACHE_UPDATE', { data: cache, timestamp: Date.now() });
      }

      // Send watched queries
      const watchedQueries = getWatchedQueries();
      if (watchedQueries.length > 0) {
        postMessage('WATCHED_QUERIES', { queries: watchedQueries, timestamp: Date.now() });
      }

      return true;
    }
    return false;
  }

  // Set up a property watcher to detect when __APOLLO_CLIENT__ is set
  let _apolloClient = window.__APOLLO_CLIENT__;

  try {
    Object.defineProperty(window, '__APOLLO_CLIENT__', {
      get: function() {
        return _apolloClient;
      },
      set: function(client) {
        console.log('[Apollo Lite] __APOLLO_CLIENT__ was set!', client);
        _apolloClient = client;
        if (client) {
          postMessage('APOLLO_CLIENT_DETECTED', { version: client.version || 'unknown', hasCache: true });
          const cache = extractCache();
          if (cache) {
            postMessage('CACHE_UPDATE', { data: cache, timestamp: Date.now() });
          }
        }
      },
      configurable: true,
    });
  } catch (e) {
    console.log('[Apollo Lite] Could not set up property watcher:', e);
  }

  // Check for Apollo Client periodically (for cache access)
  if (!checkForApolloClient()) {
    var retries = 0;
    var maxRetries = 10;

    var interval = setInterval(function() {
      retries++;
      if (checkForApolloClient() || retries >= maxRetries) {
        clearInterval(interval);
        if (retries >= maxRetries) {
          console.log('[Apollo Lite] Apollo Client not found - cache inspection unavailable, but GraphQL interception is active');
        }
      }
    }, 1000);
  }

  console.log('[Apollo Lite] Injected script loaded - GraphQL interception active');
})();
