import React, { useState, useRef, useMemo, useCallback } from "react";
import { GraphQLOperation } from "@src/shared/types";
import { CopyButton } from "./JsonTree";
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
  onMockDataChange?: (
    operationName: string,
    mockData: string,
    fileInfo?: MockFileInfo
  ) => void;
}

type LeftTab = "request" | "query" | "variables";
type RightTab = "response" | "result" | "cache" | "mock";

export function OperationDetail({
  operation,
  mockData = "",
  mockFileInfo,
  onMockDataChange,
}: OperationDetailProps) {
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
  ];

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: "response", label: "Response" },
    { id: "result", label: "Result Data" },
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
                      <div className="bg-[#2d2d4a] rounded p-3">
                        <HeadersTable headers={operation.request.headers} />
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
                      {operation.request.body ? (
                        (() => {
                          try {
                            const parsed = JSON.parse(operation.request.body);
                            return <EditableJsonTree data={parsed} readOnly />;
                          } catch {
                            return (
                              <div className="bg-[#2d2d4a] rounded p-3">
                                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
                                  {operation.request.body}
                                </pre>
                              </div>
                            );
                          }
                        })()
                      ) : (
                        <div className="bg-[#2d2d4a] rounded p-3">
                          <span className="text-gray-500 text-xs">No body</span>
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
              <>
                <div className="json-tree w-full">
                  {operation.variables &&
                  Object.keys(operation.variables).length > 0 ? (
                    <EditableJsonTree data={operation.variables} readOnly />
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
            {rightTab === "response" && (
              <div className="space-y-4 pr-4">
                {operation.response ? (
                  <>
                    {/* Status */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs rounded font-medium ${
                            operation.response.status >= 200 &&
                            operation.response.status < 300
                              ? "bg-green-500/20 text-green-400"
                              : operation.response.status >= 400
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {operation.response.status}
                        </span>
                        <span className="text-xs text-gray-300 font-mono">
                          {operation.response.statusText}
                        </span>
                      </div>
                    </div>

                    {/* Headers */}
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 mb-2">
                        Headers
                      </h3>
                      <div className="bg-[#2d2d4a] rounded p-3">
                        <HeadersTable headers={operation.response.headers} />
                      </div>
                    </div>

                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-medium text-gray-400">
                          Body
                        </h3>
                        {displayResult && <CopyButton data={displayResult} />}
                      </div>
                      {displayResult ? (
                        <EditableJsonTree data={displayResult} readOnly />
                      ) : (
                        <div className="bg-[#2d2d4a] rounded p-3">
                          <span className="text-gray-500 text-xs">No body</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500">
                    <p>No response data available.</p>
                    <p className="mt-2 text-xs">
                      Response data is captured when the operation receives a
                      network response. It may not be available for cached
                      queries or if the request hasn't completed yet.
                    </p>
                  </div>
                )}
              </div>
            )}

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
                    <EditableJsonTree data={displayResult} readOnly />
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
                    <EditableJsonTree data={operationCache} readOnly />
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
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      isDragOver
                        ? "border-purple-500 bg-purple-500/20"
                        : "border-[#3d3d5c] hover:border-purple-500 hover:bg-[#2d2d4a]/50"
                    }`}
                  >
                    <svg
                      className={`w-6 h-6 mb-2 ${
                        isDragOver ? "text-purple-400" : "text-gray-500"
                      }`}
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
                      className={`text-sm ${
                        isDragOver ? "text-purple-300" : "text-gray-400"
                      }`}
                    >
                      {isDragOver
                        ? "Drop mock result file here"
                        : "Select a mock result file"}
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
                  <div className="flex flex-col flex-1 pb-3">
                    {/* Header with file info and actions */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-green-400"
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
                        <span className="text-sm text-green-400 font-medium">
                          {displayFileName || "Mock Data"}
                        </span>
                        {displayFileSize !== null && (
                          <span className="text-xs text-gray-500">
                            ({formatFileSize(displayFileSize)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={reloadFile}
                          className="p-1.5 hover:bg-[#2d2d4a] rounded transition-colors"
                          title="Load different file"
                        >
                          <svg
                            className="w-4 h-4 text-gray-400 hover:text-gray-200"
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
                          className="p-1.5 hover:bg-[#2d2d4a] rounded transition-colors"
                          title="Remove mock"
                        >
                          <svg
                            className="w-4 h-4 text-gray-400 hover:text-red-400"
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
                    </div>

                    {/* Editable JSON tree */}
                    <div className="flex-1 overflow-auto">
                      <EditableJsonTree
                        data={parsedMockData}
                        onEdit={handleJsonEdit}
                      />
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      Click on values to edit. Changes apply immediately.
                    </p>
                  </div>
                )}

                {/* JS Mock - show script info */}
                {hasMockData && mockType === "js" && (
                  <div className="flex flex-col pb-3">
                    <div className="relative p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          onClick={reloadFile}
                          className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                          title="Load different file"
                        >
                          <svg
                            className="w-4 h-4 text-purple-400 hover:text-purple-300"
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
                          className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                          title="Remove mock"
                        >
                          <svg
                            className="w-4 h-4 text-purple-400 hover:text-purple-300"
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
                      <div className="flex items-center gap-3 pr-14">
                        <svg
                          className="w-5 h-5 text-purple-400 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                          />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm text-purple-400 font-medium">
                            {displayFileName}
                          </p>
                          <p className="text-xs text-purple-300 mt-0.5">
                            {displayFileSize !== null &&
                              formatFileSize(displayFileSize)}{" "}
                            — Script executes on each request
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Editable script */}
                    {parsedMockData?.__mockScript && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-400 mb-2">
                          Script (editable):
                        </p>
                        <JavaScriptEditor
                          code={parsedMockData.__mockScript}
                          onChange={handleScriptEdit}
                        />
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-3">
                      Access <code className="text-purple-400">variables</code>,{" "}
                      <code className="text-purple-400">operationName</code>,{" "}
                      <code className="text-purple-400">request</code> to create
                      dynamic mock data.
                    </p>
                  </div>
                )}
              </div>
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
