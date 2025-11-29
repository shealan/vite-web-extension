// Apollo Lite DevTools - Injected Script
// This runs in the page context to access Apollo Client internals
// Uses RPC for polling + fetch interception for capturing actual responses
(function() {
  'use strict';

  const SOURCE = 'apollo-lite-devtools-page';

  // Store last response for each operation (by operation name)
  const lastResponses = new Map();

  function postMessage(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, '*');
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

  // Simple GraphQL AST to string printer (minimal implementation)
  function printGraphQL(document) {
    if (!document || !document.definitions) return '';

    try {
      // First try to use the source if available
      if (document.loc && document.loc.source && document.loc.source.body) {
        return document.loc.source.body;
      }

      // Otherwise, reconstruct from AST
      const parts = [];

      for (const def of document.definitions) {
        if (def.kind === 'OperationDefinition') {
          let opStr = def.operation;
          if (def.name) {
            opStr += ' ' + def.name.value;
          }
          if (def.variableDefinitions && def.variableDefinitions.length > 0) {
            opStr += '(' + def.variableDefinitions.map(printVariableDefinition).join(', ') + ')';
          }
          opStr += ' ' + printSelectionSet(def.selectionSet);
          parts.push(opStr);
        } else if (def.kind === 'FragmentDefinition') {
          let fragStr = 'fragment ' + def.name.value + ' on ' + def.typeCondition.name.value;
          fragStr += ' ' + printSelectionSet(def.selectionSet);
          parts.push(fragStr);
        }
      }

      return parts.join('\n\n');
    } catch (e) {
      console.error('[Apollo Lite] Failed to print GraphQL:', e);
      return '';
    }
  }

  function printVariableDefinition(varDef) {
    let str = '$' + varDef.variable.name.value + ': ' + printType(varDef.type);
    if (varDef.defaultValue) {
      str += ' = ' + printValue(varDef.defaultValue);
    }
    return str;
  }

  function printType(type) {
    if (type.kind === 'NonNullType') {
      return printType(type.type) + '!';
    }
    if (type.kind === 'ListType') {
      return '[' + printType(type.type) + ']';
    }
    return type.name.value;
  }

  function printValue(value) {
    if (!value) return 'null';
    switch (value.kind) {
      case 'IntValue':
      case 'FloatValue':
        return value.value;
      case 'StringValue':
        return JSON.stringify(value.value);
      case 'BooleanValue':
        return value.value ? 'true' : 'false';
      case 'NullValue':
        return 'null';
      case 'EnumValue':
        return value.value;
      case 'Variable':
        return '$' + value.name.value;
      case 'ListValue':
        return '[' + value.values.map(printValue).join(', ') + ']';
      case 'ObjectValue':
        return '{' + value.fields.map(f => f.name.value + ': ' + printValue(f.value)).join(', ') + '}';
      default:
        return '';
    }
  }

  function printSelectionSet(selectionSet, indent) {
    indent = indent || '';
    if (!selectionSet || !selectionSet.selections) return '{}';

    const innerIndent = indent + '  ';
    const selections = selectionSet.selections.map(function(sel) {
      return innerIndent + printSelection(sel, innerIndent);
    });

    return '{\n' + selections.join('\n') + '\n' + indent + '}';
  }

  function printSelection(selection, indent) {
    if (selection.kind === 'Field') {
      let str = '';
      if (selection.alias) {
        str += selection.alias.value + ': ';
      }
      str += selection.name.value;

      if (selection.arguments && selection.arguments.length > 0) {
        str += '(' + selection.arguments.map(function(arg) {
          return arg.name.value + ': ' + printValue(arg.value);
        }).join(', ') + ')';
      }

      if (selection.directives && selection.directives.length > 0) {
        str += ' ' + selection.directives.map(printDirective).join(' ');
      }

      if (selection.selectionSet) {
        str += ' ' + printSelectionSet(selection.selectionSet, indent);
      }

      return str;
    } else if (selection.kind === 'FragmentSpread') {
      return '...' + selection.name.value;
    } else if (selection.kind === 'InlineFragment') {
      let str = '...';
      if (selection.typeCondition) {
        str += ' on ' + selection.typeCondition.name.value;
      }
      str += ' ' + printSelectionSet(selection.selectionSet, indent);
      return str;
    }
    return '';
  }

  function printDirective(directive) {
    let str = '@' + directive.name.value;
    if (directive.arguments && directive.arguments.length > 0) {
      str += '(' + directive.arguments.map(function(arg) {
        return arg.name.value + ': ' + printValue(arg.value);
      }).join(', ') + ')';
    }
    return str;
  }

  // Extract the full cache from Apollo Client
  function getCache() {
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

  // Get all active watched queries with their cached data
  function getQueries() {
    const client = getApolloClient();
    if (!client || !client.queryManager) return [];

    const queries = [];

    try {
      let observableQueries;
      if (typeof client.queryManager.getObservableQueries === 'function') {
        observableQueries = client.queryManager.getObservableQueries('active');
      } else if (client.queryManager.queries) {
        observableQueries = client.queryManager.queries;
      }

      if (observableQueries) {
        observableQueries.forEach(function(oq, queryId) {
          try {
            const queryInfo = oq.queryInfo || (oq.observableQuery && oq.observableQuery.queryInfo);

            let cachedData = null;
            let document = null;
            let variables = null;
            let networkStatus = 7;

            if (queryInfo) {
              if (typeof queryInfo.getDiff === 'function') {
                const diff = queryInfo.getDiff();
                cachedData = diff ? diff.result : null;
              }
              document = queryInfo.document;
              variables = queryInfo.variables;
            }

            if (!cachedData && oq.getCurrentResult) {
              try {
                const result = oq.getCurrentResult(false);
                cachedData = result ? result.data : null;
                networkStatus = result ? result.networkStatus : 7;
              } catch (e) {
                // Ignore
              }
            }

            if (!document && oq.options) {
              document = oq.options.query;
            }
            if (!variables && oq.options) {
              variables = oq.options.variables;
            }

            if (oq.getCurrentResult) {
              try {
                const result = oq.getCurrentResult(false);
                networkStatus = result ? result.networkStatus : 7;
              } catch (e) {
                // Ignore
              }
            }

            let operationName = 'Unknown';
            if (document && document.definitions) {
              for (const def of document.definitions) {
                if (def.kind === 'OperationDefinition' && def.name) {
                  operationName = def.name.value;
                  break;
                }
              }
            }

            const queryString = printGraphQL(document);

            let pollInterval = null;
            if (oq.pollingInfo) {
              pollInterval = oq.pollingInfo.interval;
            } else if (oq.options && oq.options.pollInterval) {
              pollInterval = oq.options.pollInterval;
            }

            // Get last captured response for this operation
            const lastResponse = lastResponses.get(operationName);

            queries.push({
              id: queryId,
              operationName: operationName,
              queryString: queryString,
              variables: variables,
              cachedData: cachedData,
              // Include the last actual network response
              lastResponse: lastResponse ? lastResponse.data : null,
              lastResponseTimestamp: lastResponse ? lastResponse.timestamp : null,
              networkStatus: networkStatus,
              pollInterval: pollInterval,
            });
          } catch (e) {
            console.error('[Apollo Lite] Error processing query:', e);
          }
        });
      }
    } catch (e) {
      console.error('[Apollo Lite] Failed to get queries:', e);
    }

    return queries;
  }

  // Get all mutations from Apollo Client's mutation store
  function getMutations() {
    const client = getApolloClient();
    if (!client || !client.queryManager) return [];

    const mutations = [];

    try {
      const mutationStore = client.queryManager.mutationStore;
      if (!mutationStore) return [];

      const mutationsObj = typeof mutationStore.getStore === 'function'
        ? mutationStore.getStore()
        : mutationStore;

      if (mutationsObj && typeof mutationsObj === 'object') {
        Object.keys(mutationsObj).forEach(function(key) {
          const mutation = mutationsObj[key];
          if (!mutation) return;

          let operationName = 'Unknown';
          const document = mutation.mutation;

          if (document && document.definitions) {
            for (const def of document.definitions) {
              if (def.kind === 'OperationDefinition' && def.name) {
                operationName = def.name.value;
                break;
              }
            }
          }

          const mutationString = printGraphQL(document);

          // Get last captured response for this mutation
          const lastResponse = lastResponses.get(operationName);

          mutations.push({
            id: key,
            operationName: operationName,
            mutationString: mutationString,
            variables: mutation.variables || null,
            loading: mutation.loading || false,
            error: mutation.error ? serializeError(mutation.error) : null,
            lastResponse: lastResponse ? lastResponse.data : null,
            lastResponseTimestamp: lastResponse ? lastResponse.timestamp : null,
          });
        });
      }
    } catch (e) {
      console.error('[Apollo Lite] Failed to get mutations:', e);
    }

    return mutations;
  }

  function serializeError(error) {
    if (!error) return null;
    return {
      message: error.message || String(error),
      name: error.name || 'Error',
      stack: error.stack,
      graphQLErrors: error.graphQLErrors || [],
      networkError: error.networkError ? {
        message: error.networkError.message,
        name: error.networkError.name,
      } : null,
    };
  }

  // Intercept fetch to capture GraphQL responses
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input.url;

    // Check if this looks like a GraphQL request
    const isGraphQL = url.includes('graphql') ||
                      (init && init.body && typeof init.body === 'string' && init.body.includes('"query"'));

    if (!isGraphQL) {
      return originalFetch.apply(this, arguments);
    }

    // Parse the request to get operation info
    let operationName = null;
    let queryString = null;
    let variables = null;

    try {
      if (init && init.body) {
        const body = JSON.parse(init.body);
        operationName = body.operationName;
        queryString = body.query;
        variables = body.variables;
      }
    } catch (e) {
      // Not JSON, ignore
    }

    return originalFetch.apply(this, arguments).then(function(response) {
      // Clone the response so we can read the body
      const clonedResponse = response.clone();

      clonedResponse.json().then(function(data) {
        if (operationName && data) {
          // Store the response for this operation
          lastResponses.set(operationName, {
            data: data,
            timestamp: Date.now(),
            variables: variables,
          });

          // Keep map size bounded
          if (lastResponses.size > 100) {
            const firstKey = lastResponses.keys().next().value;
            lastResponses.delete(firstKey);
          }
        }
      }).catch(function() {
        // Not JSON response, ignore
      });

      return response;
    });
  };

  // RPC request handlers
  const rpcHandlers = {
    getQueries: function() {
      return getQueries();
    },
    getMutations: function() {
      return getMutations();
    },
    getCache: function() {
      return getCache();
    },
    getClientInfo: function() {
      const client = getApolloClient();
      if (!client) return null;
      return {
        version: client.version || 'unknown',
        queryCount: getQueries().length,
        mutationCount: getMutations().length,
      };
    },
  };

  // Listen for RPC requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'apollo-lite-devtools-content') return;

    const type = event.data.type;
    const requestId = event.data.requestId;

    // Handle RPC requests
    if (type === 'RPC_REQUEST' && event.data.method) {
      const method = event.data.method;
      const handler = rpcHandlers[method];

      if (handler) {
        try {
          const result = handler(event.data.params);
          postMessage('RPC_RESPONSE', {
            requestId: requestId,
            result: result,
          });
        } catch (e) {
          postMessage('RPC_RESPONSE', {
            requestId: requestId,
            error: e.message,
          });
        }
      } else {
        postMessage('RPC_RESPONSE', {
          requestId: requestId,
          error: 'Unknown method: ' + method,
        });
      }
      return;
    }

    // Legacy handlers for backwards compatibility
    if (type === 'REQUEST_CACHE') {
      const cache = getCache();
      if (cache) {
        postMessage('CACHE_UPDATE', { data: cache, timestamp: Date.now() });
      }
    }

    if (type === 'REQUEST_WATCHED_QUERIES') {
      const queries = getQueries();
      postMessage('WATCHED_QUERIES', { queries: queries, timestamp: Date.now() });
    }
  });

  // Set up Apollo Client detection
  function checkForApolloClient() {
    const client = getApolloClient();
    if (client) {
      console.log('[Apollo Lite] Apollo Client found!', client);
      postMessage('APOLLO_CLIENT_DETECTED', {
        version: client.version || 'unknown',
        hasCache: !!client.cache,
      });
      return true;
    }
    return false;
  }

  // Watch for __APOLLO_CLIENT__ being set
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
          postMessage('APOLLO_CLIENT_DETECTED', {
            version: client.version || 'unknown',
            hasCache: !!client.cache,
          });
        }
      },
      configurable: true,
    });
  } catch (e) {
    console.log('[Apollo Lite] Could not set up property watcher:', e);
  }

  // Check for Apollo Client on load and periodically
  if (!checkForApolloClient()) {
    let retries = 0;
    const maxRetries = 10;

    const interval = setInterval(function() {
      retries++;
      if (checkForApolloClient() || retries >= maxRetries) {
        clearInterval(interval);
        if (retries >= maxRetries && !getApolloClient()) {
          console.log('[Apollo Lite] Apollo Client not found after retries');
          postMessage('APOLLO_CLIENT_NOT_FOUND', {});
        }
      }
    }, 1000);
  }

  console.log('[Apollo Lite] Injected script loaded - RPC handlers ready, fetch intercepted');
})();
