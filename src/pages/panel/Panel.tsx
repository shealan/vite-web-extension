import React, { useState, useEffect, useCallback } from "react";
import "@pages/panel/Panel.css";
import { GraphQLOperation } from "@src/shared/types";
import { OperationList } from "./components/OperationList";
import { CacheViewer } from "./components/CacheViewer";
import { OperationDetail } from "./components/OperationDetail";

type TabType = "queries" | "mutations" | "cache";

interface ApolloState {
  isConnected: boolean;
  operations: GraphQLOperation[];
  cache: Record<string, unknown> | null;
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

  // Derive selected operation from current operations list to stay reactive
  const selectedOperation = selectedOperationId
    ? state.operations.find((op) => op.id === selectedOperationId) || null
    : null;

  useEffect(() => {
    // Connect to background script
    const port = chrome.runtime.connect({ name: "apollo-lite-devtools" });

    // Initialize with current tab ID
    port.postMessage({
      type: "INIT",
      tabId: chrome.devtools.inspectedWindow.tabId,
    });

    // Listen for messages
    port.onMessage.addListener((message) => {
      switch (message.type) {
        case "APOLLO_CLIENT_DETECTED":
          setState((prev) => ({ ...prev, isConnected: true }));
          break;

        case "APOLLO_CLIENT_NOT_FOUND":
          setState((prev) => ({ ...prev, isConnected: false }));
          break;

        case "GRAPHQL_OPERATION_START": {
          const payload = message.payload as Partial<GraphQLOperation>;
          setState((prev) => {
            // Check if operation with same name exists
            const existingIndex = prev.operations.findIndex(
              (op) =>
                op.operationName === payload.operationName &&
                op.type === payload.type
            );

            if (existingIndex !== -1) {
              // Update existing operation to loading state
              const updated = [...prev.operations];
              updated[existingIndex] = {
                ...updated[existingIndex],
                status: "loading",
                timestamp: payload.timestamp || Date.now(),
                variables: payload.variables,
              };
              return { ...prev, isConnected: true, operations: updated };
            }

            // Add new operation in loading state
            const newOp: GraphQLOperation = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              type: payload.type || "query",
              operationName: payload.operationName || "Unknown",
              query: payload.query || "",
              variables: payload.variables,
              timestamp: payload.timestamp || Date.now(),
              status: "loading",
            };
            return {
              ...prev,
              isConnected: true,
              operations: [...prev.operations, newOp],
            };
          });
          break;
        }

        case "GRAPHQL_OPERATION_COMPLETE": {
          const payload = message.payload as Partial<GraphQLOperation>;
          setState((prev) => {
            // Find operation with same name to update
            const existingIndex = prev.operations.findIndex(
              (op) =>
                op.operationName === payload.operationName &&
                op.type === payload.type
            );

            if (existingIndex !== -1) {
              // Update existing operation with result
              const updated = [...prev.operations];
              updated[existingIndex] = {
                ...updated[existingIndex],
                result: payload.result,
                cachedData: payload.cachedData,
                error: payload.error,
                duration: payload.duration,
                timestamp:
                  payload.timestamp || updated[existingIndex].timestamp,
                status: payload.status || (payload.error ? "error" : "success"),
              };
              return { ...prev, isConnected: true, operations: updated };
            }

            // If no existing operation found, add it as complete
            const newOp: GraphQLOperation = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              type: payload.type || "query",
              operationName: payload.operationName || "Unknown",
              query: payload.query || "",
              variables: payload.variables,
              result: payload.result,
              cachedData: payload.cachedData,
              error: payload.error,
              timestamp: payload.timestamp || Date.now(),
              duration: payload.duration,
              status: payload.status || (payload.error ? "error" : "success"),
            };
            return {
              ...prev,
              isConnected: true,
              operations: [...prev.operations, newOp],
            };
          });
          break;
        }

        case "CACHE_UPDATE":
          setState((prev) => ({
            ...prev,
            isConnected: true,
            cache: message.payload?.data || null,
          }));
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

    // Request initial cache
    port.postMessage({ type: "REQUEST_CACHE" });

    // Handle port disconnect (e.g., background script restart)
    port.onDisconnect.addListener(() => {
      console.log(
        "[Leonardo.Ai] Port disconnected, will reconnect on next render"
      );
    });

    return () => {
      port.disconnect();
    };
  }, []);

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
