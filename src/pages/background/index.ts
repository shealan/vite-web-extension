// Background service worker - manages connections between content scripts and devtools
import type { ProxyInstance, ProxyRequest, ProxyResponse } from "@src/shared/types";

interface DevToolsConnection {
  port: chrome.runtime.Port;
  tabId: number;
  url?: string;
  title?: string;
}

const devtoolsConnections = new Map<number, DevToolsConnection>();
const tabData = new Map<
  number,
  { apolloDetected: boolean; cache: unknown }
>();

// Track proxy relationships: sourceTabId -> targetTabId
const proxyTargets = new Map<number, number>();
// Track pending proxy requests: requestId -> sourceTabId
const pendingProxyRequests = new Map<string, number>();

// Get list of available proxy instances (other connected panels)
function getProxyInstances(excludeTabId: number): ProxyInstance[] {
  const instances: ProxyInstance[] = [];
  for (const [tabId, conn] of devtoolsConnections) {
    if (tabId !== excludeTabId) {
      const data = tabData.get(tabId);
      instances.push({
        tabId,
        url: conn.url || "Unknown",
        title: conn.title,
        isConnected: data?.apolloDetected ?? false,
      });
    }
  }
  return instances;
}

// Broadcast proxy instances to all connected panels
function broadcastProxyInstances() {
  for (const [tabId, conn] of devtoolsConnections) {
    const instances = getProxyInstances(tabId);
    conn.port.postMessage({
      type: "PROXY_INSTANCES_UPDATE",
      payload: instances,
    });
  }
}

// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "apollo-lite-devtools") return;

  let tabId: number | null = null;

  port.onMessage.addListener((message) => {
    if (message.type === "INIT") {
      tabId = message.tabId as number;

      // Get tab info for proxy instance list
      chrome.tabs.get(tabId).then((tab) => {
        devtoolsConnections.set(tabId!, {
          port,
          tabId: tabId!,
          url: tab.url,
          title: tab.title,
        });

        // Broadcast updated instance list to all panels
        broadcastProxyInstances();
      }).catch(() => {
        devtoolsConnections.set(tabId!, { port, tabId: tabId! });

        // Still broadcast even if we couldn't get tab info
        broadcastProxyInstances();
      });

      // Send any cached data for this tab
      const data = tabData.get(tabId);
      if (data) {
        if (data.apolloDetected) {
          port.postMessage({ type: "APOLLO_CLIENT_DETECTED" });
        }
        if (data.cache) {
          port.postMessage({ type: "CACHE_UPDATE", payload: data.cache });
        }
      }
    }

    // Handle RPC requests from panel
    if (message.type === "RPC_REQUEST" && tabId !== null) {
      const requestId = message.requestId || Date.now().toString();

      // Forward RPC request to content script and wait for response
      chrome.tabs
        .sendMessage(tabId, {
          source: "apollo-lite-devtools-background",
          type: "RPC_REQUEST",
          method: message.method,
          params: message.params,
          requestId: requestId,
        })
        .then((response) => {
          // Send response back to panel
          port.postMessage({
            type: "RPC_RESPONSE",
            requestId: requestId,
            result: response?.result,
            error: response?.error,
          });
        })
        .catch((error) => {
          // Send error back to panel
          port.postMessage({
            type: "RPC_RESPONSE",
            requestId: requestId,
            error: error.message || "Failed to communicate with page",
          });
        });
    }

    // Legacy: Forward cache request to content script
    if (message.type === "REQUEST_CACHE" && tabId !== null) {
      chrome.tabs
        .sendMessage(tabId, {
          source: "apollo-lite-devtools-background",
          type: "REQUEST_CACHE",
        })
        .catch(() => {
          // Tab might not be ready
        });
    }

    // Handle proxy target registration from panel
    if (message.type === "PROXY_REGISTER" && tabId !== null) {
      const targetTabId = message.payload?.targetTabId as number | undefined;
      if (targetTabId && devtoolsConnections.has(targetTabId)) {
        proxyTargets.set(tabId, targetTabId);
        port.postMessage({
          type: "PROXY_REGISTER",
          payload: { success: true, targetTabId },
        });
      } else {
        port.postMessage({
          type: "PROXY_REGISTER",
          payload: { success: false, error: "Target tab not available" },
        });
      }
    }

    // Handle proxy unregistration
    if (message.type === "PROXY_UNREGISTER" && tabId !== null) {
      proxyTargets.delete(tabId);
    }

    // Handle proxy request - forward operation to target tab
    if (message.type === "PROXY_REQUEST" && tabId !== null) {
      const targetTabId = proxyTargets.get(tabId);
      const requestId = message.payload?.requestId as string;

      if (!targetTabId) {
        port.postMessage({
          type: "PROXY_RESPONSE",
          payload: { requestId, error: "No proxy target configured" } as ProxyResponse,
        });
        return;
      }

      const targetConnection = devtoolsConnections.get(targetTabId);
      if (!targetConnection) {
        // Target disconnected - clear proxy and notify
        proxyTargets.delete(tabId);
        port.postMessage({
          type: "PROXY_RESPONSE",
          payload: { requestId, error: "Proxy target disconnected" } as ProxyResponse,
        });
        broadcastProxyInstances();
        return;
      }

      // Store pending request
      pendingProxyRequests.set(requestId, tabId);

      // Forward the request to the target tab's content script to execute
      chrome.tabs
        .sendMessage(targetTabId, {
          source: "apollo-lite-devtools-background",
          type: "PROXY_REQUEST",
          payload: message.payload,
        })
        .then((response) => {
          // Send response back to source panel
          port.postMessage({
            type: "PROXY_RESPONSE",
            payload: response,
          });
          pendingProxyRequests.delete(requestId);
        })
        .catch((error) => {
          port.postMessage({
            type: "PROXY_RESPONSE",
            payload: { requestId, error: error.message || "Proxy request failed" } as ProxyResponse,
          });
          pendingProxyRequests.delete(requestId);
        });
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId !== null) {
      devtoolsConnections.delete(tabId);

      // Clean up any proxy relationships involving this tab
      proxyTargets.delete(tabId);
      // Also remove any proxies that were targeting this tab
      for (const [sourceId, targetId] of proxyTargets) {
        if (targetId === tabId) {
          proxyTargets.delete(sourceId);
          // Notify the source panel that proxy target is gone
          const sourceConn = devtoolsConnections.get(sourceId);
          if (sourceConn) {
            sourceConn.port.postMessage({
              type: "PROXY_UNREGISTER",
              payload: { reason: "Target disconnected" },
            });
          }
        }
      }

      // Broadcast updated instance list
      broadcastProxyInstances();
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "apollo-lite-devtools-content") return;

  const tabId = sender.tab?.id;
  if (!tabId) return;

  // Handle proxy fetch requests - these need to be forwarded to the target tab
  if (message.type === "PROXY_FETCH_REQUEST") {
    const targetTabId = proxyTargets.get(tabId);
    const payload = message.payload as ProxyRequest;

    if (!targetTabId) {
      sendResponse({
        requestId: payload?.requestId,
        error: "No proxy target configured. Please select a target tab in the Proxy Data panel.",
      });
      return true;
    }

    const targetConnection = devtoolsConnections.get(targetTabId);
    if (!targetConnection) {
      // Target disconnected - clear proxy
      proxyTargets.delete(tabId);
      sendResponse({
        requestId: payload?.requestId,
        error: "Proxy target disconnected",
      });
      broadcastProxyInstances();
      return true;
    }

    // Forward the request to the target tab's content script to execute
    chrome.tabs
      .sendMessage(targetTabId, {
        source: "apollo-lite-devtools-background",
        type: "PROXY_REQUEST",
        payload: {
          requestId: payload?.requestId,
          operationName: payload?.operationName,
          query: payload?.query,
          variables: payload?.variables,
        },
      })
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        sendResponse({
          requestId: payload?.requestId,
          error: error.message || "Proxy request failed",
        });
      });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Initialize tab data if needed
  if (!tabData.has(tabId)) {
    tabData.set(tabId, { apolloDetected: false, cache: null });
  }

  const data = tabData.get(tabId)!;

  // Store data
  if (message.type === "APOLLO_CLIENT_DETECTED") {
    data.apolloDetected = true;
  } else if (message.type === "CACHE_UPDATE") {
    data.cache = message.payload;
  }

  // Forward to DevTools if connected
  const connection = devtoolsConnections.get(tabId);
  if (connection) {
    connection.port.postMessage({
      type: message.type,
      payload: message.payload,
    });
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  devtoolsConnections.delete(tabId);
  tabData.delete(tabId);
});

