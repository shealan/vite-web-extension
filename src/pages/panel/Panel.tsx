import React, { useState, useEffect, useCallback, useRef } from "react";
import "@pages/panel/Panel.css";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import {
  GraphQLOperation,
  RpcMethod,
  RawWatchedQuery,
  RawMutation,
  ProxyInstance,
} from "@src/shared/types";
import { cn } from "@src/shared/cn";
import { OperationList } from "./components/OperationList";
import { CacheViewer } from "./components/CacheViewer";
import { OperationDetail } from "./components/OperationDetail";
import Logo from "./components/Logo";

type TabType = "queries" | "mutations" | "cache";

// Storage key for persisted state
const STORAGE_KEY = "leonardo-devtools-state";

interface MockFileInfo {
  fileName: string;
  fileSize: number;
}

interface Settings {
  autoExpandJson: boolean;
  highlightChakra: boolean;
}

interface PersistedState {
  mockDataMap: Record<string, string>;
  mockFileInfoMap: Record<string, MockFileInfo>;
  mockEnabledMap: Record<string, boolean>;
  proxyOperations?: string[]; // List of operation names to proxy
  activeTab: TabType;
  settings?: Settings;
}

const defaultSettings: Settings = {
  autoExpandJson: false,
  highlightChakra: false,
};

interface ApolloState {
  isConnected: boolean;
  operations: GraphQLOperation[];
  cache: Record<string, unknown> | null;
}

// RPC client for communicating with injected script
function createRpcClient(port: chrome.runtime.Port) {
  const pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  // Listen for RPC responses
  const handleMessage = (message: {
    type: string;
    requestId?: string;
    result?: unknown;
    error?: string;
  }) => {
    if (message.type === "RPC_RESPONSE" && message.requestId) {
      const pending = pendingRequests.get(message.requestId);
      if (pending) {
        pendingRequests.delete(message.requestId);
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  };

  port.onMessage.addListener(handleMessage);

  return {
    request: <T,>(method: RpcMethod, params?: unknown): Promise<T> => {
      return new Promise((resolve, reject) => {
        const requestId = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;

        // Set timeout for request
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error("RPC request timeout"));
        }, 5000);

        pendingRequests.set(requestId, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value as T);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });

        port.postMessage({
          type: "RPC_REQUEST",
          method,
          params,
          requestId,
        });
      });
    },
    cleanup: () => {
      port.onMessage.removeListener(handleMessage);
    },
  };
}

// Convert raw Apollo data to GraphQLOperation format
function convertToOperations(
  queries: RawWatchedQuery[],
  mutations: RawMutation[]
): GraphQLOperation[] {
  const operations: GraphQLOperation[] = [];

  // Convert queries
  for (const q of queries) {
    operations.push({
      id: `query-${q.id}`,
      type: "query",
      operationName: q.operationName || "Unknown",
      query: q.queryString || "",
      variables: q.variables,
      // Use lastResponse (actual network response) if available, otherwise fall back to cachedData
      result: q.lastResponse ?? q.cachedData,
      cachedData: q.cachedData,
      request: q.lastRequest,
      response: q.lastResponseInfo,
      options: q.options,
      pollInterval: q.pollInterval,
      timestamp: q.lastResponseTimestamp ?? Date.now(),
      duration: q.lastResponseDuration,
      status: q.networkStatus === 1 ? "loading" : "success",
    });
  }

  // Convert mutations
  for (const m of mutations) {
    operations.push({
      id: `mutation-${m.id}`,
      type: "mutation",
      operationName: m.operationName || "Unknown",
      query: m.mutationString || "",
      variables: m.variables,
      // Use lastResponse (actual network response) if available
      result: m.lastResponse,
      request: m.lastRequest,
      response: m.lastResponseInfo,
      error: m.error
        ? String((m.error as { message?: string })?.message || m.error)
        : undefined,
      timestamp: m.lastResponseTimestamp ?? Date.now(),
      duration: m.lastResponseDuration,
      status: m.loading ? "loading" : m.error ? "error" : "success",
    });
  }

  return operations;
}

// Helper to load persisted state from chrome.storage.local
async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    if (!chrome?.storage?.local) {
      console.warn("[Leonardo.Ai] chrome.storage.local not available");
      return null;
    }
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch (e) {
    console.error("[Leonardo.Ai] Failed to load persisted state:", e);
    return null;
  }
}

