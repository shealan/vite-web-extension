import React, { useState } from "react";
import { GraphQLOperation } from "@src/shared/types";
import { JsonTree, CopyButton } from "./JsonTree";
import { GraphQLHighlight } from "./GraphQLHighlight";

interface OperationDetailProps {
  operation: GraphQLOperation;
}

type LeftTab = "query" | "variables";
type RightTab = "result" | "cache";

export function OperationDetail({ operation }: OperationDetailProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>("query");
  const [rightTab, setRightTab] = useState<RightTab>("result");

  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: "query", label: "Query" },
    { id: "variables", label: "Variables" },
  ];

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: "result", label: "Result" },
    { id: "cache", label: "Cache" },
  ];

  // Use cachedData from Apollo Client's queryInfo.getDiff() - this contains
  // the merged/paginated cached data directly from Apollo
  const operationCache = operation.cachedData ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[#2d2d4a]">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-xs rounded font-medium ${
              operation.type === "query"
                ? "bg-blue-500/20 text-blue-400"
                : operation.type === "mutation"
                ? "bg-orange-500/20 text-orange-400"
                : "bg-purple-500/20 text-purple-400"
            }`}
          >
            {operation.type.toUpperCase()}
          </span>
          <h2 className="text-sm font-semibold text-white">
            {operation.operationName}
          </h2>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{new Date(operation.timestamp).toLocaleTimeString()}</span>
          {operation.duration && <span>{operation.duration}ms</span>}
          {operation.error && <span className="text-red-400">Has errors</span>}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Query/Variables/Cache */}
        <div className="w-1/2 flex flex-col border-r border-[#2d2d4a]">
          {/* Left Tabs */}
          <div className="flex border-b border-[#2d2d4a]">
            {leftTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setLeftTab(tab.id)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  leftTab === tab.id
                    ? "text-purple-400 border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Left Content */}
          <div className="flex-1 overflow-auto p-4 json-panel">
            {leftTab === "query" && (
              <GraphQLHighlight query={operation.query} />
            )}

            {leftTab === "variables" && (
              <>
                <div className="json-tree w-full">
                  {operation.variables &&
                  Object.keys(operation.variables).length > 0 ? (
                    <JsonTree data={operation.variables} />
                  ) : (
                    <span className="text-gray-500">No variables</span>
                  )}
                </div>
                {operation.variables &&
                  Object.keys(operation.variables).length > 0 && (
                    <div className="fixed-copy-button">
                      <CopyButton data={operation.variables} />
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Result/Cache */}
        <div className="w-1/2 flex flex-col">
          {/* Right Tabs */}
          <div className="flex border-b border-[#2d2d4a]">
            {rightTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  rightTab === tab.id
                    ? "text-purple-400 border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-auto p-4 json-panel">
            {rightTab === "result" && (
              <>
                <div className="json-tree w-full">
                  {operation.error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded w-11/12">
                      <h3 className="text-sm font-medium text-red-400">
                        Error
                      </h3>
                      <p className="text-xs text-red-300 mt-1">
                        An error was returned by this {operation.type} operation
                      </p>
                    </div>
                  )}
                  {operation.status === "loading" ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <svg
                        className="animate-spin h-4 w-4 text-purple-400"
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
                      <span>Loading...</span>
                    </div>
                  ) : operation.result ? (
                    <JsonTree data={operation.result} />
                  ) : (
                    <span className="text-gray-500">No result</span>
                  )}
                </div>
                {operation.result && (
                  <div className="fixed-copy-button">
                    <CopyButton data={operation.result} />
                  </div>
                )}
              </>
            )}

            {rightTab === "cache" && (
              <>
                <div className="json-tree w-full">
                  {operationCache ? (
                    <JsonTree data={operationCache} />
                  ) : (
                    <div className="text-gray-500">
                      <p>No cached data available for this operation.</p>
                      <p className="mt-2 text-xs">
                        Cached data is retrieved from Apollo Client's watched queries.
                        It may not be available if the query is no longer being watched.
                      </p>
                    </div>
                  )}
                </div>
                {operationCache && (
                  <div className="fixed-copy-button">
                    <CopyButton data={operationCache} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
