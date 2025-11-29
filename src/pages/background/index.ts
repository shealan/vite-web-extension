// Background service worker - manages connections between content scripts and devtools

interface DevToolsConnection {
  port: chrome.runtime.Port;
  tabId: number;
}

const devtoolsConnections = new Map<number, DevToolsConnection>();
const tabData = new Map<
  number,
  { apolloDetected: boolean; cache: unknown }
>();

// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "apollo-lite-devtools") return;

  let tabId: number | null = null;

  port.onMessage.addListener((message) => {
    if (message.type === "INIT") {
      tabId = message.tabId as number;
      devtoolsConnections.set(tabId, { port, tabId });

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

      console.log(`[Leonardo.Ai] DevTools connected for tab ${tabId}`);
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
  });

  port.onDisconnect.addListener(() => {
    if (tabId !== null) {
      devtoolsConnections.delete(tabId);
      console.log(`[Leonardo.Ai] DevTools disconnected for tab ${tabId}`);
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.source !== "apollo-lite-devtools-content") return;

  const tabId = sender.tab?.id;
  if (!tabId) return;

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

// Only reset on full page navigation (not SPA navigation)
// We detect this by checking if the URL origin changes
const tabUrls = new Map<number, string>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    const previousUrl = tabUrls.get(tabId);
    const newUrl = changeInfo.url;

    // Check if this is a full navigation (different origin) vs SPA navigation (same origin)
    let isFullNavigation = true;
    try {
      if (previousUrl) {
        const prevOrigin = new URL(previousUrl).origin;
        const newOrigin = new URL(newUrl).origin;
        isFullNavigation = prevOrigin !== newOrigin;
      }
    } catch {
      // Invalid URL, treat as full navigation
    }

    tabUrls.set(tabId, newUrl);

    if (isFullNavigation) {
      // Reset data for this tab on full navigation
      tabData.set(tabId, {
        apolloDetected: false,
        cache: null,
      });

      // Notify DevTools
      const connection = devtoolsConnections.get(tabId);
      if (connection) {
        connection.port.postMessage({ type: "TAB_NAVIGATED" });
      }
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

console.log("[Leonardo.Ai] Background service worker loaded");