// Helper to save state to chrome.storage.local
function savePersistedState(state: PersistedState): void {
  if (!chrome?.storage?.local) {
    console.warn("[Leonardo.Ai] chrome.storage.local not available");
    return;
  }
  chrome.storage.local.set({ [STORAGE_KEY]: state }).catch((e) => {
    console.error("[Leonardo.Ai] Failed to save persisted state:", e);
  });
}

// Helper to clear proxy operations from persisted state (used on panel close)
async function clearPersistedProxyOperations(): Promise<void> {
  try {
    if (!chrome?.storage?.local) return;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const persisted = result[STORAGE_KEY] as PersistedState | undefined;
    if (persisted) {
      persisted.proxyOperations = [];
      await chrome.storage.local.set({ [STORAGE_KEY]: persisted });
    }
  } catch (e) {
    console.error("[Leonardo.Ai] Failed to clear persisted proxy operations:", e);
  }
}

export default function Panel() {
  const [activeTab, setActiveTab] = useState<TabType>("queries");
  const [state, setState] = useState<ApolloState>({
    isConnected: false,
    operations: [],
    cache: null,
  });
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    null
  );
  // Mock data storage keyed by operation name
  const [mockDataMap, setMockDataMap] = useState<Record<string, string>>({});
  const [mockFileInfoMap, setMockFileInfoMap] = useState<
    Record<string, MockFileInfo>
  >({});
  const [mockEnabledMap, setMockEnabledMap] = useState<Record<string, boolean>>(
    {}
  );
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Proxy state
  const [proxyInstances, setProxyInstances] = useState<ProxyInstance[]>([]);
  const [proxyTargetTabId, setProxyTargetTabId] = useState<number | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  // Track which operations have proxied data: operationName -> proxied result
  const [proxiedDataMap, setProxiedDataMap] = useState<Record<string, unknown>>({});
  // Track which operations should be proxied (persisted like mocks)
  const [proxyOperations, setProxyOperations] = useState<Set<string>>(new Set());

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const rpcClientRef = useRef<ReturnType<typeof createRpcClient> | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  // Track which operations have been seen since last clear
  const seenOperationsRef = useRef<Set<string> | null>(null);
  // Track proxy target for reconnection (refs persist across effect re-runs)
  const proxyTargetTabIdRef = useRef<number | null>(null);
  // Track if proxy mode has been enabled (to avoid redundant RPC calls)
  const proxyEnabledSentRef = useRef<boolean>(false);

  // Derive selected operation from current operations list to stay reactive
  const selectedOperation = selectedOperationId
    ? state.operations.find((op) => op.id === selectedOperationId) || null
    : null;

  // Re-apply all mocks to the injected script (used after page refresh)
  const reapplyMocks = useCallback(
    async (
      mocks: Record<string, string>,
      enabledMap: Record<string, boolean>
    ) => {
      if (!rpcClientRef.current) return;

      for (const [operationName, mockDataStr] of Object.entries(mocks)) {
        if (!mockDataStr.trim()) continue;
        // Check if mock is enabled (default to true if not specified)
        const isEnabled = enabledMap[operationName] !== false;
        try {
          const parsedMockData = JSON.parse(mockDataStr);
          await rpcClientRef.current.request("setMockData", {
            operationName,
            mockData: isEnabled ? parsedMockData : null,
          });
          console.log(
            `[Leonardo.Ai] Re-applied mock for: ${operationName} (${
              isEnabled ? "enabled" : "disabled"
            })`
          );
        } catch {
          // Invalid JSON, skip
        }
      }
    },
    []
  );

  // Re-apply proxy operations to the injected script (used after page refresh)
  const reapplyProxyOperations = useCallback(
    async (operations: string[]) => {
      if (!rpcClientRef.current || operations.length === 0) return;

      for (const operationName of operations) {
        try {
          await rpcClientRef.current.request("addProxyOperation", { operationName });
          console.log(`[Leonardo.Ai] Re-applied proxy operation: ${operationName}`);
        } catch (err) {
          console.error(`[Leonardo.Ai] Failed to re-apply proxy operation ${operationName}:`, err);
        }
      }
    },
    []
  );

  // Load persisted state on mount
  useEffect(() => {
    loadPersistedState().then((persisted) => {
      if (persisted) {
        setActiveTab(persisted.activeTab);
        setMockDataMap(persisted.mockDataMap);
        setMockFileInfoMap(persisted.mockFileInfoMap || {});
        setMockEnabledMap(persisted.mockEnabledMap || {});
        setProxyOperations(new Set(persisted.proxyOperations || []));
        setSettings(persisted.settings || defaultSettings);
      }
      setIsInitialized(true);
    });
  }, []);

  // Save state when it changes (after initialization)
  useEffect(() => {
    if (!isInitialized) return;

    savePersistedState({
      mockDataMap,
      mockFileInfoMap,
      mockEnabledMap,
      proxyOperations: Array.from(proxyOperations),
      activeTab,
      settings,
    });
  }, [
    mockDataMap,
    mockFileInfoMap,
    mockEnabledMap,
    proxyOperations,
    activeTab,
    settings,
    isInitialized,
  ]);

  // Chakra highlighter script - defined outside useEffect so it can be reused
  const injectChakraHighlighter = useCallback((enabled: boolean) => {
    // Leonardo-branded color palette for Chakra component highlighting
    // Uses purples, teals, and complementary colors that stand out from the UI
    const chakraHighlighterScript = `
      (function() {
        const HIGHLIGHTER_ATTR = 'data-leo-chakra-highlight';
        const TOOLTIP_ID = 'leo-chakra-tooltip';

        // Check if already applied
        if (document.body.getAttribute(HIGHLIGHTER_ATTR) === 'true') {
          return;
        }

        // Leonardo-branded colors - distinct but harmonious with the brand
        const colorMap = {
          button: '#a855f7',      // Purple 500
          input: '#6366f1',       // Indigo 500
          stack: '#14b8a6',       // Teal 500
          box: '#f97316',         // Orange 500
          text: '#c084fc',        // Purple 400
          heading: '#22d3ee',     // Cyan 400
          flex: '#ec4899',        // Pink 500
          grid: '#eab308',        // Yellow 500
          container: '#84cc16',   // Lime 500
          card: '#f472b6',        // Pink 400
          modal: '#2dd4bf',       // Teal 400
          menu: '#fb923c',        // Orange 400
          select: '#818cf8',      // Indigo 400
          checkbox: '#e879f9',    // Fuchsia 400
          radio: '#fbbf24',       // Amber 400
          switch: '#8b5cf6',      // Violet 500
          textarea: '#a78bfa',    // Violet 400
          form: '#4ade80',        // Green 400
          link: '#f87171',        // Red 400
          icon: '#d946ef',        // Fuchsia 500
        };

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.id = TOOLTIP_ID;
        tooltip.style.cssText = 'position: fixed; pointer-events: none; z-index: 999999; padding: 6px 10px; background: rgba(12, 12, 18, 0.95); border: 1px solid #28283a; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #e5e7eb; display: none; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);';
        document.body.appendChild(tooltip);

        // Create dot element
        const dot = document.createElement('span');
        dot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;';
        tooltip.appendChild(dot);

        // Create text element
        const text = document.createElement('span');
        tooltip.appendChild(text);

        // Track current hovered element
        let currentEl = null;

        // Mouse move handler to position tooltip
        function handleMouseMove(e) {
          if (tooltip.style.display === 'flex') {
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY + 12) + 'px';
          }
        }

        // Known Chakra component types (used to filter out hash-based class names)
        const knownTypes = Object.keys(colorMap);

        // Extract valid Chakra type from element
        function getChakraType(el) {
          const classes = [...el.classList];
          for (const cls of classes) {
            if (!cls.startsWith('chakra-')) continue;
            const type = cls.replace('chakra-', '').split('__')[0];
            // Only return if it's a known type (not a hash like "1q6grw9")
            if (knownTypes.includes(type)) {
              return type;
            }
          }
          return null;
        }

        // Mouse over handler
        function handleMouseOver(e) {
          const el = e.target.closest('[class*="chakra-"]');
          if (!el || el === currentEl) return;

          currentEl = el;
          const type = getChakraType(el);
          const color = type ? colorMap[type] : '#9ca3af';
          const displayName = type ? 'Chakra ' + type.charAt(0).toUpperCase() + type.slice(1) : 'Chakra';

          dot.style.backgroundColor = color;
          text.textContent = displayName;
          tooltip.style.display = 'flex';
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY + 12) + 'px';
        }

        // Mouse out handler
        function handleMouseOut(e) {
          const el = e.target.closest('[class*="chakra-"]');
          if (!el) return;

          // Check if we're moving to another chakra element
          const relatedTarget = e.relatedTarget;
          if (relatedTarget && relatedTarget.closest && relatedTarget.closest('[class*="chakra-"]')) {
            return;
          }

          currentEl = null;
          tooltip.style.display = 'none';
        }

        // Store handlers on window for cleanup
        window.__leoChakraHandlers = { handleMouseMove, handleMouseOver, handleMouseOut };

        // Add event listeners
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseover', handleMouseOver);
        document.addEventListener('mouseout', handleMouseOut);

        // Apply outlines to all chakra elements
        document.querySelectorAll('[class*="chakra-"]').forEach(el => {
          const type = getChakraType(el);
          const color = type ? colorMap[type] : '#9ca3af';
          el.style.outline = '2px solid ' + color;
          el.style.outlineOffset = '1px';
        });

        document.body.setAttribute(HIGHLIGHTER_ATTR, 'true');
      })();
    `;

    const removeHighlighterScript = `
      (function() {
        const HIGHLIGHTER_ATTR = 'data-leo-chakra-highlight';
        const TOOLTIP_ID = 'leo-chakra-tooltip';

        if (document.body.getAttribute(HIGHLIGHTER_ATTR) !== 'true') {
          return;
        }

        // Remove tooltip
        const tooltip = document.getElementById(TOOLTIP_ID);
        if (tooltip) {
          tooltip.remove();
        }

        // Remove event listeners
        if (window.__leoChakraHandlers) {
          document.removeEventListener('mousemove', window.__leoChakraHandlers.handleMouseMove);
          document.removeEventListener('mouseover', window.__leoChakraHandlers.handleMouseOver);
          document.removeEventListener('mouseout', window.__leoChakraHandlers.handleMouseOut);
          delete window.__leoChakraHandlers;
        }

        // Remove outlines
        document.querySelectorAll('[class*="chakra-"]').forEach(el => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        });

        document.body.removeAttribute(HIGHLIGHTER_ATTR);
      })();
    `;

    if (enabled) {
      chrome.devtools.inspectedWindow.eval(chakraHighlighterScript);
    } else {
      chrome.devtools.inspectedWindow.eval(removeHighlighterScript);
    }
  }, []);

  // Apply Chakra highlighter when setting changes
  useEffect(() => {
    if (!isInitialized) return;
    injectChakraHighlighter(settings.highlightChakra);
  }, [settings.highlightChakra, isInitialized, injectChakraHighlighter]);

  // Enable/disable proxy mode when proxy target and connection state changes
  // This ensures we only send setProxyEnabled RPC when content script is ready
  // Uses a ref to track if we've already sent the enable command to avoid redundant calls
  useEffect(() => {
    if (!rpcClientRef.current) return;

    const shouldBeEnabled = !!(proxyTargetTabId && state.isConnected);
    const currentlySent = proxyEnabledSentRef.current;

    // Only send RPC if state actually changed
    if (shouldBeEnabled && !currentlySent) {
      proxyEnabledSentRef.current = true;

      // Retry logic: if the RPC fails, retry a few times with delays
      // This handles race conditions when the content script isn't fully ready
      const enableWithRetry = (attempt: number) => {
        if (!rpcClientRef.current) return;

        rpcClientRef.current.request("setProxyEnabled", { enabled: true })
          .catch(() => {
            if (attempt < 3) {
              // Retry after a short delay
              setTimeout(() => enableWithRetry(attempt + 1), 500);
            } else {
              proxyEnabledSentRef.current = false; // Reset so we can retry on next state change
            }
          });
      };

      enableWithRetry(1);
    } else if (!shouldBeEnabled && currentlySent) {
      // Only send disable if we previously sent enable
      proxyEnabledSentRef.current = false;
      rpcClientRef.current.request("setProxyEnabled", { enabled: false })
        .catch(() => {
          // Ignore errors when disabling - content script might not be ready
        });
    }
  }, [proxyTargetTabId, state.isConnected]);

  // Fetch data via RPC and convert to operations
  const fetchData = useCallback(async () => {
    if (!rpcClientRef.current) return;

    try {
      const [queries, mutations, cache] = await Promise.all([
        rpcClientRef.current.request<RawWatchedQuery[]>("getQueries"),
        rpcClientRef.current.request<RawMutation[]>("getMutations"),
        rpcClientRef.current.request<Record<string, unknown>>("getCache"),
      ]);

      let newOperations = convertToOperations(queries || [], mutations || []);

      // If we have a filter set (after clear), only show operations with new responses
      if (seenOperationsRef.current !== null) {
        const seenOps = seenOperationsRef.current;
        const clearedAt = (seenOps as Set<string> & { clearedAt: number }).clearedAt;

        // Filter to only operations that have a new response timestamp
        newOperations = newOperations.filter((op) => {
          // If we've already seen this operation since clear, keep it
          if (seenOps.has(op.operationName)) {
            return true;
          }

          // Find the original raw data to check if it has a real response timestamp
          const rawQuery = (queries || []).find(q => q.operationName === op.operationName);
          const rawMutation = (mutations || []).find(m => m.operationName === op.operationName);
          const hasRealTimestamp = rawQuery?.lastResponseTimestamp || rawMutation?.lastResponseTimestamp;

          // Only show if it has an actual network response timestamp that's newer than clear time
          if (hasRealTimestamp && hasRealTimestamp > clearedAt) {
            seenOps.add(op.operationName);
            return true;
          }

          return false;
        });
      }

      // Update proxiedDataMap based on isProxied flag from raw queries
      // This ensures the orange "P" badge shows for automatically proxied operations
      const newProxiedData: Record<string, unknown> = {};
      for (const q of queries || []) {
        if (q.isProxied && q.lastResponse) {
          newProxiedData[q.operationName] = q.lastResponse;
        }
      }
      if (Object.keys(newProxiedData).length > 0) {
        setProxiedDataMap((prev) => ({ ...prev, ...newProxiedData }));
      }

      setState((prev) => {
        // Merge new operations with existing ones
        // Update existing operations by operationName, add new ones
        const operationsByName = new Map<string, GraphQLOperation>();

        // First, add all existing operations
        for (const op of prev.operations) {
          operationsByName.set(op.operationName, op);
        }

        // Then update/add new operations (new data takes precedence)
        for (const op of newOperations) {
          const existing = operationsByName.get(op.operationName);
          if (existing) {
            // Find raw data to check if there's a real timestamp
            const rawQuery = (queries || []).find(q => q.operationName === op.operationName);
            const rawMutation = (mutations || []).find(m => m.operationName === op.operationName);
            const hasRealTimestamp = rawQuery?.lastResponseTimestamp || rawMutation?.lastResponseTimestamp;

            // Update existing operation with new data but preserve id
            // Also preserve existing timestamp if no real timestamp exists
            operationsByName.set(op.operationName, {
              ...op,
              id: existing.id, // Keep stable id for selection
              timestamp: hasRealTimestamp ? op.timestamp : existing.timestamp,
            });
          } else {
            operationsByName.set(op.operationName, op);
          }
        }

        return {
          ...prev,
          isConnected: true,
          operations: Array.from(operationsByName.values()),
          cache: cache || null,
        };
      });
    } catch (error) {
      console.error("[Leonardo.Ai] Failed to fetch data:", error);
      // Don't set isConnected to false on fetch error - might just be timing
    }
  }, []);

  // Start/stop polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    // Fetch immediately
    fetchData();

    // Then poll every 500ms
    pollingIntervalRef.current = window.setInterval(() => {
      fetchData();
    }, 500);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Connect to background script
    const port = chrome.runtime.connect({ name: "apollo-lite-devtools" });
    portRef.current = port;

    // Create RPC client
    const rpcClient = createRpcClient(port);
    rpcClientRef.current = rpcClient;

    // Initialize with current tab ID
    port.postMessage({
      type: "INIT",
      tabId: chrome.devtools.inspectedWindow.tabId,
    });

    // Handle panel close/refresh - clean up proxy connection
    const handleBeforeUnload = () => {
      if (proxyTargetTabIdRef.current) {
        port.postMessage({ type: "PROXY_UNREGISTER" });
      }
      rpcClient.request("setProxyEnabled", { enabled: false }).catch(() => {
        // Ignore errors
      });
      // Clear persisted proxy operations so P badges don't show on reload
      clearPersistedProxyOperations();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Listen for non-RPC messages
    port.onMessage.addListener((message) => {
      switch (message.type) {
        case "APOLLO_CLIENT_DETECTED":
          setState((prev) => ({ ...prev, isConnected: true }));
          // Re-apply mocks, proxy operations, and Chakra highlighter when Apollo Client is detected (after page load/refresh)
          loadPersistedState().then((persisted) => {
            if (persisted?.mockDataMap) {
              reapplyMocks(
                persisted.mockDataMap,
                persisted.mockEnabledMap || {}
              );
            }
            // Re-apply proxy operations if we have an active proxy target
            if (persisted?.proxyOperations && persisted.proxyOperations.length > 0 && proxyTargetTabIdRef.current) {
              reapplyProxyOperations(persisted.proxyOperations);
            }
            // Re-inject Chakra highlighter if it was enabled
            if (persisted?.settings?.highlightChakra) {
              injectChakraHighlighter(true);
            }
          });
          break;

        case "APOLLO_CLIENT_NOT_FOUND":
          setState((prev) => ({ ...prev, isConnected: false }));
          break;

        case "TAB_NAVIGATED":
          // Keep operations but mark as potentially stale, reset connection
          setState((prev) => ({
            ...prev,
            isConnected: false,
            cache: null,
          }));
          // Reset the filter so new queries after navigation are shown
          seenOperationsRef.current = null;
          // Reset proxy enabled tracking - the injected script was reloaded and lost its state
          // This allows the useEffect to re-send setProxyEnabled when Apollo is detected again
          proxyEnabledSentRef.current = false;
          break;

        case "PROXY_INSTANCES_UPDATE":
          // Update the list of available proxy targets
          setProxyInstances(message.payload as ProxyInstance[]);
          break;

        case "PROXY_REGISTER":
          // Handle proxy registration response
          if (message.payload?.success) {
            const targetTabId = message.payload.targetTabId;
            setProxyTargetTabId(targetTabId);
            proxyTargetTabIdRef.current = targetTabId; // Keep ref in sync for reconnection
            setProxyError(null);
            const currentTabId = chrome.devtools.inspectedWindow.tabId;
            console.log(`[Leonardo.Ai] Proxy registered: source tab ${currentTabId} -> target tab ${targetTabId}`);
            // Note: setProxyEnabled will be called by the useEffect that watches for
            // proxyTargetTabId + state.isConnected changes. This ensures we only send
            // the RPC when the content script is ready (Apollo detected).
          } else {
            setProxyError(message.payload?.error || "Failed to register proxy");
            setProxyTargetTabId(null);
            proxyTargetTabIdRef.current = null;
          }
          break;

        case "PROXY_UNREGISTER":
          // Proxy was disconnected (target tab closed/refreshed)
          setProxyTargetTabId(null);
          proxyTargetTabIdRef.current = null; // Clear ref
          setProxiedDataMap({});
          console.log(`[Leonardo.Ai] Proxy unregistered: ${message.payload?.reason || "unknown"}`);
          // Note: setProxyEnabled(false) is handled by the useEffect watching proxyTargetTabId
          break;

        case "PROXY_RESPONSE":
          // Handle proxy response for an operation
          if (message.payload?.requestId && message.payload?.data) {
            const operationName = message.payload.requestId.split("-")[0];
            setProxiedDataMap((prev) => ({
              ...prev,
              [operationName]: message.payload.data,
            }));
          }
          break;

        case "PROXY_TARGET_REFRESHED":
          // Target tab was refreshed - just log, keep the proxy connection
          // The proxy will continue working once target's Apollo Client is ready again
          console.log(`[Leonardo.Ai] Proxy target tab ${message.payload?.targetTabId} was refreshed`);
          break;
      }
    });

    // Start polling immediately
    startPolling();

    // Re-register proxy if we had one configured (handles reconnection after port disconnect)
    // We use a small delay to ensure the connection is fully established
    const savedProxyTarget = proxyTargetTabIdRef.current;
    if (savedProxyTarget) {
      console.log(`[Leonardo.Ai] Re-registering proxy to target ${savedProxyTarget} after reconnection`);
      setTimeout(() => {
        port.postMessage({
          type: "PROXY_REGISTER",
          payload: { targetTabId: savedProxyTarget },
        });
      }, 100);
    }

    // Handle port disconnect
    port.onDisconnect.addListener(() => {
      console.log(
        "[Leonardo.Ai] Port disconnected, will reconnect on next render"
      );
      stopPolling();
    });

    return () => {
      stopPolling();
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Clean up proxy connection before disconnecting
      if (proxyTargetTabIdRef.current) {
        port.postMessage({ type: "PROXY_UNREGISTER" });
      }

      // Disable proxy mode in injected script
      rpcClient.request("setProxyEnabled", { enabled: false }).catch(() => {
        // Ignore errors - page might already be gone
      });

      // Clear persisted proxy operations so P badges don't show on reload
      clearPersistedProxyOperations();

      rpcClient.cleanup();
      port.disconnect();
    };
  }, [startPolling, stopPolling, reapplyMocks, reapplyProxyOperations, injectChakraHighlighter]);

  const queries = state.operations.filter((op) => op.type === "query");
  const mutations = state.operations.filter((op) => op.type === "mutation");

  const clearOperations = useCallback(() => {
    setState((prev) => ({ ...prev, operations: [] }));
    setSelectedOperationId(null);
    // Set up filter to only show operations with new responses after this point
    const seenOps = new Set<string>() as Set<string> & { clearedAt: number };
    seenOps.clearedAt = Date.now();
    seenOperationsRef.current = seenOps;
  }, []);

  const handleMockDataChange = useCallback(
    (
      operationName: string,
      mockData: string,
      fileInfo?: { fileName: string; fileSize: number }
    ) => {
      setMockDataMap((prev) => ({
        ...prev,
        [operationName]: mockData,
      }));

      // Update file info map
      if (fileInfo) {
        setMockFileInfoMap((prev) => ({
          ...prev,
          [operationName]: fileInfo,
        }));
      } else if (!mockData.trim()) {
        // Clear file info when mock is cleared
        setMockFileInfoMap((prev) => {
          const newMap = { ...prev };
          delete newMap[operationName];
          return newMap;
        });
      }

      // Send mock data to injected script to intercept future requests
      let parsedMockData = null;
      if (mockData.trim()) {
        try {
          parsedMockData = JSON.parse(mockData);
        } catch (e) {
          console.error("[Leonardo.Ai] Failed to parse mock data:", e);
          return;
        }
      }

      if (rpcClientRef.current) {
        rpcClientRef.current
          .request("setMockData", {
            operationName,
            mockData: parsedMockData,
          })
          .then(() => {
            console.log(
              `[Leonardo.Ai] Mock ${
                parsedMockData ? "updated" : "cleared"
              } for:`,
              operationName
            );
          })
          .catch((error) => {
            console.error("[Leonardo.Ai] Failed to set mock data:", error);
          });
      } else {
        console.warn(
          "[Leonardo.Ai] RPC client not ready, mock will be applied on next connection"
        );
      }
    },
    []
  );

  const handleMockEnabledChange = useCallback(
    (operationName: string, enabled: boolean) => {
      setMockEnabledMap((prev) => ({
        ...prev,
        [operationName]: enabled,
      }));

      // Get current mock data for this operation
      const mockDataStr = mockDataMap[operationName];
      if (!mockDataStr?.trim()) return;

      let parsedMockData = null;
      if (enabled) {
        try {
          parsedMockData = JSON.parse(mockDataStr);
        } catch {
          return;
        }
      }

      // Send to injected script - null to disable, data to enable
      if (rpcClientRef.current) {
        rpcClientRef.current
          .request("setMockData", {
            operationName,
            mockData: parsedMockData,
          })
          .then(() => {
            console.log(
              `[Leonardo.Ai] Mock ${enabled ? "enabled" : "disabled"} for:`,
              operationName
            );
          })
          .catch((error) => {
            console.error("[Leonardo.Ai] Failed to toggle mock:", error);
          });
      }
    },
    [mockDataMap]
  );

  // Proxy handlers
  const handleProxyRegister = useCallback((targetTabId: number) => {
    if (!portRef.current) return;

    portRef.current.postMessage({
      type: "PROXY_REGISTER",
      payload: { targetTabId },
    });
  }, []);

  const handleProxyUnregister = useCallback(() => {
    if (!portRef.current) return;

    portRef.current.postMessage({
      type: "PROXY_UNREGISTER",
    });
    setProxyTargetTabId(null);
    proxyTargetTabIdRef.current = null; // Clear ref
    setProxiedDataMap({});
    setProxyError(null);
    // Clear proxy operations so P badges disappear
    setProxyOperations(new Set());
    // Note: setProxyEnabled(false) is handled by the useEffect watching proxyTargetTabId
  }, []);

  // Execute a proxy request for an operation
  const handleProxyRequest = useCallback((operation: GraphQLOperation) => {
    if (!portRef.current || !proxyTargetTabId) return;

    const requestId = `${operation.operationName}-${Date.now()}`;

    portRef.current.postMessage({
      type: "PROXY_REQUEST",
      payload: {
        requestId,
        operationName: operation.operationName,
        query: operation.query,
        variables: operation.variables,
        sourceTabId: chrome.devtools.inspectedWindow.tabId,
      },
    });
  }, [proxyTargetTabId]);

  // Toggle proxy for a specific operation (add/remove from proxy set)
  const handleProxyOperationToggle = useCallback((operationName: string, enabled: boolean) => {
    if (!rpcClientRef.current) return;

    if (enabled) {
      // Add to proxy set
      rpcClientRef.current.request("addProxyOperation", { operationName })
        .then(() => {
          console.log(`[Leonardo.Ai] Added proxy operation: ${operationName}`);
          setProxyOperations((prev) => new Set([...prev, operationName]));
        })
        .catch((err) => console.error(`[Leonardo.Ai] Failed to add proxy operation:`, err));
    } else {
      // Remove from proxy set
      rpcClientRef.current.request("removeProxyOperation", { operationName })
        .then(() => {
          console.log(`[Leonardo.Ai] Removed proxy operation: ${operationName}`);
          setProxyOperations((prev) => {
            const next = new Set(prev);
            next.delete(operationName);
            return next;
          });
          // Keep proxied data - it will be cleared on next request or when proxy is disconnected
        })
        .catch((err) => console.error(`[Leonardo.Ai] Failed to remove proxy operation:`, err));
    }
  }, []);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "queries", label: "Queries", count: queries.length },
    { id: "mutations", label: "Mutations", count: mutations.length },
    { id: "cache", label: "Cache" },
  ];

  return (
    <div className="flex flex-col h-screen bg-leo-base text-leo-text">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-leo-border">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <img src="/icon-128.png" alt="Leonardo.Ai" className="size-6" />
            <div>
              Leonardo.<span className="text-purple-400">Ai</span>
            </div>
          </h1>
          <div className="opacity-50 font-normal text-base">
            Developer Tools
          </div>
          <span
            className={cn(
              "px-2 py-0.5 text-xs rounded-full flex items-center gap-0.5",
              state.isConnected
                ? "bg-green-500/20 text-green-400"
                : "bg-gray-500/20 text-gray-400 animate-pulse"
            )}
          >
            {state.isConnected ? (
              <svg
                className="size-3 relative -left-px"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="size-3 relative -left-px"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            Apollo
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearOperations}
            className="p-2 hover:bg-leo-active rounded transition-colors"
            title="Clear operations"
          >
            <svg
              className="size-4 text-gray-400 hover:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-leo-active rounded transition-colors"
            title="Settings"
          >
            <svg
              className="size-4 text-gray-400 hover:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div className="relative bg-leo-elevated border border-leo-border-strong rounded-lg shadow-xl w-96 max-w-[90vw]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-leo-border-strong">
              <h2 className="text-sm font-semibold text-white">Settings</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-leo-border-strong rounded transition-colors"
              >
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-3 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-300">Auto expand JSON</span>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      autoExpandJson: !prev.autoExpandJson,
                    }))
                  }
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors",
                    settings.autoExpandJson
                      ? "bg-leo-purple-600"
                      : "bg-leo-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                      settings.autoExpandJson
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-300">
                  Highlight Chakra components
                </span>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      highlightChakra: !prev.highlightChakra,
                    }))
                  }
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors",
                    settings.highlightChakra
                      ? "bg-leo-purple-600"
                      : "bg-leo-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                      settings.highlightChakra
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex border-b border-leo-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedOperationId(null);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === tab.id
                ? "text-purple-400"
                : "text-gray-400 hover:text-gray-200"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-leo-active rounded-full">
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "cache" ? (
          <CacheViewer cache={state.cache} />
        ) : (
          <PanelGroup direction="horizontal" autoSaveId="leo-main-panels">
            {/* Operation List */}
            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
              <div className="h-full overflow-y-auto">
                <OperationList
                  operations={activeTab === "queries" ? queries : mutations}
                  selectedId={selectedOperationId ?? undefined}
                  onSelect={(op) => setSelectedOperationId(op.id)}
                  operationType={activeTab as "queries" | "mutations"}
                  mockDataMap={mockDataMap}
                  mockEnabledMap={mockEnabledMap}
                  proxyOperations={proxyOperations}
                />
              </div>
            </ResizablePanel>

            <PanelResizeHandle className="panel-resize-handle" />

            {/* Operation Detail */}
            <ResizablePanel defaultSize={75} minSize={30}>
              <div className="h-full overflow-y-auto">
                {selectedOperation ? (
                  <OperationDetail
                    operation={selectedOperation}
                    mockData={
                      mockDataMap[selectedOperation.operationName] || ""
                    }
                    mockFileInfo={
                      mockFileInfoMap[selectedOperation.operationName]
                    }
                    mockEnabled={
                      mockEnabledMap[selectedOperation.operationName] !== false
                    }
                    onMockDataChange={handleMockDataChange}
                    onMockEnabledChange={handleMockEnabledChange}
                    autoExpandJson={settings.autoExpandJson}
                    // Proxy props
                    proxyInstances={proxyInstances}
                    proxyTargetTabId={proxyTargetTabId}
                    proxyError={proxyError}
                    proxiedData={proxiedDataMap[selectedOperation.operationName]}
                    isProxyEnabled={proxyOperations.has(selectedOperation.operationName)}
                    onProxyRegister={handleProxyRegister}
                    onProxyUnregister={handleProxyUnregister}
                    onProxyRequest={handleProxyRequest}
                    onProxyOperationToggle={handleProxyOperationToggle}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <Logo className="size-16 text-white/15" />
                      Select an operation to view details
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </PanelGroup>
        )}
      </main>
    </div>
  );
}