// Track tab URLs for navigation detection
const tabUrls = new Map<number, string>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Detect page refresh/navigation when status changes to "loading"
  // This catches both same-origin refreshes and cross-origin navigations
  if (changeInfo.status === "loading") {
    const newUrl = changeInfo.url || tab.url;

    if (newUrl) {
      tabUrls.set(tabId, newUrl);
    }

    // Only process if we have a DevTools connection for this tab
    const connection = devtoolsConnections.get(tabId);
    if (connection) {
      // Reset Apollo detection state - the page is reloading
      tabData.set(tabId, {
        apolloDetected: false,
        cache: null,
      });

      // If this tab is a PROXY TARGET, notify source tabs that the target refreshed
      for (const [sourceId, targetId] of proxyTargets) {
        if (targetId === tabId) {
          const sourceConn = devtoolsConnections.get(sourceId);
          if (sourceConn) {
            sourceConn.port.postMessage({
              type: "PROXY_TARGET_REFRESHED",
              payload: { targetTabId: tabId },
            });
          }
        }
      }

      // Update URL in connection info
      if (newUrl) {
        connection.url = newUrl;
      }

      // Always notify panel that the tab navigated/refreshed
      // This allows the panel to reset proxyEnabledSentRef and re-enable proxy mode
      connection.port.postMessage({ type: "TAB_NAVIGATED" });

      // Broadcast updated instances (URL may have changed)
      broadcastProxyInstances();
    }
  }

  // Track initial URL
  if (tab.url && !tabUrls.has(tabId)) {
    tabUrls.set(tabId, tab.url);
  }
});

// Clean up URL tracking when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});
