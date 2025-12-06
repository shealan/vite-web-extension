import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { GraphQLOperation, ProxyInstance } from "@src/shared/types";
import { cn } from "@src/shared/cn";
import { EditableJsonTree } from "./EditableJsonTree";
import { GraphQLHighlight } from "./GraphQLHighlight";
import { JavaScriptEditor } from "./JavaScriptEditor";

interface MockFileInfo {
  fileName: string;
  fileSize: number;
}

type MockCreateType = "current" | "object" | "array" | "javascript";

interface MockCreateDropdownProps {
  onSelect: (type: MockCreateType) => void;
  hasCurrentData: boolean;
}

// Dropdown component for quickly creating mock data
function MockCreateDropdown({
  onSelect,
  hasCurrentData,
}: MockCreateDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: { type: MockCreateType; label: string; disabled?: boolean }[] =
    [
      {
        type: "current",
        label: "From Response",
        disabled: !hasCurrentData,
      },
      { type: "object", label: "JSON object" },
      { type: "array", label: "JSON array" },
      { type: "javascript", label: "JavaScript" },
    ];

  return (
    <div ref={dropdownRef} className="absolute top-2 right-2 z-10">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 border border-leo-border-strong hover:border-purple-500/30 hover:bg-leo-active/50 rounded transition-colors"
        title="New mock"
      >
        <span>Create</span>
        <svg
          className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-44 bg-leo-elevated border border-leo-border rounded-md shadow-lg overflow-hidden">
          {options.map((option) => (
            <button
              key={option.type}
              onClick={(e) => {
                e.stopPropagation();
                if (!option.disabled) {
                  onSelect(option.type);
                  setIsOpen(false);
                }
              }}
              disabled={option.disabled}
              className={cn(
                "w-full px-3 py-2 text-left text-xs transition-colors",
                option.disabled
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-300 hover:bg-leo-active hover:text-white"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Component for truncating long tokens (like Bearer tokens) with expand/collapse
function TruncatedToken({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);

  // Calculate if truncation is needed (roughly 6 lines worth of characters)
  // Assuming ~60 chars per line in the typical panel width
  const maxChars = 220;
  const needsTruncation = value.length > maxChars;

  if (!needsTruncation) {
    return <span>{value}</span>;
  }

  return (
    <span>
      {expanded ? value : `${value.slice(0, maxChars)}...`}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-2 text-purple-400 hover:text-purple-300 text-xs"
      >
        {expanded ? "Collapse" : "Expand"}
      </button>
    </span>
  );
}

// Component for rendering headers in a tabular format with expand/collapse
function HeadersTable({
  headers,
  label = "Headers",
}: {
  headers: Record<string, string>;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(headers);
  const defaultLimit = 4;
  const needsExpansion = entries.length > defaultLimit;
  const displayedEntries = expanded ? entries : entries.slice(0, defaultLimit);

  // Calculate the width needed for the longest header name
  const maxKeyLength = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.max(...entries.map(([key]) => key.length));
  }, [entries]);

  // Convert character count to approximate ch units (add some padding)
  const keyColumnWidth = `${maxKeyLength + 1}ch`;

  if (entries.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-gray-400">{label} (0)</h3>
        </div>
        <span className="text-gray-500 text-xs">No headers captured</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-400">
          {label} <span className="text-gray-500">({entries.length})</span>
        </h3>
        {needsExpansion && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      <div className="bg-leo-elevated rounded p-3">
        <table className="w-full text-xs">
          <tbody>
            {displayedEntries.map(([key, value]) => (
              <tr key={key}>
                <td
                  className="text-purple-400 font-medium align-top py-0.5 pr-2"
                  style={{ width: keyColumnWidth }}
                >
                  {key}:
                </td>
                <td className="text-gray-300 font-mono break-all align-top py-0.5">
                  {key.toLowerCase() === "authorization" ? (
                    <TruncatedToken value={value} />
                  ) : (
                    value
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  // Network headers from DevTools API (complete, not CORS-restricted)
  networkHeaders?: {
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
  };
  // Proxy props
  proxyInstances?: ProxyInstance[];
  proxyTargetTabId?: number | null;
  proxyError?: string | null;
  proxiedData?: unknown;
  isProxyEnabled?: boolean; // Whether this operation is in the proxy set
  onProxyRegister?: (targetTabId: number) => void;
  onProxyUnregister?: () => void;
  onProxyRequest?: (operation: GraphQLOperation) => void;
  onProxyOperationToggle?: (operationName: string, enabled: boolean) => void;
}

type LeftTab = "request" | "query" | "variables" | "policy";
type RightTab = "response" | "result" | "cache" | "mock" | "proxy";

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
  // Complete headers from DevTools network API (not CORS-restricted)
  networkResponseHeaders?: Record<string, string>;
}

function ResponseTab({
  response,
  displayResult,
  jsonCollapsed,
  networkResponseHeaders,
}: ResponseTabProps) {
  // Use networkResponseHeaders if available (complete), otherwise fall back to response.headers (CORS-limited)
  const headers = networkResponseHeaders || response?.headers || {};

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
      <HeadersTable headers={headers} />

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
    prevProps.onMockEnabledChange !== nextProps.onMockEnabledChange ||
    // Proxy props
    prevProps.proxyTargetTabId !== nextProps.proxyTargetTabId ||
    prevProps.proxyError !== nextProps.proxyError ||
    prevProps.isProxyEnabled !== nextProps.isProxyEnabled ||
    prevProps.onProxyRegister !== nextProps.onProxyRegister ||
    prevProps.onProxyUnregister !== nextProps.onProxyUnregister ||
    prevProps.onProxyRequest !== nextProps.onProxyRequest ||
    prevProps.onProxyOperationToggle !== nextProps.onProxyOperationToggle
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

  // Check proxy instances (shallow array comparison)
  if (prevProps.proxyInstances?.length !== nextProps.proxyInstances?.length) {
    return false;
  }

  // Check proxied data
  try {
    if (
      JSON.stringify(prevProps.proxiedData) !==
      JSON.stringify(nextProps.proxiedData)
    ) {
      return false;
    }
  } catch {
    if (prevProps.proxiedData !== nextProps.proxiedData) {
      return false;
    }
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
  mockEnabled = true,
  onMockDataChange,
  onMockEnabledChange,
  autoExpandJson = false,
  // Network headers from DevTools API
  networkHeaders,
  // Proxy props
  proxyInstances = [],
  proxyTargetTabId = null,
  proxyError = null,
  proxiedData,
  isProxyEnabled = false,
  onProxyRegister,
  onProxyUnregister,
  onProxyRequest,
  onProxyOperationToggle,
}: OperationDetailProps) {
  // When autoExpandJson is true, set collapsed to false to expand all nodes
  // collapsed=1 keeps root expanded but collapses nested objects/arrays
  const jsonCollapsed = autoExpandJson ? false : 1;
  const [leftTab, setLeftTab] = useState<LeftTab>("request");
  const [rightTab, setRightTab] = useState<RightTab>("response");
  const [mockError, setMockError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: "request", label: "Request" },
    { id: "query", label: "Query" },
    { id: "variables", label: "Variables" },
    { id: "policy", label: "Policy" },
  ];

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: "response", label: "Response" },
    { id: "result", label: "Data" },
    { id: "cache", label: "Cached Data" },
    { id: "mock", label: "Mock Data" },
    { id: "proxy", label: "Proxy Data" },
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
      onMockDataChange?.(operation.operationName, jsonString, {
        fileName: "JSON mock",
        fileSize: jsonString.length,
      });
      setMockError(null);
    },
    [operation.operationName, onMockDataChange]
  );

  // Handle edits to JS mock script from the editor
  const handleScriptEdit = useCallback(
    (updatedScript: string) => {
      // Store the updated script as a JS mock
      const mockData = JSON.stringify({
        __mockType: "js",
        __mockScript: updatedScript,
      });
      onMockDataChange?.(operation.operationName, mockData, {
        fileName: "JS mock",
        fileSize: updatedScript.length,
      });
      setMockError(null);
    },
    [operation.operationName, onMockDataChange]
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
                      <HeadersTable
                        headers={
                          networkHeaders?.requestHeaders ||
                          operation.request.headers
                        }
                      />

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
              {rightTabs.map((tab) => {
                // Determine if mock is active (has data and is enabled)
                const isMockActive = hasMockData && mockEnabled;
                // Determine if proxy is active (connected and enabled for this operation)
                const isProxyActive =
                  proxyTargetTabId !== null && isProxyEnabled;

                // Disable mock tab when proxy is active
                const isMockDisabled = tab.id === "mock" && isProxyActive;
                // Disable proxy tab when mock is active
                const isProxyDisabled = tab.id === "proxy" && isMockActive;
                const isDisabled = isMockDisabled || isProxyDisabled;

                return (
                  <button
                    key={tab.id}
                    onClick={() => !isDisabled && setRightTab(tab.id)}
                    disabled={isDisabled}
                    className={cn(
                      "px-4 py-2 text-xs font-medium transition-colors",
                      rightTab === tab.id
                        ? "text-purple-400 border-b-2 border-purple-500"
                        : isDisabled
                        ? "text-gray-600 cursor-not-allowed"
                        : "text-gray-400 hover:text-gray-200"
                    )}
                    title={
                      isMockDisabled
                        ? "Disable proxy to use mock data"
                        : isProxyDisabled
                        ? "Disable mock to use proxy"
                        : undefined
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right Content */}
            <div className="flex-1 overflow-auto p-3 json-panel">
              {rightTab === "response" && (
                <ResponseTab
                  response={operation.response}
                  displayResult={displayResult}
                  jsonCollapsed={jsonCollapsed}
                  networkResponseHeaders={networkHeaders?.responseHeaders}
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
                    <div className="relative">
                      {/* Quick create dropdown */}
                      <MockCreateDropdown
                        onSelect={(type) => {
                          if (type === "current") {
                            // Use current operation result as mock data
                            if (operation.result) {
                              const jsonString = JSON.stringify(
                                operation.result,
                                null,
                                2
                              );
                              onMockDataChange?.(
                                operation.operationName,
                                jsonString,
                                {
                                  fileName: "Current data",
                                  fileSize: jsonString.length,
                                }
                              );
                              onMockEnabledChange?.(
                                operation.operationName,
                                true
                              );
                            }
                          } else if (type === "object") {
                            const jsonString = JSON.stringify(
                              { data: {} },
                              null,
                              2
                            );
                            onMockDataChange?.(
                              operation.operationName,
                              jsonString,
                              {
                                fileName: "New object",
                                fileSize: jsonString.length,
                              }
                            );
                            onMockEnabledChange?.(
                              operation.operationName,
                              true
                            );
                          } else if (type === "array") {
                            const jsonString = JSON.stringify(
                              { data: [] },
                              null,
                              2
                            );
                            onMockDataChange?.(
                              operation.operationName,
                              jsonString,
                              {
                                fileName: "New array",
                                fileSize: jsonString.length,
                              }
                            );
                            onMockEnabledChange?.(
                              operation.operationName,
                              true
                            );
                          } else if (type === "javascript") {
                            const scriptTemplate = `// Mock function for ${operation.operationName}
// Available variables: variables, operationName, request
// Return the mock data object

return {
  data: {
    // Your mock data here
  }
};`;
                            const mockData = JSON.stringify({
                              __mockType: "js",
                              __mockScript: scriptTemplate,
                            });
                            onMockDataChange?.(
                              operation.operationName,
                              mockData,
                              {
                                fileName: "New script",
                                fileSize: scriptTemplate.length,
                              }
                            );
                            onMockEnabledChange?.(
                              operation.operationName,
                              true
                            );
                          }
                        }}
                        hasCurrentData={!!operation.result}
                      />
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
                            ? "Drop mock data file"
                            : "Select mock data file"}
                        </span>
                        <span className="text-xs text-gray-600 mt-1">
                          .json or .js files
                        </span>
                      </div>
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
                              {operation.operationName} Mock (JSON)
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-0.5",
                                mockEnabled
                                  ? "text-purple-300"
                                  : "text-gray-500"
                              )}
                            >
                              Click values to edit
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
                              {operation.operationName} Mock (JS)
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-0.5",
                                mockEnabled
                                  ? "text-purple-300"
                                  : "text-gray-500"
                              )}
                            >
                              Script executes on each request
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

              {rightTab === "proxy" && (
                <div className="flex flex-col h-full">
                  {/* Proxy target selector - show when not connected */}
                  {!proxyTargetTabId && (
                    <div className="flex flex-col flex-1 pb-3 space-y-4">
                      {/* No targets available */}
                      {proxyInstances.length === 0 ? (
                        <div className="relative p-3 border rounded border-gray-500/30">
                          <div className="flex items-center gap-3 pr-20">
                            <svg
                              className="w-5 h-5 shrink-0 text-gray-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-gray-500">
                                No proxy target detected
                              </p>
                              <p className="text-xs mt-0.5 truncate text-gray-600">
                                Open a new tab/window with this extension
                                enabled
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Available proxy targets - show as selectable cards */
                        proxyInstances.map((instance) => (
                          <div
                            key={instance.tabId}
                            className="relative p-3 border rounded bg-gray-500/10 border-gray-500/30"
                          >
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                              {/* Disabled eye icon (enable/disable toggle) */}
                              <button
                                disabled
                                className="p-1 rounded transition-colors cursor-not-allowed opacity-50"
                                title="Connect to enable"
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
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              </button>
                              {/* Disabled refresh icon */}
                              <button
                                disabled
                                className="p-1 rounded transition-colors cursor-not-allowed opacity-50"
                                title="Connect to enable"
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
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              </button>
                              {/* Power icon (connect) - only this button is clickable */}
                              <button
                                onClick={() => {
                                  // Connect to proxy AND enable auto-proxy for this operation
                                  onProxyRegister?.(instance.tabId);
                                  onProxyOperationToggle?.(
                                    operation.operationName,
                                    true
                                  );
                                }}
                                className="p-1 rounded transition-colors hover:bg-orange-500/20 text-gray-500 hover:text-orange-400"
                                title="Connect to proxy"
                              >
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
                                    d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9"
                                  />
                                </svg>
                              </button>
                            </div>
                            <div className="flex items-center gap-3 pr-20">
                              <svg
                                className="w-5 h-5 shrink-0 text-gray-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate text-gray-500">
                                  {stripTrailingSlash(instance.url)}
                                </p>
                                <p className="text-xs mt-0.5 truncate text-gray-500">
                                  Proxy {operation.operationName} requests via
                                  tab {instance.tabId}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}

                      {proxyError && (
                        <p className="text-xs text-red-400">{proxyError}</p>
                      )}
                    </div>
                  )}

                  {/* Connected to proxy - compact card like mock data card */}
                  {proxyTargetTabId && (
                    <div className="flex flex-col flex-1 pb-3 space-y-4">
                      {/* Proxy card header with target info and actions */}
                      <div
                        className={cn(
                          "relative p-3 border rounded",
                          isProxyEnabled
                            ? "bg-orange-500/10 border-orange-500/30"
                            : "bg-gray-500/10 border-gray-500/30"
                        )}
                      >
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {/* Enable/Disable auto-proxy toggle */}
                          <button
                            onClick={() =>
                              onProxyOperationToggle?.(
                                operation.operationName,
                                !isProxyEnabled
                              )
                            }
                            className={cn(
                              "p-1 rounded transition-colors",
                              isProxyEnabled
                                ? "hover:bg-orange-500/20 text-orange-400 hover:text-orange-300"
                                : "hover:bg-gray-500/20 text-gray-500 hover:text-gray-300"
                            )}
                            title={
                              isProxyEnabled
                                ? "Disable auto-proxy"
                                : "Enable auto-proxy"
                            }
                          >
                            {isProxyEnabled ? (
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
                          {/* Manual proxy request (refresh) - disabled when auto-proxy is off */}
                          <button
                            onClick={() =>
                              isProxyEnabled && onProxyRequest?.(operation)
                            }
                            disabled={!isProxyEnabled}
                            className={cn(
                              "p-1 rounded transition-colors",
                              isProxyEnabled
                                ? "hover:bg-orange-500/20 cursor-pointer"
                                : "cursor-not-allowed opacity-50"
                            )}
                            title={
                              isProxyEnabled
                                ? "Execute proxy request"
                                : "Enable auto-proxy to execute requests"
                            }
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                isProxyEnabled
                                  ? "text-orange-400 hover:text-orange-300"
                                  : "text-gray-500"
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
                          {/* Power button - disconnect proxy */}
                          <button
                            onClick={onProxyUnregister}
                            className={cn(
                              "p-1 rounded transition-colors",
                              isProxyEnabled
                                ? "hover:bg-orange-500/20"
                                : "hover:bg-gray-500/20"
                            )}
                            title="Disconnect proxy"
                          >
                            <svg
                              className={cn(
                                "w-4 h-4",
                                isProxyEnabled
                                  ? "text-orange-400 hover:text-orange-300"
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
                                d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9"
                              />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-3 pr-20">
                          {/* Proxy icon */}
                          <svg
                            className={cn(
                              "w-5 h-5 shrink-0",
                              isProxyEnabled
                                ? "text-orange-400"
                                : "text-gray-500"
                            )}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-sm font-medium truncate",
                                isProxyEnabled
                                  ? "text-orange-400"
                                  : "text-gray-500"
                              )}
                            >
                              {stripTrailingSlash(
                                proxyInstances.find(
                                  (i) => i.tabId === proxyTargetTabId
                                )?.url || "Connected"
                              )}
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-0.5 truncate",
                                isProxyEnabled
                                  ? "text-orange-300"
                                  : "text-gray-500"
                              )}
                            >
                              Proxy {operation.operationName} data via tab{" "}
                              {proxyTargetTabId}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Proxied data result - only show when enabled */}
                      {isProxyEnabled &&
                        proxiedData !== undefined &&
                        proxiedData !== null && (
                          <EditableJsonTree
                            data={proxiedData}
                            readOnly
                            collapsed={jsonCollapsed}
                            showCopyButton
                          />
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

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Memoized with deep equality check to prevent re-renders from parent polling updates
export const OperationDetail = React.memo(OperationDetailInner, arePropsEqual);
