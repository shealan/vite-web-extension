import React, { useState, useRef } from "react";
import { GraphQLOperation } from "@src/shared/types";
import { JsonTree, CopyButton } from "./JsonTree";
import { GraphQLHighlight } from "./GraphQLHighlight";

interface MockFileInfo {
  fileName: string;
  fileSize: number;
}

interface OperationDetailProps {
  operation: GraphQLOperation;
  mockData?: string;
  mockFileInfo?: MockFileInfo;
  onMockDataChange?: (operationName: string, mockData: string, fileInfo?: MockFileInfo) => void;
}

type LeftTab = "request" | "query" | "variables" | "mock";
type RightTab = "result" | "cache";

export function OperationDetail({
  operation,
  mockData = "",
  mockFileInfo,
  onMockDataChange,
}: OperationDetailProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>("request");
  const [rightTab, setRightTab] = useState<RightTab>("result");
  const [mockError, setMockError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use persisted file info, or fall back to null
  const displayFileName = mockFileInfo?.fileName ?? null;
  const displayFileSize = mockFileInfo?.fileSize ?? null;

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

  // Parse mock data if available - supports both JSON and JS mock formats
  const { parsedMockData, mockType } = React.useMemo(() => {
    if (!mockData.trim()) return { parsedMockData: null, mockType: null };
    try {
      const parsed = JSON.parse(mockData);
      // Check if it's a JS mock wrapper
      if (parsed.__mockType === "js" && typeof parsed.__mockScript === "string") {
        return { parsedMockData: parsed, mockType: "js" as const };
      }
      // Regular JSON mock
      return { parsedMockData: parsed, mockType: "json" as const };
    } catch {
      return { parsedMockData: null, mockType: null };
    }
  }, [mockData]);

  // For display, we show the actual mock data (not the wrapper for JS)
  const hasMockData = parsedMockData !== null;

  // Use mock data if valid, otherwise use actual result
  // For JS mocks, we show the actual result since the mock is dynamic
  const displayResult = (mockType === "json" ? parsedMockData : null) ?? operation.result;

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
                    Select a JSON or JS file to override the result
                  </span>
                  {mockData.trim() && (
                    <button
                      onClick={() => {
                        onMockDataChange?.(operation.operationName, "");
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
                  accept=".json,.js,application/json,text/javascript"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const isJS = file.name.endsWith(".js");
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;

                      if (isJS) {
                        // Accept JS files - syntax validation happens at runtime in the page context
                        // (Chrome extension CSP doesn't allow eval/new Function in extension pages)
                        setMockError(null);
                        // Wrap JS in a special format so we can identify it
                        const wrappedMock = JSON.stringify({
                          __mockType: "js",
                          __mockScript: content,
                        });
                        onMockDataChange?.(operation.operationName, wrappedMock, {
                          fileName: file.name,
                          fileSize: file.size,
                        });
                      } else {
                        // Validate JSON
                        try {
                          JSON.parse(content);
                          setMockError(null);
                          onMockDataChange?.(operation.operationName, content, {
                            fileName: file.name,
                            fileSize: file.size,
                          });
                        } catch {
                          setMockError("Invalid JSON file");
                          onMockDataChange?.(operation.operationName, "");
                        }
                      }
                    };
                    reader.onerror = () => {
                      setMockError("Failed to read file");
                    };
                    reader.readAsText(file);
                  }}
                  className="hidden"
                  id={`mock-file-${operation.id}`}
                />

                {/* File picker - only show when no mock is loaded */}
                {!hasMockData && (
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
                      Click to select a mock file
                    </span>
                    <span className="text-xs text-gray-600 mt-1">
                      .json or .js files
                    </span>
                  </label>
                )}

                {/* Status messages */}
                {mockError && (
                  <p className="mt-3 text-xs text-red-400">{mockError}</p>
                )}
                {displayFileName && hasMockData && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-green-400 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm text-green-400 font-medium">
                        {displayFileName}
                      </p>
                      <p className="text-xs text-green-300 mt-0.5">
                        {displayFileSize !== null && formatFileSize(displayFileSize)} — {mockType === "js" ? "Script executes on each request (errors shown in console)" : "Will override the result"}
                      </p>
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
                  {hasMockData && (
                    <div className="mb-4 p-3 bg-purple-500/10 border-purple-500/30 border rounded w-11/12">
                      <h3 className="text-sm font-medium text-purple-400">
                        Mocked Response
                      </h3>
                      <p className="text-xs mt-1 text-purple-300">
                        {mockType === "js"
                          ? "Script executes on each request - result shown is from last execution"
                          : "This result is overridden by mock data"}
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
