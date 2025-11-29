import React, { useState, useRef } from "react";
import { GraphQLOperation } from "@src/shared/types";
import { JsonTree, CopyButton } from "./JsonTree";
import { GraphQLHighlight } from "./GraphQLHighlight";

interface OperationDetailProps {
  operation: GraphQLOperation;
  mockData?: string;
  onMockDataChange?: (operationName: string, mockData: string) => void;
}

type LeftTab = "request" | "query" | "variables" | "mock";
type RightTab = "result" | "cache";

export function OperationDetail({
  operation,
  mockData = "",
  onMockDataChange,
}: OperationDetailProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>("request");
  const [rightTab, setRightTab] = useState<RightTab>("result");
  const [mockError, setMockError] = useState<string | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: "request", label: "Request" },
    { id: "query", label: "Query" },
    { id: "variables", label: "Variables" },
    { id: "mock", label: "Mock" },
  ];

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: "result", label: "Result" },
    { id: "cache", label: "Cache" },
  ];

  // Parse mock data if available
  const parsedMockData = React.useMemo(() => {
    if (!mockData.trim()) return null;
    try {
      setMockError(null);
      return JSON.parse(mockData);
    } catch {
      return null;
    }
  }, [mockData]);

  // Use mock data if valid, otherwise use actual result
  const displayResult = parsedMockData ?? operation.result;

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
            {leftTab === "request" && (
              <div className="space-y-4">
                {operation.request ? (
                  <>
                    {/* URL and Method */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs rounded font-medium bg-blue-500/20 text-blue-400">
                          {operation.request.method}
                        </span>
                        <span className="text-xs text-gray-300 font-mono break-all">
                          {operation.request.url}
                        </span>
                      </div>
                    </div>

                    {/* Headers */}
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 mb-2">
                        Headers
                      </h3>
                      <div className="bg-[#2d2d4a] rounded p-3 space-y-1">
                        {Object.entries(operation.request.headers).length > 0 ? (
                          Object.entries(operation.request.headers).map(
                            ([key, value]) => (
                              <div key={key} className="flex gap-2 text-xs">
                                <span className="text-purple-400 font-medium shrink-0">
                                  {key}:
                                </span>
                                <span className="text-gray-300 font-mono break-all">
                                  {value}
                                </span>
                              </div>
                            )
                          )
                        ) : (
                          <span className="text-gray-500 text-xs">
                            No headers captured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-medium text-gray-400">
                          Body
                        </h3>
                        {operation.request.body && (
                          <CopyButton
                            data={(() => {
                              try {
                                return JSON.parse(operation.request.body);
                              } catch {
                                return operation.request.body;
                              }
                            })()}
                          />
                        )}
                      </div>
                      <div className="bg-[#2d2d4a] rounded p-3">
                        {operation.request.body ? (
                          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
                            {(() => {
                              try {
                                return JSON.stringify(
                                  JSON.parse(operation.request.body),
                                  null,
                                  2
                                );
                              } catch {
                                return operation.request.body;
                              }
                            })()}
                          </pre>
                        ) : (
                          <span className="text-gray-500 text-xs">No body</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500">
                    <p>No request data available.</p>
                    <p className="mt-2 text-xs">
                      Request data is captured when the operation makes a network
                      request. It may not be available for cached queries or if
                      the request hasn't been made yet.
                    </p>
                  </div>
                )}
              </div>
            )}

            {leftTab === "query" && (
              <GraphQLHighlight query={operation.query} />
            )}

            {leftTab === "mock" && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Select a JSON file to override the result
                  </span>
                  {mockData.trim() && (
                    <button
                      onClick={() => {
                        onMockDataChange?.(operation.operationName, "");
                        setLoadedFileName(null);
                        setMockError(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* File input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;
                      try {
                        JSON.parse(content);
                        setMockError(null);
                        setLoadedFileName(file.name);
                        onMockDataChange?.(operation.operationName, content);
                      } catch {
                        setMockError("Invalid JSON file");
                        setLoadedFileName(null);
                        onMockDataChange?.(operation.operationName, "");
                      }
                    };
                    reader.onerror = () => {
                      setMockError("Failed to read file");
                      setLoadedFileName(null);
                    };
                    reader.readAsText(file);
                  }}
                  className="hidden"
                  id={`mock-file-${operation.id}`}
                />

                <label
                  htmlFor={`mock-file-${operation.id}`}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#3d3d5c] rounded-lg cursor-pointer hover:border-purple-500 hover:bg-[#2d2d4a]/50 transition-colors"
                >
                  <svg
                    className="w-8 h-8 text-gray-500 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-sm text-gray-400">
                    Click to select a JSON file
                  </span>
                  <span className="text-xs text-gray-600 mt-1">
                    .json files only
                  </span>
                </label>

                {/* Status messages */}
                {mockError && (
                  <p className="mt-3 text-xs text-red-400">{mockError}</p>
                )}
                {loadedFileName && parsedMockData && (
                  <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded">
                    <p className="text-xs text-green-400 font-medium">
                      Loaded: {loadedFileName}
                    </p>
                    <p className="text-xs text-green-300 mt-1">
                      Valid JSON - this will override the result
                    </p>
                  </div>
                )}

                {/* Preview of loaded mock data */}
                {parsedMockData && (
                  <div className="mt-4 flex-1 overflow-auto">
                    <p className="text-xs text-gray-400 mb-2">Preview:</p>
                    <div className="json-tree w-full max-h-64 overflow-auto bg-[#2d2d4a] rounded p-2">
                      <JsonTree data={parsedMockData} />
                    </div>
                  </div>
                )}
              </div>
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
                  {parsedMockData && (
                    <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded w-11/12">
                      <h3 className="text-sm font-medium text-purple-400">
                        Mocked Response
                      </h3>
                      <p className="text-xs text-purple-300 mt-1">
                        This result is overridden by mock data
                      </p>
                    </div>
                  )}
                  {operation.error && !parsedMockData && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded w-11/12">
                      <h3 className="text-sm font-medium text-red-400">
                        Error
                      </h3>
                      <p className="text-xs text-red-300 mt-1">
                        An error was returned by this {operation.type} operation
                      </p>
                    </div>
                  )}
                  {operation.status === "loading" && !parsedMockData ? (
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
                  ) : displayResult ? (
                    <JsonTree data={displayResult} />
                  ) : (
                    <span className="text-gray-500">No result</span>
                  )}
                </div>
                {displayResult && (
                  <div className="fixed-copy-button">
                    <CopyButton data={displayResult} />
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
                        Cached data is retrieved from Apollo Client's watched
                        queries. It may not be available if the query is no
                        longer being watched.
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
