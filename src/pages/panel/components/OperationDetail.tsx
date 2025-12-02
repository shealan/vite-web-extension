import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { GraphQLOperation } from "@src/shared/types";
import { cn } from "@src/shared/cn";
import { EditableJsonTree } from "./EditableJsonTree";
import { GraphQLHighlight } from "./GraphQLHighlight";
import { JavaScriptEditor } from "./JavaScriptEditor";

interface MockFileInfo {
  fileName: string;
  fileSize: number;
}

// Component for rendering headers in a tabular format
function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);

  // Calculate the width needed for the longest header name
  const maxKeyLength = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.max(...entries.map(([key]) => key.length));
  }, [entries]);

  // Convert character count to approximate ch units (add some padding)
  const keyColumnWidth = `${maxKeyLength + 1}ch`;

  if (entries.length === 0) {
    return <span className="text-gray-500 text-xs">No headers captured</span>;
  }

  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td
              className="text-purple-400 font-medium align-top py-0.5 pr-2"
              style={{ width: keyColumnWidth }}
            >
              {key}:
            </td>
            <td className="text-gray-300 font-mono break-all align-top py-0.5">
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface OperationDetailProps {
  operation: GraphQLOperation;
  mockData?: string;
  mockFileInfo?: MockFileInfo;
  mockEnabled?: boolean;
  onMockDataChange?: (
    operationName: string,
    mockData: string,
    fileInfo?: MockFileInfo
  ) => void;
  onMockEnabledChange?: (operationName: string, enabled: boolean) => void;
  autoExpandJson?: boolean;
}

type LeftTab = "request" | "query" | "variables" | "policy";
type RightTab = "response" | "result" | "cache" | "mock";

// Result tab component with proper warning/copy button positioning
interface ResultTabProps {
  displayResult: unknown;
  hasMockData: boolean;
  mockEnabled: boolean;
  mockType: "json" | "js" | null;
  operation: GraphQLOperation;
  parsedMockData: unknown;
  jsonCollapsed: number | boolean;
}

function ResultTab({
  displayResult,
  hasMockData,
  mockEnabled,
  mockType,
  operation,
  parsedMockData,
  jsonCollapsed,
}: ResultTabProps) {
  return (
    <div className="json-tree w-full">
      {/* Warning banners - full width, above everything */}
      {hasMockData && mockEnabled && (
        <div className="font-sans mb-4 p-3 bg-purple-500/10 border-purple-500/30 border rounded">
          <h3 className="text-sm font-bold text-purple-400">Mocked Response</h3>
          <p className="text-xs mt-1 text-purple-300">
            {mockType === "js"
              ? "Script executes on each request - result shown is from last execution"
              : "This result is overridden by mock data"}
          </p>
        </div>
      )}
      {operation.error && parsedMockData === null && (
        <div className="font-sans mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
          <h3 className="text-sm font-medium text-red-400">Error</h3>
          <p className="text-xs text-red-300 mt-1">
            An error was returned by this {operation.type} operation
          </p>
        </div>
      )}

      {/* JSON content with copy button aligned to it */}
      {operation.status === "loading" && parsedMockData === null ? (
        <div className="flex items-center gap-2 text-gray-500 mt-2">
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
        <EditableJsonTree
          data={displayResult}
          readOnly
          collapsed={jsonCollapsed}
          showCopyButton
        />
      ) : (
        <span className="text-gray-500 pt-2 block">No result</span>
      )}
    </div>
  );
}

// Response tab component with proper warning/copy button positioning
interface ResponseTabProps {
  response: GraphQLOperation["response"];
  displayResult: unknown;
  jsonCollapsed: number | boolean;
}

