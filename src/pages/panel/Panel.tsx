import React, { useState, useEffect, useCallback, useRef } from "react";
import "@pages/panel/Panel.css";
import { GraphQLOperation, RpcMethod, RawWatchedQuery, RawMutation } from "@src/shared/types";
import { OperationList } from "./components/OperationList";
import { CacheViewer } from "./components/CacheViewer";
import { OperationDetail } from "./components/OperationDetail";

type TabType = "queries" | "mutations" | "cache";

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
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
      timestamp: q.lastResponseTimestamp ?? Date.now(),
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
      error: m.error ? String((m.error as { message?: string })?.message || m.error) : undefined,
      timestamp: m.lastResponseTimestamp ?? Date.now(),
      status: m.loading ? "loading" : m.error ? "error" : "success",
    });
  }

  return operations;
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

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const rpcClientRef = useRef<ReturnType<typeof createRpcClient> | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  // Derive selected operation from current operations list to stay reactive
  const selectedOperation = selectedOperationId
    ? state.operations.find((op) => op.id === selectedOperationId) || null
    : null;

  // Fetch data via RPC and convert to operations
  const fetchData = useCallback(async () => {
    if (!rpcClientRef.current) return;

    try {
      const [queries, mutations, cache] = await Promise.all([
        rpcClientRef.current.request<RawWatchedQuery[]>("getQueries"),
        rpcClientRef.current.request<RawMutation[]>("getMutations"),
        rpcClientRef.current.request<Record<string, unknown>>("getCache"),
      ]);

      const operations = convertToOperations(queries || [], mutations || []);

      setState((prev) => ({
        ...prev,
        isConnected: true,
        operations,
        cache: cache || null,
      }));
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

    // Listen for non-RPC messages
    port.onMessage.addListener((message) => {
      switch (message.type) {
        case "APOLLO_CLIENT_DETECTED":
          setState((prev) => ({ ...prev, isConnected: true }));
          break;

        case "APOLLO_CLIENT_NOT_FOUND":
          setState((prev) => ({ ...prev, isConnected: false }));
          break;

        case "TAB_NAVIGATED":
          setState({
            isConnected: false,
            operations: [],
            cache: null,
          });
          setSelectedOperationId(null);
          break;
      }
    });

    // Start polling immediately
    startPolling();

    // Handle port disconnect
    port.onDisconnect.addListener(() => {
      console.log(
        "[Leonardo.Ai] Port disconnected, will reconnect on next render"
      );
      stopPolling();
    });

    return () => {
      stopPolling();
      rpcClient.cleanup();
      port.disconnect();
    };
  }, [startPolling, stopPolling]);

  const queries = state.operations.filter((op) => op.type === "query");
  const mutations = state.operations.filter((op) => op.type === "mutation");

  const clearOperations = useCallback(() => {
    setState((prev) => ({ ...prev, operations: [] }));
    setSelectedOperationId(null);
  }, []);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "queries", label: "Queries", count: queries.length },
    { id: "mutations", label: "Mutations", count: mutations.length },
    { id: "cache", label: "Cache" },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 bg-[#16162a] border-b border-[#2d2d4a]">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-white">
            Leonardo.Ai Developer Tools
          </h1>
          <span
            className={`px-2 py-0.5 text-xs rounded-full ${
              state.isConnected
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {state.isConnected ? "Connected" : "Waiting for Apollo Client..."}
          </span>
        </div>
        <button
          onClick={clearOperations}
          className="px-3 py-1 text-xs bg-[#2d2d4a] hover:bg-[#3d3d5c] rounded transition-colors"
        >
          Clear
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex border-b border-[#2d2d4a]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedOperationId(null);
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-purple-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-[#2d2d4a] rounded-full">
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
      <main className="flex-1 flex overflow-hidden">
        {activeTab === "cache" ? (
          <CacheViewer cache={state.cache} />
        ) : (
          <>
            {/* Operation List */}
            <div className="w-80 border-r border-[#2d2d4a] overflow-y-auto">
              <OperationList
                operations={activeTab === "queries" ? queries : mutations}
                selectedId={selectedOperationId ?? undefined}
                onSelect={(op) => setSelectedOperationId(op.id)}
                operationType={activeTab as 'queries' | 'mutations'}
              />
            </div>

            {/* Operation Detail */}
            <div className="flex-1 overflow-y-auto">
              {selectedOperation ? (
                <OperationDetail operation={selectedOperation} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select an operation to view details
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
