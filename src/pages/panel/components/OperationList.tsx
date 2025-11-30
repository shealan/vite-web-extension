import React, { useState, useMemo } from "react";
import { GraphQLOperation } from "@src/shared/types";

interface OperationListProps {
  operations: GraphQLOperation[];
  selectedId?: string;
  onSelect: (operation: GraphQLOperation) => void;
  operationType: "queries" | "mutations";
  /** Map of operation names to mock data (non-empty = has mock) */
  mockDataMap?: Record<string, string>;
  /** Map of operation names to enabled state */
  mockEnabledMap?: Record<string, boolean>;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3 text-purple-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Mock badge component
function MockBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 text-[10px] font-semibold text-white bg-purple-500 rounded"
      title="Mocked"
    >
      M
    </span>
  );
}

export function OperationList({
  operations,
  selectedId,
  onSelect,
  operationType,
  mockDataMap = {},
  mockEnabledMap = {},
}: OperationListProps) {
  // Helper to check if an operation has an active mock
  const hasMock = (operationName: string) => {
    const mockData = mockDataMap[operationName];
    const isEnabled = mockEnabledMap[operationName] !== false;
    return mockData && mockData.trim() !== "" && isEnabled;
  };
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOperations = useMemo(() => {
    if (!searchQuery) return operations;
    return operations.filter((op) =>
      op.operationName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [operations, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-leo-border">
        <input
          type="text"
          placeholder={`Search ${operationType}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-leo-elevated border border-leo-border-strong rounded focus:outline-none focus:border-leo-purple-500 text-leo-text placeholder-leo-text-muted"
        />
      </div>

      {/* Operations List */}
      <div className="flex-1 overflow-y-auto">
        {operations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm p-4">
            No operations recorded yet
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm p-4">
            No matching operations
          </div>
        ) : (
          <div className="divide-y divide-leo-border">
            {filteredOperations.map((operation) => (
              <button
                key={operation.id}
                onClick={() => onSelect(operation)}
                className={`w-full px-3 py-2 text-left hover:bg-leo-hover/50 transition-colors ${
                  selectedId === operation.id ? "bg-leo-hover" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {hasMock(operation.operationName) && <MockBadge />}
                    <span className="text-sm font-medium text-gray-200 truncate font-mono">
                      {operation.operationName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {operation.status === "loading" && <Spinner />}
                    {operation.status === "error" && (
                      <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                        Error
                      </span>
                    )}
                    {operation.status === "success" && (
                      <span className="text-green-400 text-xs">✓</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span>{formatTime(operation.timestamp)}</span>
                  {operation.status === "loading" ? (
                    <span className="text-purple-400">loading...</span>
                  ) : operation.duration ? (
                    <span className="text-gray-400">
                      {operation.duration}ms
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-2 border-t border-leo-border text-xs text-leo-text-muted">
        {filteredOperations.length} / {operations.length} {operationType}
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