function ResponseTab({
  response,
  displayResult,
  jsonCollapsed,
}: ResponseTabProps) {
  if (!response) {
    return (
      <div className="text-gray-500">
        <p>No response data available.</p>
        <p className="mt-2 text-xs">
          Response data is captured when the operation receives a network
          response. It may not be available for cached queries or if the request
          hasn't completed yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 text-xs rounded font-medium",
              response.status >= 200 &&
                response.status < 300 &&
                "bg-green-500/20 text-green-400",
              response.status >= 400 && "bg-red-500/20 text-red-400",
              response.status >= 300 &&
                response.status < 400 &&
                "bg-yellow-500/20 text-yellow-400"
            )}
          >
            {response.status}
          </span>
          <span className="text-xs text-gray-300 font-mono">
            {response.statusText}
          </span>
        </div>
      </div>

      {/* Headers */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 mb-2">Headers</h3>
        <div className="bg-leo-elevated rounded p-3">
          <HeadersTable headers={response.headers} />
        </div>
      </div>

      {/* Body */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 mb-2">Body</h3>
        {displayResult ? (
          <EditableJsonTree
            data={displayResult}
            readOnly
            collapsed={jsonCollapsed}
            showCopyButton
          />
        ) : (
          <div className="bg-leo-elevated rounded p-3">
            <span className="text-gray-500 text-xs">No body</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Cache tab component with proper warning/copy button positioning
interface CacheTabProps {
  operationCache: unknown;
  jsonCollapsed: number | boolean;
}

function CacheTab({ operationCache, jsonCollapsed }: CacheTabProps) {
  if (!operationCache) {
    return (
      <div className="text-gray-500">
        <p>No cached data available for this operation.</p>
        <p className="mt-2 text-xs">
          Cached data is retrieved from Apollo Client's watched queries. It may
          not be available if the query is no longer being watched.
        </p>
      </div>
    );
  }

  return (
    <div className="json-tree w-full">
      <EditableJsonTree
        data={operationCache}
        readOnly
        collapsed={jsonCollapsed}
        showCopyButton
      />
    </div>
  );
}

// Deep equality check for operation prop to prevent re-renders from polling
function arePropsEqual(
  prevProps: OperationDetailProps,
  nextProps: OperationDetailProps
): boolean {
  // Check simple props first (fast)
  if (
    prevProps.mockData !== nextProps.mockData ||
    prevProps.mockEnabled !== nextProps.mockEnabled ||
    prevProps.autoExpandJson !== nextProps.autoExpandJson ||
    prevProps.onMockDataChange !== nextProps.onMockDataChange ||
    prevProps.onMockEnabledChange !== nextProps.onMockEnabledChange
  ) {
    return false;
  }

  // Check mockFileInfo
  if (
    prevProps.mockFileInfo?.fileName !== nextProps.mockFileInfo?.fileName ||
    prevProps.mockFileInfo?.fileSize !== nextProps.mockFileInfo?.fileSize
  ) {
    return false;
  }

  // Deep compare operation - use JSON.stringify for stable comparison
  try {
    return (
      JSON.stringify(prevProps.operation) ===
      JSON.stringify(nextProps.operation)
    );
  } catch {
    return prevProps.operation === nextProps.operation;
  }
}

function OperationDetailInner({
  operation,
  mockData = "",
  mockFileInfo,
  mockEnabled = true,
  onMockDataChange,
  onMockEnabledChange,
  autoExpandJson = false,
}: OperationDetailProps) {
  // When autoExpandJson is true, set collapsed to false to expand all nodes
  // collapsed=1 keeps root expanded but collapses nested objects/arrays
  const jsonCollapsed = autoExpandJson ? false : 1;
  const [leftTab, setLeftTab] = useState<LeftTab>("request");
  const [rightTab, setRightTab] = useState<RightTab>("response");
  const [mockError, setMockError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use persisted file info, or fall back to null
  const displayFileName = mockFileInfo?.fileName ?? null;
  const displayFileSize = mockFileInfo?.fileSize ?? null;

  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: "request", label: "Request" },
    { id: "query", label: "Query" },
    { id: "variables", label: "Variables" },
    { id: "policy", label: "Policy" },
  ];

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: "response", label: "Response" },
    { id: "result", label: "Data" },
    { id: "cache", label: "Cache Data" },
    { id: "mock", label: "Mock Data" },
  ];

  // Parse mock data if available - supports both JSON and JS mock formats
  const { parsedMockData, mockType } = React.useMemo(() => {
    if (!mockData.trim()) return { parsedMockData: null, mockType: null };
    try {
      const parsed = JSON.parse(mockData);
      // Check if it's a JS mock wrapper
      if (
        parsed.__mockType === "js" &&
        typeof parsed.__mockScript === "string"
      ) {
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

  // Process file content and update mock data
  const processFileContent = useCallback(
    (content: string, fileName: string, fileSize: number) => {
      const isJS = fileName.endsWith(".js");

      if (isJS) {
        // Accept JS files - syntax validation happens at runtime in the page context
        setMockError(null);
        // Wrap JS in a special format so we can identify it
        const wrappedMock = JSON.stringify({
          __mockType: "js",
          __mockScript: content,
        });
        onMockDataChange?.(operation.operationName, wrappedMock, {
          fileName,
          fileSize,
        });
      } else {
        // Validate JSON
        try {
          JSON.parse(content);
          setMockError(null);
          onMockDataChange?.(operation.operationName, content, {
            fileName,
            fileSize,
          });
        } catch {
          setMockError("Invalid JSON file");
          onMockDataChange?.(operation.operationName, "");
        }
      }
    },
    [operation.operationName, onMockDataChange]
  );

  // Open file picker using traditional file input
  const openFilePicker = useCallback(() => {
    if (fileInputRef.current) {
      // Clear the input value so re-selecting the same file triggers onChange
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    } else {
      setMockError("File input not available");
    }
  }, []);

  // Reload file - opens file picker to re-select (browser security prevents direct re-read)
  const reloadFile = useCallback(() => {
    // Due to browser security restrictions, we cannot re-read files without user interaction
    // Open the file picker to let user re-select the file
    openFilePicker();
  }, [openFilePicker]);

  // Clear mock data
  const clearMock = useCallback(() => {
    onMockDataChange?.(operation.operationName, "");
    setMockError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [operation.operationName, onMockDataChange]);

  // Legacy file input handler (fallback for browsers without File System Access API)
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          processFileContent(content, file.name, file.size);
        };
        reader.onerror = () => {
          setMockError("Failed to read file");
        };
        reader.readAsText(file);
      }
    },
    [processFileContent]
  );

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        // Check if it's a valid file type
        if (file.name.endsWith(".json") || file.name.endsWith(".js")) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            processFileContent(content, file.name, file.size);
          };
          reader.onerror = () => {
            setMockError("Failed to read file");
          };
          reader.readAsText(file);
        } else {
          setMockError("Please drop a .json or .js file");
        }
      }
    },
    [processFileContent]
  );

  // Handle edits to JSON mock data from the editable tree
  const handleJsonEdit = useCallback(
    (updatedData: unknown) => {
      const jsonString = JSON.stringify(updatedData, null, 2);
      // Update mock data but preserve the file info (mark as "edited" once)
      const baseFileName =
        displayFileName?.replace(/ \(edited\)$/, "") || "Inline edit";
      onMockDataChange?.(operation.operationName, jsonString, {
        fileName:
          baseFileName === "Inline edit"
            ? baseFileName
            : `${baseFileName} (edited)`,
        fileSize: jsonString.length,
      });
      setMockError(null);
    },
    [operation.operationName, onMockDataChange, displayFileName]
  );

  // Handle edits to JS mock script from the editor
  const handleScriptEdit = useCallback(
    (updatedScript: string) => {
      // Store the updated script as a JS mock
      const mockData = JSON.stringify({
        __mockType: "js",
        __mockScript: updatedScript,
      });
      const baseFileName =
        displayFileName?.replace(/ \(edited\)$/, "") || "Inline edit";
      onMockDataChange?.(operation.operationName, mockData, {
        fileName:
          baseFileName === "Inline edit"
            ? baseFileName
            : `${baseFileName} (edited)`,
        fileSize: updatedScript.length,
      });
      setMockError(null);
    },
    [operation.operationName, onMockDataChange, displayFileName]
  );

  // Use mock data if valid, otherwise use actual result
  // For JS mocks, we show the actual result since the mock is dynamic
  const displayResult =
    (mockType === "json" ? parsedMockData : null) ?? operation.result;

  // Use cachedData from Apollo Client's queryInfo.getDiff() - this contains
  // the merged/paginated cached data directly from Apollo
  const operationCache = operation.cachedData ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-leo-border">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "px-2 py-0.5 text-xs rounded font-medium",
              operation.type === "query" && "bg-blue-500/20 text-blue-400",
              operation.type === "mutation" &&
                "bg-orange-500/20 text-orange-400",
              operation.type === "subscription" &&
                "bg-purple-500/20 text-purple-400"
            )}
          >
            {operation.type.toUpperCase()}
          </span>
          <div>
            <h2 className="text-sm font-mono text-white">
              {operation.operationName}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{new Date(operation.timestamp).toLocaleTimeString()}</span>
              {operation.duration && <span>{formatDuration(operation.duration)}</span>}
              {operation.error && (
                <span className="text-red-400">Has errors</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <PanelGroup
        direction="horizontal"
        autoSaveId="leo-detail-panels"
        className="flex-1"
      >
        {/* Left Panel - Query/Variables/Cache */}
        <ResizablePanel defaultSize={50} minSize={25} maxSize={75}>
          <div className="h-full flex flex-col">
            {/* Left Tabs */}
            <div className="flex border-b border-leo-border">
              {leftTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  className={cn(
                    "px-4 py-2 text-xs font-medium transition-colors",
                    leftTab === tab.id
                      ? "text-purple-400 border-b-2 border-purple-500"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Left Content */}
            <div className="flex-1 overflow-auto p-3 json-panel">
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
                        <div className="bg-leo-elevated rounded p-3">
                          <HeadersTable headers={operation.request.headers} />
                        </div>
                      </div>

                      {/* Body */}
                      <div>
                        <h3 className="text-xs font-medium text-gray-400 mb-2">
                          Body
                        </h3>
                        {operation.request.body ? (
                          (() => {
                            try {
                              const parsed = JSON.parse(operation.request.body);
                              return (
                                <EditableJsonTree
                                  data={parsed}
                                  readOnly
                                  collapsed={jsonCollapsed}
                                  showCopyButton
                                />
                              );
                            } catch {
                              return (
                                <div className="bg-leo-elevated rounded p-3">
                                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
                                    {operation.request.body}
                                  </pre>
                                </div>
                              );
                            }
                          })()
                        ) : (
                          <div className="bg-leo-elevated rounded p-3">
                            <span className="text-gray-500 text-xs">
                              No body
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">
                      <p>No request data available.</p>
                      <p className="mt-2 text-xs">
                        Request data is captured when the operation makes a
                        network request. It may not be available for cached
                        queries or if the request hasn't been made yet.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {leftTab === "query" && (
                <GraphQLHighlight query={operation.query} />
              )}

              {leftTab === "variables" && (
                <div className="json-tree w-full">
                  {operation.variables &&
                  Object.keys(operation.variables).length > 0 ? (
                    <EditableJsonTree
                      data={operation.variables}
                      readOnly
                      collapsed={jsonCollapsed}
                      showCopyButton
                    />
                  ) : (
                    <span className="text-gray-500">No variables</span>
                  )}
                </div>
              )}

              {leftTab === "policy" && (
                <div className="space-y-2 text-xs font-mono">
                  {operation.options ? (
                    <>
                      {/* fetchPolicy */}
                      <div className="flex items-center justify-between py-2 border-b border-leo-border">
                        <span className="text-gray-400">fetchPolicy</span>
                        <span className="text-green-300/75">
                          {operation.options.fetchPolicy
                            ? `"${operation.options.fetchPolicy}"`
                            : "null"}
                        </span>
                      </div>

                      {/* errorPolicy */}
                      <div className="flex items-center justify-between py-2 border-b border-leo-border">
                        <span className="text-gray-400">errorPolicy</span>
                        <span className="text-green-300/75">
                          {operation.options.errorPolicy
                            ? `"${operation.options.errorPolicy}"`
                            : "null"}
                        </span>
                      </div>

                      {/* notifyOnNetworkStatusChange */}
                      <div className="flex items-center justify-between py-2 border-b border-leo-border">
                        <span className="text-gray-400">
                          notifyOnNetworkStatusChange
                        </span>
                        <span
                          className={cn(
                            operation.options.notifyOnNetworkStatusChange
                              ? "text-green-400"
                              : "text-orange-300/75"
                          )}
                        >
                          {operation.options.notifyOnNetworkStatusChange
                            ? "true"
                            : "false"}
                        </span>
                      </div>

                      {/* returnPartialData */}
                      <div className="flex items-center justify-between py-2 border-b border-leo-border">
                        <span className="text-gray-400">returnPartialData</span>
                        <span
                          className={cn(
                            operation.options.returnPartialData
                              ? "text-green-400"
                              : "text-orange-300/75"
                          )}
                        >
                          {operation.options.returnPartialData
                            ? "true"
                            : "false"}
                        </span>
                      </div>

                      {/* partialRefetch */}
                      <div className="flex items-center justify-between py-2 border-b border-leo-border">
                        <span className="text-gray-400">partialRefetch</span>
                        <span
                          className={cn(
                            operation.options.partialRefetch
                              ? "text-green-400"
                              : "text-orange-300/75"
                          )}
                        >
                          {operation.options.partialRefetch ? "true" : "false"}
                        </span>
                      </div>

                      {/* canonizeResults */}
                      {operation.options.canonizeResults !== null && (
                        <div className="flex items-center justify-between py-2 border-b border-leo-border">
                          <span className="text-gray-400">canonizeResults</span>
                          <span
                            className={cn(
                              operation.options.canonizeResults
                                ? "text-green-400"
                                : "text-orange-300/75"
                            )}
                          >
                            {operation.options.canonizeResults
                              ? "true"
                              : "false"}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-gray-500">
                      <p>No policy options available.</p>
                      <p className="mt-2 text-xs">
                        Policy options are only available for queries. Mutations
                        do not have these options.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <PanelResizeHandle className="panel-resize-handle" />

        {/* Right Panel - Result/Cache */}
        <ResizablePanel defaultSize={50} minSize={25} maxSize={75}>
          <div className="h-full flex flex-col">
            {/* Right Tabs */}
            <div className="flex border-b border-leo-border">
              {rightTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  className={cn(
                    "px-4 py-2 text-xs font-medium transition-colors",
                    rightTab === tab.id
                      ? "text-purple-400 border-b-2 border-purple-500"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Right Content */}
            <div className="flex-1 overflow-auto p-3 json-panel">
              {rightTab === "response" && (
                <ResponseTab
                  response={operation.response}
                  displayResult={displayResult}
                  jsonCollapsed={jsonCollapsed}
                />
              )}

              {rightTab === "result" && (
                <ResultTab
                  displayResult={displayResult}
                  hasMockData={hasMockData}
                  mockEnabled={mockEnabled}
                  mockType={mockType}
                  operation={operation}
                  parsedMockData={parsedMockData}
                  jsonCollapsed={jsonCollapsed}
                />
              )}

              {rightTab === "cache" && (
                <CacheTab
                  operationCache={operationCache}
                  jsonCollapsed={jsonCollapsed}
                />
              )}

              {rightTab === "mock" && (
                <div className="flex flex-col h-full">
                  {/* Hidden file input (fallback for browsers without File System Access API) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.js,application/json,text/javascript"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id={`mock-file-${operation.id}`}
                  />

                  {/* File picker with drag & drop - only show when no mock is loaded */}
                  {!hasMockData && (
                    <div
                      onClick={openFilePicker}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer duration-200 transition-colors",
                        isDragOver
                          ? "border-purple-500/20"
                          : "border-leo-border-strong hover:border-purple-500/20 hover:bg-leo-active/50"
                      )}
                    >
                      <svg
                        className={cn(
                          "w-6 h-6 mb-2",
                          isDragOver ? "text-purple-400" : "text-gray-500"
                        )}
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
                      <span
                        className={cn(
                          "text-sm",
                          isDragOver ? "text-purple-300" : "text-gray-400"
                        )}
                      >
                        {isDragOver
                          ? "Drop mock result data file"
                          : "Select mock result data file"}
                      </span>
                      <span className="text-xs text-gray-600 mt-1">
                        .json or .js files
                      </span>
                    </div>
                  )}

                  {/* Status messages */}
                  {mockError && (
                    <p className="mt-3 text-xs text-red-400">{mockError}</p>
                  )}

                  {/* JSON Mock - show editable tree */}
                  {hasMockData && mockType === "json" && (
                    <div className="flex flex-col flex-1 pb-3 space-y-4">
                      {/* Card header with file info and actions */}
                      <div
                        className={cn(
                          "relative p-3 border rounded",
                          mockEnabled
                            ? "bg-purple-500/10 border-purple-500/30"
                            : "bg-gray-500/10 border-gray-500/30"
                        )}
                      >
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {/* Enable/Disable toggle */}
                          <button
                            onClick={() =>
                              onMockEnabledChange?.(
                                operation.operationName,
                                !mockEnabled
                              )
                            }
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20 text-purple-400 hover:text-purple-300"
                                : "hover:bg-gray-500/20 text-gray-500 hover:text-gray-300"
                            )}
                            title={mockEnabled ? "Disable mock" : "Enable mock"}
                          >
                            {mockEnabled ? (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={reloadFile}
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20"
                                : "hover:bg-gray-500/20"
                            )}
                            title="Load different file"
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                mockEnabled
                                  ? "text-purple-400 hover:text-purple-300"
                                  : "text-gray-500 hover:text-gray-300"
                              )}
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
                            onClick={clearMock}
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20"
                                : "hover:bg-gray-500/20"
                            )}
                            title="Remove mock"
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                mockEnabled
                                  ? "text-purple-400 hover:text-purple-300"
                                  : "text-gray-500 hover:text-gray-300"
                              )}
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
                        <div className="flex items-center gap-3 pr-20">
                          <svg
                            className={cn(
                              "w-5 h-5 shrink-0",
                              mockEnabled ? "text-purple-400" : "text-gray-500"
                            )}
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
                          <div className="flex-1">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                mockEnabled
                                  ? "text-purple-400"
                                  : "text-gray-500"
                              )}
                            >
                              {displayFileName || "Mock Data"}
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-0.5",
                                mockEnabled
                                  ? "text-purple-300"
                                  : "text-gray-500"
                              )}
                            >
                              {displayFileSize !== null &&
                                formatFileSize(displayFileSize)}{" "}
                              — Click values to edit
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Only show JSON content when mock is enabled */}
                      {mockEnabled && (
                        <EditableJsonTree
                          data={parsedMockData}
                          onEdit={handleJsonEdit}
                          collapsed={jsonCollapsed}
                          showCopyButton
                        />
                      )}
                    </div>
                  )}

                  {/* JS Mock - show script info */}
                  {hasMockData && mockType === "js" && (
                    <div className="flex flex-col">
                      <div
                        className={cn(
                          "relative p-3 border rounded",
                          mockEnabled
                            ? "bg-purple-500/10 border-purple-500/30"
                            : "bg-gray-500/10 border-gray-500/30"
                        )}
                      >
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {/* Enable/Disable toggle */}
                          <button
                            onClick={() =>
                              onMockEnabledChange?.(
                                operation.operationName,
                                !mockEnabled
                              )
                            }
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20 text-purple-400 hover:text-purple-300"
                                : "hover:bg-gray-500/20 text-gray-500 hover:text-gray-300"
                            )}
                            title={mockEnabled ? "Disable mock" : "Enable mock"}
                          >
                            {mockEnabled ? (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={reloadFile}
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20"
                                : "hover:bg-gray-500/20"
                            )}
                            title="Load different file"
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                mockEnabled
                                  ? "text-purple-400 hover:text-purple-300"
                                  : "text-gray-500 hover:text-gray-300"
                              )}
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
                            onClick={clearMock}
                            className={cn(
                              "p-1 rounded transition-colors",
                              mockEnabled
                                ? "hover:bg-purple-500/20"
                                : "hover:bg-gray-500/20"
                            )}
                            title="Remove mock"
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                mockEnabled
                                  ? "text-purple-400 hover:text-purple-300"
                                  : "text-gray-500 hover:text-gray-300"
                              )}
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
                        <div className="flex items-center gap-3 pr-20">
                          <svg
                            className={cn(
                              "w-5 h-5 shrink-0",
                              mockEnabled ? "text-purple-400" : "text-gray-500"
                            )}
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
                          <div className="flex-1">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                mockEnabled
                                  ? "text-purple-400"
                                  : "text-gray-500"
                              )}
                            >
                              {displayFileName}
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-0.5",
                                mockEnabled
                                  ? "text-purple-300"
                                  : "text-gray-500"
                              )}
                            >
                              {displayFileSize !== null &&
                                formatFileSize(displayFileSize)}{" "}
                              — Script executes on each request
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Only show script editor and help text when mock is enabled */}
                      {mockEnabled &&
                        parsedMockData?.__mockScript !== undefined && (
                          <>
                            <div className="mt-4">
                              <p className="text-xs text-gray-400 mb-2">
                                Script (editable):
                              </p>
                              <JavaScriptEditor
                                code={parsedMockData.__mockScript}
                                onChange={handleScriptEdit}
                              />
                            </div>

                            <p className="text-xs text-gray-500 mt-3">
                              Utilise{" "}
                              <code className="text-purple-400">variables</code>
                              ,{" "}
                              <code className="text-purple-400">
                                operationName
                              </code>
                              ,{" and "}
                              <code className="text-purple-400">
                                request
                              </code>{" "}
                              to create dynamic mock data.
                            </p>
                          </>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </PanelGroup>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Memoized with deep equality check to prevent re-renders from parent polling updates
export const OperationDetail = React.memo(OperationDetailInner, arePropsEqual);
