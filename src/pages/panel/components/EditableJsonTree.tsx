import React, { useState, useMemo } from "react";
import ReactJson, { InteractionProps } from "@microlink/react-json-view";

interface EditableJsonTreeProps {
  data: unknown;
  onEdit?: (updatedData: unknown) => void;
  readOnly?: boolean;
  collapsed?: number | boolean;
  /** When true, hides the internal large file warning (caller should render it externally) */
  hideWarning?: boolean;
  /** External control for force-expanded state (when using external warning) */
  forceExpanded?: boolean;
}

// Custom theme matching Leonardo.Ai design system
// Values align with CSS variables in theme.css:
// --leo-bg-elevated, --leo-border-strong, --leo-text-*, --leo-json-*, --leo-purple-*, --leo-indigo-*
const theme = {
  base00: "transparent",  // background
  base01: "#101622",      // --leo-bg-elevated
  base02: "#28283a",      // --leo-border-strong
  base03: "#6b7280",      // --leo-text-muted
  base04: "#6b7280",      // --leo-text-muted
  base05: "#9ca3af",      // --leo-text-secondary
  base06: "#d1d5db",      // light foreground
  base07: "#818cf8",      // --leo-json-key / --leo-indigo-400
  base08: "#c084fc",      // --leo-json-null / --leo-purple-400
  base09: "#6ee7b7",      // --leo-json-string / --leo-success-muted
  base0A: "#d4a574",      // --leo-json-number
  base0B: "#d4a574",      // --leo-json-number
  base0C: "#818cf8",      // --leo-indigo-400
  base0D: "#a78bfa",      // functions
  base0E: "#c084fc",      // --leo-json-boolean / --leo-purple-400
  base0F: "#c084fc",      // --leo-purple-400
};

// Threshold for "large" JSON data (in characters when stringified)
export const LARGE_JSON_THRESHOLD = 50000; // ~50KB

// Estimate JSON size without full stringification for performance
export function estimateJsonSize(data: unknown): number {
  if (data === null || data === undefined) return 4;
  if (typeof data === "string") return data.length + 2;
  if (typeof data === "number" || typeof data === "boolean") return String(data).length;
  if (Array.isArray(data)) {
    // For arrays, sample first few items and estimate
    if (data.length === 0) return 2;
    const sampleSize = Math.min(3, data.length);
    let sampleTotal = 0;
    for (let i = 0; i < sampleSize; i++) {
      sampleTotal += estimateJsonSize(data[i]);
    }
    return (sampleTotal / sampleSize) * data.length + data.length * 2;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return 2;
    const sampleSize = Math.min(5, keys.length);
    let sampleTotal = 0;
    for (let i = 0; i < sampleSize; i++) {
      const key = keys[i];
      sampleTotal += key.length + 3 + estimateJsonSize((data as Record<string, unknown>)[key]);
    }
    return (sampleTotal / sampleSize) * keys.length;
  }
  return 10;
}

// Large file warning component for external rendering
interface LargeJsonWarningProps {
  onExpand: () => void;
}

export function LargeJsonWarning({ onExpand }: LargeJsonWarningProps) {
  return (
    <div className="mb-2 p-2 bg-leo-elevated border border-leo-border rounded text-xs flex items-center justify-between font-sans">
      <span className="text-gray-400">Large JSON file — collapsed for performance</span>
      <button
        onClick={onExpand}
        className="px-2 py-0.5 bg-leo-border-strong hover:bg-gray-600 rounded transition-colors text-gray-200"
      >
        Expand All
      </button>
    </div>
  );
}

// Hook to check if data is large (for external warning rendering)
export function useIsLargeJson(data: unknown): boolean {
  return useMemo(() => estimateJsonSize(data) > LARGE_JSON_THRESHOLD, [data]);
}

export function EditableJsonTree({
  data,
  onEdit,
  readOnly = false,
  collapsed = 2,
  hideWarning = false,
  forceExpanded: externalForceExpanded,
}: EditableJsonTreeProps) {
  const [internalForceExpanded, setInternalForceExpanded] = useState(false);

  // Use external state if provided, otherwise use internal state
  const forceExpanded = externalForceExpanded ?? internalForceExpanded;

  // Estimate if this is a large JSON object
  const isLargeJson = useMemo(() => {
    return estimateJsonSize(data) > LARGE_JSON_THRESHOLD;
  }, [data]);

  const handleChange = (interaction: InteractionProps) => {
    onEdit?.(interaction.updated_src);
  };

  // For large JSON, collapse everything by default unless user expands
  const effectiveCollapsed = isLargeJson && !forceExpanded ? true : collapsed;

  // Expose expand function for internal use
  const handleExpand = () => setInternalForceExpanded(true);

  return (
    <div className="w-full editable-json-tree">
      {isLargeJson && !forceExpanded && !hideWarning && (
        <LargeJsonWarning onExpand={handleExpand} />
      )}
      <ReactJson
        src={data as object}
        theme={theme}
        name={false}
        collapsed={effectiveCollapsed}
        collapseStringsAfterLength={100}
        displayDataTypes={false}
        displayObjectSize={isLargeJson}
        enableClipboard={false}
        indentWidth={2}
        onEdit={readOnly ? false : handleChange}
        onAdd={readOnly ? false : handleChange}
        onDelete={readOnly ? false : handleChange}
        style={{
          backgroundColor: "transparent",
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: "0.75rem", // text-xs = 12px
          lineHeight: "1rem",
        }}
      />
    </div>
  );
}
