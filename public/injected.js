// Leonardo.Ai DevTools - Injected Script
// This runs in the page context to access Apollo Client internals
// Uses RPC for polling + fetch interception for capturing actual responses
(function () {
  "use strict";

  const SOURCE = "apollo-lite-devtools-page";

  // Store last response for each operation (by operation name)
  const lastResponses = new Map();

  // Store mock data overrides for operations (by operation name)
  const mockOverrides = new Map();

  // Unique instance ID for debugging
  const INSTANCE_ID = Math.random().toString(36).slice(2, 8);

  // Proxy mode state - stored on window to persist across script re-injections
  // and be shared across multiple instances (e.g., iframes)
  // Note: proxyEnabled is a SET of operation names that should be proxied (like mocks)
  const PROXY_STATE_KEY = "__LEONARDO_DEVTOOLS_PROXY_STATE__";
  if (!window[PROXY_STATE_KEY]) {
    window[PROXY_STATE_KEY] = {
      enabled: false, // Global toggle - when true, operations in proxyOperations will be proxied
      proxyOperations: new Set(), // Set of operation names to proxy
      pendingFetches: new Map(),
      createdBy: INSTANCE_ID,
    };
  }
  const proxyState = window[PROXY_STATE_KEY];

  // Toast notification system for mock indicators
  const toastContainer = {
    element: null,
    toasts: new Map(),
    lastShown: new Map(), // Track when each operation was last shown (for debouncing)

    init: function () {
      if (this.element) return;

      // Wait for body to exist
      if (!document.body) {
        console.log(
          "[Leonardo.Ai] Toast: document.body not ready, deferring init"
        );
        return false;
      }

      this.element = document.createElement("div");
      this.element.id = "apollo-lite-toast-container";
      this.element.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      document.body.appendChild(this.element);
      return true;
    },

    show: function (operationName) {
      // Debounce: don't show toast for same operation within 3 seconds
      const now = Date.now();
      const lastTime = this.lastShown.get(operationName) || 0;
      if (now - lastTime < 3000) {
        return;
      }
      this.lastShown.set(operationName, now);

      this.init();

      // If container couldn't be initialized, skip showing toast
      if (!this.element) {
        console.log(
          "[Leonardo.Ai] Toast: Cannot show toast, container not ready"
        );
        return;
      }

      // Toast shown for operation (verbose logging removed)

      // If toast already exists for this operation, just update the timestamp
      if (this.toasts.has(operationName)) {
        const existing = this.toasts.get(operationName);
        existing.timestamp = Date.now();
        // Restart the fade animation
        existing.element.style.animation = "none";
        existing.element.offsetHeight; // Trigger reflow
        existing.element.style.animation = "apolloLiteToastFadeIn 0.3s ease";
        return;
      }

      const toast = document.createElement("div");
      toast.style.cssText = `
        background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
        color: white;
        padding: 12px 18px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        animation: apolloLiteToastFadeIn 0.3s ease;
        max-width: 500px;
        white-space: nowrap;
      `;

      // Add keyframes if not already added
      if (!document.getElementById("apollo-lite-toast-styles")) {
        const style = document.createElement("style");
        style.id = "apollo-lite-toast-styles";
        style.textContent = `
          @keyframes apolloLiteToastFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes apolloLiteToastFadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(20px); }
          }
        `;
        document.head.appendChild(style);
      }

      // Icon (database-zap style - cylinder with lightning bolt)
      const icon = document.createElement("span");
      icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/><path d="M13 12l-2 4h3l-2 4"/></svg>';
      icon.style.cssText =
        "display: flex; align-items: center; flex-shrink: 0;";

      // Text
      const text = document.createElement("span");
      text.style.cssText = "flex-shrink: 0;";
      text.textContent = operationName + " data is being mocked";

      // Close button
      const closeBtn = document.createElement("button");
      closeBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        opacity: 0.7;
        flex-shrink: 0;
        margin-left: 6px;
      `;
      closeBtn.onmouseover = function () {
        closeBtn.style.opacity = "1";
      };
      closeBtn.onmouseout = function () {
        closeBtn.style.opacity = "0.7";
      };
      closeBtn.onclick = function () {
        toastContainer.hide(operationName);
      };

      toast.appendChild(icon);
      toast.appendChild(text);
      toast.appendChild(closeBtn);

      this.element.appendChild(toast);
      this.toasts.set(operationName, { element: toast, timestamp: Date.now() });

      // Auto-hide after 5 seconds
      setTimeout(function () {
        toastContainer.hide(operationName);
      }, 5000);
    },

    // Show a proxy toast (orange theme)
    showProxy: function (operationName) {
      // Debounce: don't show toast for same operation within 3 seconds
      const proxyKey = "proxy-" + operationName;
      const now = Date.now();
      const lastTime = this.lastShown.get(proxyKey) || 0;
      if (now - lastTime < 3000) {
        return;
      }
      this.lastShown.set(proxyKey, now);

      this.init();

      // If container couldn't be initialized, skip showing toast
      if (!this.element) {
        console.log(
          "[Leonardo.Ai] Toast: Cannot show proxy toast, container not ready"
        );
        return;
      }

      // If toast already exists for this operation, just update the timestamp
      if (this.toasts.has(proxyKey)) {
        const existing = this.toasts.get(proxyKey);
        existing.timestamp = Date.now();
        existing.element.style.animation = "none";
        existing.element.offsetHeight; // Trigger reflow
        existing.element.style.animation = "apolloLiteToastFadeIn 0.3s ease";
        return;
      }

      const toast = document.createElement("div");
      toast.style.cssText = `
        background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
        color: white;
        padding: 12px 18px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(234, 88, 12, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        animation: apolloLiteToastFadeIn 0.3s ease;
        max-width: 500px;
        white-space: nowrap;
      `;

      // Add keyframes if not already added
      if (!document.getElementById("apollo-lite-toast-styles")) {
        const style = document.createElement("style");
        style.id = "apollo-lite-toast-styles";
        style.textContent = `
          @keyframes apolloLiteToastFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes apolloLiteToastFadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(20px); }
          }
        `;
        document.head.appendChild(style);
      }

      // Proxy icon (arrow through circle)
      const icon = document.createElement("span");
      icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8l4 4-4 4"/></svg>';
      icon.style.cssText =
        "display: flex; align-items: center; flex-shrink: 0;";

      // Text
      const text = document.createElement("span");
      text.style.cssText = "flex-shrink: 0;";
      text.textContent = operationName + " data is being proxied";

      // Close button
      const closeBtnProxy = document.createElement("button");
      closeBtnProxy.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      closeBtnProxy.style.cssText = `
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        opacity: 0.7;
        flex-shrink: 0;
        margin-left: 6px;
      `;
      closeBtnProxy.onmouseover = function () {
        closeBtnProxy.style.opacity = "1";
      };
      closeBtnProxy.onmouseout = function () {
        closeBtnProxy.style.opacity = "0.7";
      };
      closeBtnProxy.onclick = function () {
        toastContainer.hide(proxyKey);
      };

      toast.appendChild(icon);
      toast.appendChild(text);
      toast.appendChild(closeBtnProxy);

      this.element.appendChild(toast);
      this.toasts.set(proxyKey, { element: toast, timestamp: Date.now() });

      // Auto-hide after 5 seconds
      setTimeout(function () {
        toastContainer.hide(proxyKey);
      }, 5000);
    },

    hide: function (operationName) {
      const toastData = this.toasts.get(operationName);
      if (!toastData) return;

      toastData.element.style.animation =
        "apolloLiteToastFadeOut 0.3s ease forwards";
      setTimeout(function () {
        if (toastData.element.parentNode) {
          toastData.element.parentNode.removeChild(toastData.element);
        }
        toastContainer.toasts.delete(operationName);
      }, 300);
    },
  };

  function postMessage(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, "*");
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
    if (!document || !document.definitions) return "";

    try {
      // First try to use the source if available
      if (document.loc && document.loc.source && document.loc.source.body) {
        return document.loc.source.body;
      }

      // Otherwise, reconstruct from AST
      const parts = [];

      for (const def of document.definitions) {
        if (def.kind === "OperationDefinition") {
          let opStr = def.operation;
          if (def.name) {
            opStr += " " + def.name.value;
          }
          if (def.variableDefinitions && def.variableDefinitions.length > 0) {
            opStr +=
              "(" +
              def.variableDefinitions.map(printVariableDefinition).join(", ") +
              ")";
          }
          opStr += " " + printSelectionSet(def.selectionSet);
          parts.push(opStr);
        } else if (def.kind === "FragmentDefinition") {
          let fragStr =
            "fragment " +
            def.name.value +
            " on " +
            def.typeCondition.name.value;
          fragStr += " " + printSelectionSet(def.selectionSet);
          parts.push(fragStr);
        }
      }

      return parts.join("\n\n");
    } catch (e) {
      console.error("[Leonardo.Ai] Failed to print GraphQL:", e);
      return "";
    }
  }

  function printVariableDefinition(varDef) {
    let str = "$" + varDef.variable.name.value + ": " + printType(varDef.type);
    if (varDef.defaultValue) {
      str += " = " + printValue(varDef.defaultValue);
    }
    return str;
  }

  function printType(type) {
    if (type.kind === "NonNullType") {
      return printType(type.type) + "!";
    }
    if (type.kind === "ListType") {
      return "[" + printType(type.type) + "]";
    }
    return type.name.value;
  }

  function printValue(value) {
    if (!value) return "null";
    switch (value.kind) {
      case "IntValue":
      case "FloatValue":
        return value.value;
      case "StringValue":
        return JSON.stringify(value.value);
      case "BooleanValue":
        return value.value ? "true" : "false";
      case "NullValue":
        return "null";
      case "EnumValue":
        return value.value;
      case "Variable":
        return "$" + value.name.value;
      case "ListValue":
        return "[" + value.values.map(printValue).join(", ") + "]";
      case "ObjectValue":
        return (
          "{" +
          value.fields
            .map((f) => f.name.value + ": " + printValue(f.value))
            .join(", ") +
          "}"
        );
      default:
        return "";
    }
  }

  function printSelectionSet(selectionSet, indent) {
    indent = indent || "";
    if (!selectionSet || !selectionSet.selections) return "{}";

    const innerIndent = indent + "  ";
    const selections = selectionSet.selections.map(function (sel) {
      return innerIndent + printSelection(sel, innerIndent);
    });

    return "{\n" + selections.join("\n") + "\n" + indent + "}";
  }

  function printSelection(selection, indent) {
    if (selection.kind === "Field") {
      let str = "";
      if (selection.alias) {
        str += selection.alias.value + ": ";
      }
      str += selection.name.value;

      if (selection.arguments && selection.arguments.length > 0) {
        str +=
          "(" +
          selection.arguments
            .map(function (arg) {
              return arg.name.value + ": " + printValue(arg.value);
            })
            .join(", ") +
          ")";
      }

      if (selection.directives && selection.directives.length > 0) {
        str += " " + selection.directives.map(printDirective).join(" ");
      }

      if (selection.selectionSet) {
        str += " " + printSelectionSet(selection.selectionSet, indent);
      }

      return str;
    } else if (selection.kind === "FragmentSpread") {
      return "..." + selection.name.value;
    } else if (selection.kind === "InlineFragment") {
      let str = "...";
      if (selection.typeCondition) {
        str += " on " + selection.typeCondition.name.value;
      }
      str += " " + printSelectionSet(selection.selectionSet, indent);
      return str;
    }
    return "";
  }

  function printDirective(directive) {
    let str = "@" + directive.name.value;
    if (directive.arguments && directive.arguments.length > 0) {
      str +=
        "(" +
        directive.arguments
          .map(function (arg) {
            return arg.name.value + ": " + printValue(arg.value);
          })
          .join(", ") +
        ")";
    }
    return str;
  }

  // Extract the full cache from Apollo Client
  function getCache() {
    const client = getApolloClient();
    if (!client || !client.cache) return null;

    try {
      if (typeof client.cache.extract === "function") {
        return client.cache.extract();
      }
      if (client.cache.data && client.cache.data.data) {
        return client.cache.data.data;
      }
      return null;
    } catch (e) {
      console.error("[Leonardo.Ai] Failed to extract cache:", e);
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
      if (typeof client.queryManager.getObservableQueries === "function") {
        observableQueries = client.queryManager.getObservableQueries("active");
      } else if (client.queryManager.queries) {
        observableQueries = client.queryManager.queries;
      }

      if (observableQueries) {
        observableQueries.forEach(function (oq, queryId) {
          try {
            const queryInfo =
              oq.queryInfo ||
              (oq.observableQuery && oq.observableQuery.queryInfo);

            let cachedData = null;
            let document = null;
            let variables = null;
            let networkStatus = 7;

            if (queryInfo) {
              if (typeof queryInfo.getDiff === "function") {
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

            let operationName = "Unknown";
            if (document && document.definitions) {
              for (const def of document.definitions) {
                if (def.kind === "OperationDefinition" && def.name) {
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

            // Extract policy options from the observable query
            let options = null;
            if (oq.options) {
              options = {
                fetchPolicy: oq.options.fetchPolicy || null,
                errorPolicy: oq.options.errorPolicy || null,
                notifyOnNetworkStatusChange: oq.options.notifyOnNetworkStatusChange || false,
                returnPartialData: oq.options.returnPartialData || false,
                partialRefetch: oq.options.partialRefetch || false,
                canonizeResults: oq.options.canonizeResults !== undefined ? oq.options.canonizeResults : null,
              };
            }

            queries.push({
              id: queryId,
              operationName: operationName,
              queryString: queryString,
              variables: variables,
              cachedData: cachedData,
              // Include the last actual network response
              lastResponse: lastResponse ? lastResponse.data : null,
              lastResponseTimestamp: lastResponse
                ? lastResponse.timestamp
                : null,
              lastResponseDuration: lastResponse ? lastResponse.duration : null,
              // Include request info for debugging
              lastRequest: lastResponse ? lastResponse.request : null,
              // Include response info (status, headers)
              lastResponseInfo: lastResponse ? lastResponse.response : null,
              // Flag indicating if this response was proxied from another tab
              isProxied: lastResponse ? lastResponse.isProxied === true : false,
              networkStatus: networkStatus,
              pollInterval: pollInterval,
              // Include policy options
              options: options,
            });
          } catch (e) {
            console.error("[Leonardo.Ai] Error processing query:", e);
          }
        });
      }
    } catch (e) {
      console.error("[Leonardo.Ai] Failed to get queries:", e);
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

      const mutationsObj =
        typeof mutationStore.getStore === "function"
          ? mutationStore.getStore()
          : mutationStore;

      if (mutationsObj && typeof mutationsObj === "object") {
        Object.keys(mutationsObj).forEach(function (key) {
          const mutation = mutationsObj[key];
          if (!mutation) return;

          let operationName = "Unknown";
          const document = mutation.mutation;

          if (document && document.definitions) {
            for (const def of document.definitions) {
              if (def.kind === "OperationDefinition" && def.name) {
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
            lastResponseDuration: lastResponse ? lastResponse.duration : null,
            // Include request info for debugging
            lastRequest: lastResponse ? lastResponse.request : null,
            // Include response info (status, headers)
            lastResponseInfo: lastResponse ? lastResponse.response : null,
          });
        });
      }
    } catch (e) {
      console.error("[Leonardo.Ai] Failed to get mutations:", e);
    }

    return mutations;
  }

  function serializeError(error) {
    if (!error) return null;
    return {
      message: error.message || String(error),
      name: error.name || "Error",
      stack: error.stack,
      graphQLErrors: error.graphQLErrors || [],
      networkError: error.networkError
        ? {
            message: error.networkError.message,
            name: error.networkError.name,
          }
        : null,
    };
  }

  // Helper to extract headers from various formats
  function extractHeaders(init, input) {
    const headers = {};

    // Get headers from init object
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach(function (value, key) {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(function (pair) {
          headers[pair[0]] = pair[1];
        });
      } else if (typeof init.headers === "object") {
        Object.keys(init.headers).forEach(function (key) {
          headers[key] = init.headers[key];
        });
      }
    }

    // Also check if input is a Request object with headers
    if (input instanceof Request) {
      input.headers.forEach(function (value, key) {
        if (!headers[key]) {
          headers[key] = value;
        }
      });
    }

    return headers;
  }

  // Intercept fetch to capture GraphQL responses and apply mock overrides
  // Only wrap fetch once - store original on window to prevent double-wrapping
  const ORIGINAL_FETCH_KEY = "__LEONARDO_DEVTOOLS_ORIGINAL_FETCH__";
  if (!window[ORIGINAL_FETCH_KEY]) {
    window[ORIGINAL_FETCH_KEY] = window.fetch;
  }
  const originalFetch = window[ORIGINAL_FETCH_KEY];

  // Only set up the interceptor if we haven't already
  const FETCH_WRAPPED_KEY = "__LEONARDO_DEVTOOLS_FETCH_WRAPPED__";
  if (window[FETCH_WRAPPED_KEY]) {
    // Already wrapped, skip
  } else {
    window[FETCH_WRAPPED_KEY] = true;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input.url;

    // Check if this looks like a GraphQL request
    const isGraphQL =
      url.includes("graphql") ||
      (init &&
        init.body &&
        typeof init.body === "string" &&
        init.body.includes('"query"'));

    // Detect logout - next-auth signout endpoint
    if (url.includes('/api/auth/signout') || url.includes('/api/auth/callback/signout')) {
      postMessage('USER_LOGGED_OUT', { timestamp: Date.now() });
      return originalFetch.apply(this, arguments);
    }

    if (!isGraphQL) {
      return originalFetch.apply(this, arguments);
    }

    // Parse the request to get operation info
    let operationName = null;
    let queryString = null;
    let variables = null;
    let requestBody = null;

    try {
      if (init && init.body) {
        requestBody = init.body;
        const body = JSON.parse(init.body);
        operationName = body.operationName;
        queryString = body.query;
        variables = body.variables;
      }
    } catch (e) {
      // Not JSON, ignore
    }

    // Capture request info
    const requestHeaders = extractHeaders(init, input);
    const requestInfo = {
      url: url,
      method: (init && init.method) || "POST",
      headers: requestHeaders,
      body: requestBody,
    };

    // Check if we have a mock override for this operation
    if (operationName && mockOverrides.has(operationName)) {
      const mockConfig = mockOverrides.get(operationName);
      let mockData;

      // Check if this is a JS mock (has __mockType and __mockScript)
      var isJsMock =
        mockConfig && mockConfig.__mockType === "js" && mockConfig.__mockScript;
      if (isJsMock) {
        try {
          // Execute the JS script to get the mock data
          // The script has access to: variables, operationName, request
          // request contains: url, method, headers, body (raw string), parsedBody (parsed JSON)
          var parsedBody = null;
          try {
            parsedBody = requestBody ? JSON.parse(requestBody) : null;
          } catch (e) {
            // Body is not valid JSON
          }
          var mockRequest = {
            url: url,
            method: (init && init.method) || "POST",
            headers: requestHeaders,
            body: requestBody,
            parsedBody: parsedBody,
          };
          // eslint-disable-next-line no-new-func
          const mockFn = new Function(
            "variables",
            "operationName",
            "request",
            mockConfig.__mockScript
          );
          mockData = mockFn(variables, operationName, mockRequest);
        } catch (e) {
          console.error(
            "[Leonardo.Ai] JS mock execution error for:",
            operationName,
            e
          );
          // On error, fall through to real request
          return originalFetch.apply(this, arguments);
        }
      } else {
        // Regular JSON mock
        mockData = mockConfig;
      }

      // Show toast notification
      try {
        toastContainer.show(operationName);
      } catch (e) {
        console.error("[Leonardo.Ai] Toast error:", e);
      }

      // Store the mock as the last response
      lastResponses.set(operationName, {
        data: mockData,
        timestamp: Date.now(),
        variables: variables,
        isMocked: true,
        request: requestInfo,
        response: {
          status: 200,
          statusText: "OK (Mocked)",
          headers: { "content-type": "application/json" },
        },
      });

      // Return a fake Response with the mock data
      return Promise.resolve(
        new Response(JSON.stringify(mockData), {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": "application/json",
          },
        })
      );
    }

    // Check if this specific operation should be proxied
    // proxyState.enabled must be true AND the operation must be in proxyOperations set
    const shouldProxy = proxyState.enabled && operationName && queryString && proxyState.proxyOperations.has(operationName);
    if (shouldProxy) {

      // Generate a unique request ID
      const proxyRequestId = operationName + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);

      // Show proxy toast notification
      try {
        toastContainer.showProxy(operationName);
      } catch (e) {
        console.error("[Leonardo.Ai] Proxy toast error:", e);
      }

      // Create a promise that will be resolved when we get the proxy response
      return new Promise(function (resolve, reject) {
        // Set up timeout (30 seconds)
        const timeoutId = setTimeout(function () {
          proxyState.pendingFetches.delete(proxyRequestId);
          console.error("[Leonardo.Ai] Proxy request timeout for:", operationName);
          // On timeout, fall back to local execution
          originalFetch.apply(window, [input, init]).then(resolve).catch(reject);
        }, 30000);

        // Store the resolver for when we get the response
        proxyState.pendingFetches.set(proxyRequestId, {
          resolve: function (proxyResponse) {
            clearTimeout(timeoutId);
            proxyState.pendingFetches.delete(proxyRequestId);

            // Check for error in proxy response
            if (proxyResponse.error && !proxyResponse.data) {
              console.error("[Leonardo.Ai] Proxy error for:", operationName, proxyResponse.error);
              // On error, fall back to local execution
              originalFetch.apply(window, [input, init]).then(resolve).catch(reject);
              return;
            }

            // Store the proxied response
            lastResponses.set(operationName, {
              data: { data: proxyResponse.data },
              timestamp: Date.now(),
              duration: proxyResponse.duration,
              variables: variables,
              isProxied: true,
              request: requestInfo,
              response: {
                status: 200,
                statusText: "OK (Proxied)",
                headers: { "content-type": "application/json" },
              },
            });

            // Return a fake Response with the proxied data
            resolve(
              new Response(JSON.stringify({ data: proxyResponse.data }), {
                status: 200,
                statusText: "OK",
                headers: {
                  "Content-Type": "application/json",
                },
              })
            );
          },
          reject: reject,
          operationName: operationName,
        });

        // Send proxy request to content script
        postMessage("PROXY_FETCH_REQUEST", {
          requestId: proxyRequestId,
          operationName: operationName,
          query: queryString,
          variables: variables,
        });
      });
    }

    // Capture start time for duration calculation
    const startTime = Date.now();

    return originalFetch.apply(this, arguments).then(function (response) {
      // Calculate request duration
      const duration = Date.now() - startTime;

      // Clone the response so we can read the body
      const clonedResponse = response.clone();

      // Capture response info (headers, status)
      const responseHeaders = {};
      response.headers.forEach(function (value, key) {
        responseHeaders[key] = value;
      });
      const responseInfo = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };

      clonedResponse
        .json()
        .then(function (data) {
          if (operationName && data) {
            // Store the response for this operation
            lastResponses.set(operationName, {
              data: data,
              timestamp: Date.now(),
              duration: duration,
              variables: variables,
              request: requestInfo,
              response: responseInfo,
            });

            // Keep map size bounded
            if (lastResponses.size > 100) {
              const firstKey = lastResponses.keys().next().value;
              lastResponses.delete(firstKey);
            }

            // Special handling for GetUserDetails - relay to extension for popup
            if (operationName === "GetUserDetails" && data.data) {
              // Handle both users array and users_by_pk formats
              const userData = data.data.users_by_pk || (data.data.users && data.data.users[0]);
              if (userData) {
                postMessage("USER_DATA_UPDATE", {
                  user: userData,
                  timestamp: Date.now(),
                });
              }
            }
          }
        })
        .catch(function () {
          // Not JSON response, ignore
        });

      return response;
    });
  };
  } // End of fetch wrapper conditional

  // RPC request handlers
  const rpcHandlers = {
    getQueries: function () {
      return getQueries();
    },
    getMutations: function () {
      return getMutations();
    },
    getCache: function () {
      return getCache();
    },
    getClientInfo: function () {
      const client = getApolloClient();
      if (!client) return null;
      return {
        version: client.version || "unknown",
        queryCount: getQueries().length,
        mutationCount: getMutations().length,
      };
    },
    setMockData: function (params) {
      if (!params || !params.operationName) {
        return { success: false, error: "operationName is required" };
      }
      if (params.mockData) {
        mockOverrides.set(params.operationName, params.mockData);
      } else {
        mockOverrides.delete(params.operationName);
      }
      return {
        success: true,
        operationName: params.operationName,
        hasMock: mockOverrides.has(params.operationName),
      };
    },
    getMockData: function () {
      const mocks = {};
      mockOverrides.forEach(function (value, key) {
        mocks[key] = value;
      });
      return mocks;
    },
    clearAllMocks: function () {
      mockOverrides.clear();
      return { success: true };
    },
    // Enable/disable proxy mode globally
    setProxyEnabled: function (params) {
      proxyState.enabled = params && params.enabled === true;
      proxyState.enabledBy = INSTANCE_ID;
      // If disabling, also clear the operations set
      if (!proxyState.enabled) {
        proxyState.proxyOperations.clear();
      }
      return { success: true, proxyEnabled: proxyState.enabled, instanceId: INSTANCE_ID };
    },
    // Get current proxy state
    getProxyEnabled: function () {
      return { proxyEnabled: proxyState.enabled, proxyOperations: Array.from(proxyState.proxyOperations) };
    },
    // Add an operation to the proxy set
    addProxyOperation: function (params) {
      if (!params || !params.operationName) {
        return { success: false, error: "operationName is required" };
      }
      proxyState.proxyOperations.add(params.operationName);
      return { success: true, operationName: params.operationName, proxyOperations: Array.from(proxyState.proxyOperations) };
    },
    // Remove an operation from the proxy set
    removeProxyOperation: function (params) {
      if (!params || !params.operationName) {
        return { success: false, error: "operationName is required" };
      }
      proxyState.proxyOperations.delete(params.operationName);
      return { success: true, operationName: params.operationName, proxyOperations: Array.from(proxyState.proxyOperations) };
    },
    // Clear all proxy operations
    clearProxyOperations: function () {
      proxyState.proxyOperations.clear();
      return { success: true };
    },
  };

  // Execute a proxy request using Apollo Client directly
  // This ensures we use all the configured headers, auth, and link chain from Apollo
  function executeProxyRequest(payload) {
    return new Promise(function (resolve) {
      const client = getApolloClient();
      if (!client) {
        resolve({
          requestId: payload.requestId,
          error: "Apollo Client not found on this page",
        });
        return;
      }

      const startTime = Date.now();

      // Parse the query string into a GraphQL document
      // Apollo Client needs a parsed document, not a string
      //
      // Strategy: Look for an existing watched query with the same operation name
      // and reuse its document. This avoids needing a gql parser entirely.
      var document = null;

      // First, try to find an existing query with the same operation name
      // and extract its parsed document
      try {
        if (client.queryManager && client.queryManager.queries) {
          for (var queryInfo of client.queryManager.queries.values()) {
            if (queryInfo.document) {
              // Check if this document matches our operation name
              var docOpName = null;
              if (queryInfo.document.definitions) {
                for (var def of queryInfo.document.definitions) {
                  if (def.kind === "OperationDefinition" && def.name) {
                    docOpName = def.name.value;
                    break;
                  }
                }
              }
              if (docOpName === payload.operationName) {
                document = queryInfo.document;
                break;
              }
            }
          }
        }
      } catch (e) {
        // Silently ignore errors finding existing document
      }

      // If we didn't find an existing document, try to parse the query string
      if (!document) {
        // Try to find a gql/parse function from various sources
        var parse = null;

        // Check for graphql parse function (most reliable)
        if (window.graphql && typeof window.graphql.parse === "function") {
          parse = window.graphql.parse;
        }
        // Check for gql from graphql-tag
        else if (typeof window.gql === "function") {
          parse = window.gql;
        }
        // Check in Apollo DevTools hook
        else if (window.__APOLLO_DEVTOOLS_GLOBAL_HOOK__?.parse) {
          parse = window.__APOLLO_DEVTOOLS_GLOBAL_HOOK__.parse;
        }

        if (parse) {
          try {
            document = parse(payload.query);
          } catch (parseError) {
            resolve({
              requestId: payload.requestId,
              error: "Failed to parse query: " + parseError.message,
            });
            return;
          }
        } else {
          resolve({
            requestId: payload.requestId,
            error: "Could not find query document. The operation may not be active on the target page.",
          });
          return;
        }
      }

      // Execute the query using Apollo Client
      // This will use all configured links including auth headers
      client
        .query({
          query: document,
          variables: payload.variables || {},
          fetchPolicy: "network-only", // Always fetch fresh data for proxy requests
          errorPolicy: "all", // Return both data and errors
        })
        .then(function (result) {
          var duration = Date.now() - startTime;
          resolve({
            requestId: payload.requestId,
            data: result.data,
            error: result.errors
              ? result.errors
                  .map(function (e) {
                    return e.message;
                  })
                  .join(", ")
              : undefined,
            duration: duration,
          });
        })
        .catch(function (error) {
          var duration = Date.now() - startTime;
          resolve({
            requestId: payload.requestId,
            error: error.message || "Query execution failed",
            duration: duration,
          });
        });
    });
  }

  // Listen for RPC requests from content script
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "apollo-lite-devtools-content")
      return;

    const type = event.data.type;
    const requestId = event.data.requestId;

    // Handle RPC requests
    if (type === "RPC_REQUEST" && event.data.method) {
      const method = event.data.method;
      const handler = rpcHandlers[method];

      if (handler) {
        try {
          const result = handler(event.data.params);
          postMessage("RPC_RESPONSE", {
            requestId: requestId,
            result: result,
          });
        } catch (e) {
          postMessage("RPC_RESPONSE", {
            requestId: requestId,
            error: e.message,
          });
        }
      } else {
        postMessage("RPC_RESPONSE", {
          requestId: requestId,
          error: "Unknown method: " + method,
        });
      }
      return;
    }

    // Handle proxy requests - execute GraphQL using this page's Apollo Client
    if (type === "PROXY_REQUEST" && event.data.payload) {
      const payload = event.data.payload;
      executeProxyRequest(payload).then(function (response) {
        postMessage("PROXY_RESPONSE", response);
      });
      return;
    }

    // Handle proxy fetch responses - responses coming back from the target tab
    if (type === "PROXY_FETCH_RESPONSE" && event.data.payload) {
      const payload = event.data.payload;
      const pending = proxyState.pendingFetches.get(payload.requestId);
      if (pending) {
        pending.resolve(payload);
      }
      return;
    }

    // Legacy handlers for backwards compatibility
    if (type === "REQUEST_CACHE") {
      const cache = getCache();
      if (cache) {
        postMessage("CACHE_UPDATE", { data: cache, timestamp: Date.now() });
      }
    }

    if (type === "REQUEST_WATCHED_QUERIES") {
      const queries = getQueries();
      postMessage("WATCHED_QUERIES", {
        queries: queries,
        timestamp: Date.now(),
      });
    }
  });

  // Set up Apollo Client detection
  function checkForApolloClient() {
    const client = getApolloClient();
    if (client) {
      postMessage("APOLLO_CLIENT_DETECTED", {
        version: client.version || "unknown",
        hasCache: !!client.cache,
      });
      return true;
    }
    return false;
  }

  // Watch for __APOLLO_CLIENT__ being set
  let _apolloClient = window.__APOLLO_CLIENT__;

  try {
    Object.defineProperty(window, "__APOLLO_CLIENT__", {
      get: function () {
        return _apolloClient;
      },
      set: function (client) {
        _apolloClient = client;
        if (client) {
          postMessage("APOLLO_CLIENT_DETECTED", {
            version: client.version || "unknown",
            hasCache: !!client.cache,
          });
        }
      },
      configurable: true,
    });
  } catch (e) {
    // Property watcher not supported
  }

  // Check for Apollo Client on load and periodically
  if (!checkForApolloClient()) {
    let retries = 0;
    const maxRetries = 10;

    const interval = setInterval(function () {
      retries++;
      if (checkForApolloClient() || retries >= maxRetries) {
        clearInterval(interval);
        if (retries >= maxRetries && !getApolloClient()) {
          postMessage("APOLLO_CLIENT_NOT_FOUND", {});
        }
      }
    }, 1000);
  }
})();
