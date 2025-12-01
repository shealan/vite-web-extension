import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { JsonEditor, UpdateFunction } from "json-edit-react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import { tags } from "@lezer/highlight";

// TextEditor props as expected by json-edit-react
interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// Highlight style for inline JSON editing - matches CodeMirror/JavaScriptEditor
const inlineHighlightStyle = HighlightStyle.define([
  { tag: tags.string, color: "#7ec699" },
  { tag: tags.number, color: "#d4a76a" },
  { tag: tags.bool, color: "#c9a0dc" },
  { tag: tags.null, color: "#c9a0dc" },
  { tag: tags.propertyName, color: "#81a2be" },
  { tag: tags.punctuation, color: "#969896" },
]);

// Inline editor theme (compact, no gutters)
const inlineEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1a1a2e",
      color: "#c5c8c6",
      fontSize: "0.75rem",
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    },
    ".cm-content": {
      caretColor: "#e5e7eb",
      padding: "4px 8px",
      minHeight: "auto",
    },
    ".cm-scroller": {
      minHeight: "auto",
      overflow: "auto",
    },
    ".cm-cursor": {
      borderLeftColor: "#e5e7eb",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(125, 211, 252, 0.3)",
    },
    "&.cm-focused": {
      outline: "1px solid #81a2be",
    },
  },
  { dark: true }
);

// CodeMirror-based inline text editor for json-edit-react - memoized to prevent re-creation
const InlineTextEditor = React.memo(function InlineTextEditor({
  value,
  onChange,
  onKeyDown,
}: TextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Use refs to avoid stale closures and prevent re-creating the editor
  const onChangeRef = useRef(onChange);
  const onKeyDownRef = useRef(onKeyDown);

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onKeyDownRef.current = onKeyDown;
  });

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    // Handle keyboard events (Enter to confirm, Escape to cancel)
    const keyHandler = EditorView.domEventHandlers({
      keydown: (event) => {
        // Create a synthetic React keyboard event
        const syntheticEvent = {
          key: event.key,
          preventDefault: () => event.preventDefault(),
          stopPropagation: () => event.stopPropagation(),
        } as React.KeyboardEvent;

        // Let json-edit-react handle Enter and Escape
        if (event.key === "Enter" || event.key === "Escape") {
          onKeyDownRef.current(syntheticEvent);
          return true;
        }
        return false;
      },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        json(),
        syntaxHighlighting(inlineHighlightStyle),
        inlineEditorTheme,
        keymap.of(defaultKeymap),
        updateListener,
        keyHandler,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Focus the editor
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update content if value prop changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Memoize keydown handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent event bubbling for all keys except Enter/Escape (handled by CodeMirror)
    if (e.key !== "Enter" && e.key !== "Escape") {
      e.stopPropagation();
    }
  }, []);

  return (
    <div
      ref={editorRef}
      className="inline-json-editor rounded overflow-hidden min-w-[100px]"
      onKeyDown={handleKeyDown}
    />
  );
});

interface EditableJsonTreeProps {
  data: unknown;
  onEdit?: (updatedData: unknown) => void;
  readOnly?: boolean;
  collapsed?: number | boolean;
  /** When true, hides the internal large file warning (caller should render it externally) */
  hideWarning?: boolean;
  /** External control for force-expanded state (when using external warning) */
  forceExpanded?: boolean;
  /** When true, shows a copy button in the top-right corner */
  showCopyButton?: boolean;
  /** When true, removes the default top padding (use when there's no content above) */
  noPadding?: boolean;
}

// CopyButton component for copying JSON data - memoized to prevent re-renders
const CopyButton = React.memo(function CopyButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  // Memoize stringified data to avoid re-stringifying on every render
  const textRef = useRef<string>("");
  const dataRef = useRef<unknown>(data);

  // Only re-stringify if data actually changed
  if (dataRef.current !== data) {
    dataRef.current = data;
    try {
      textRef.current = JSON.stringify(data, null, 2);
    } catch {
      textRef.current = String(data);
    }
  }

  const handleCopy = useCallback(async () => {
    const text = textRef.current;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // Fall through to fallback
    }

    // Fallback: use a temporary textarea
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-[#2d2d4a] rounded transition-colors"
      title="Copy JSON"
    >
      {copied ? (
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
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
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
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
});

// Custom icons matching Leonardo.Ai design system (small, gray, subtle)
const iconStyle = { width: 14, height: 14 };
const iconColor = "#6b7280"; // gray-500

const customIcons = {
  ok: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  cancel: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  add: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  delete: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  copy: (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  chevron: (
    <svg
      style={{ width: 12, height: 12 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6b7280"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

// Custom theme matching Leonardo.Ai design system
// Colors aligned with CodeMirror/JavaScriptEditor syntax highlighting
const leoTheme = {
  // Container styles - use leo-elevated background
  container: {
    backgroundColor: "#101622", // --leo-bg-elevated
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    borderRadius: "6px",
  },
  // Property styles (keys) - matches CodeMirror propertyName
  property: "#81a2be",
  // Value styles by type - matches CodeMirror highlighting
  string: "#7ec699", // matches CodeMirror string
  number: "#d4a76a", // matches CodeMirror number
  boolean: "#c9a0dc", // matches CodeMirror bool
  null: "#c9a0dc", // matches CodeMirror null
  undefined: "#c9a0dc",
  // Bracket colors - matches CodeMirror punctuation
  bracket: "#969896",
  // Collection count color (e.g., "[5 items]") - muted text
  itemCount: "#6b7280",
  // Input styles (for inline editing of primitive values)
  input: {
    backgroundColor: "#1a1a2e",
    color: "#e5e7eb",
    border: "1px solid #3d3d5c",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "0.75rem",
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    outline: "none",
  },
  inputHighlight: {
    backgroundColor: "#1a1a2e",
    border: "1px solid #81a2be",
  },
  // Icon colors - muted text gray
  iconCollection: "#6b7280",
  iconEdit: "#6b7280",
  iconDelete: "#6b7280",
  iconAdd: "#6b7280",
  iconCopy: "#6b7280",
  iconOk: "#6b7280",
  iconCancel: "#6b7280",
};

// Threshold for "large" JSON data (in characters when stringified)
export const LARGE_JSON_THRESHOLD = 50000; // ~50KB

// Estimate JSON size without full stringification for performance
export function estimateJsonSize(data: unknown): number {
  if (data === null || data === undefined) return 4;
  if (typeof data === "string") return data.length + 2;
  if (typeof data === "number" || typeof data === "boolean")
    return String(data).length;
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
      sampleTotal +=
        key.length +
        3 +
        estimateJsonSize((data as Record<string, unknown>)[key]);
    }
    return (sampleTotal / sampleSize) * keys.length;
  }
  return 10;
}

// Large file warning component for external rendering - memoized
interface LargeJsonWarningProps {
  onExpand: () => void;
}

export const LargeJsonWarning = React.memo(function LargeJsonWarning({
  onExpand,
}: LargeJsonWarningProps) {
  return (
    <div className="mb-2 p-2 pl-3 bg-leo-elevated border border-leo-border rounded text-xs flex items-center justify-between font-sans">
      <span className="text-gray-400">
        Large JSON file — collapsed for performance
      </span>
      <button
        onClick={onExpand}
        className="px-2 py-0.5 bg-leo-border-strong hover:bg-[#2d2d4a] rounded transition-colors text-gray-400 hover:text-gray-200"
      >
        Expand All
      </button>
    </div>
  );
});

// Hook to check if data is large (for external warning rendering)
export function useIsLargeJson(data: unknown): boolean {
  return useMemo(() => estimateJsonSize(data) > LARGE_JSON_THRESHOLD, [data]);
}

function EditableJsonTreeInner({
  data,
  onEdit,
  readOnly = false,
  collapsed = 2,
  hideWarning = false,
  forceExpanded: externalForceExpanded,
  showCopyButton = false,
  noPadding = false,
}: EditableJsonTreeProps) {
  const [internalForceExpanded, setInternalForceExpanded] = useState(false);

  // Use external state if provided, otherwise use internal state
  const forceExpanded = externalForceExpanded ?? internalForceExpanded;

  // Estimate if this is a large JSON object
  const isLargeJson = useMemo(() => {
    return estimateJsonSize(data) > LARGE_JSON_THRESHOLD;
  }, [data]);

  // Handle data updates from the editor - memoized to prevent re-renders
  const handleUpdate: UpdateFunction = useCallback(
    ({ newData }) => {
      onEdit?.(newData);
    },
    [onEdit]
  );

  // For large JSON, collapse everything by default unless user expands
  // json-edit-react uses collapse prop as depth level (number) or boolean
  const effectiveCollapse = useMemo(() => {
    if (isLargeJson && !forceExpanded) return 0; // Collapse all
    if (collapsed === true) return 0; // Fully collapsed
    if (collapsed === false) return Infinity; // Fully expanded
    return collapsed; // Use numeric depth
  }, [isLargeJson, forceExpanded, collapsed]);

  // Expose expand function for internal use - memoized to prevent re-renders
  const handleExpand = useCallback(() => setInternalForceExpanded(true), []);

  return (
    <div className="w-full editable-json-tree">
      {isLargeJson && !forceExpanded && !hideWarning && (
        <LargeJsonWarning onExpand={handleExpand} />
      )}
      <div className="relative">
        {showCopyButton && (
          <div className="absolute top-2 right-2 z-10 json-copy-button">
            <CopyButton data={data} />
          </div>
        )}
        <JsonEditor
          data={data as object}
          onUpdate={readOnly ? undefined : handleUpdate}
          theme={leoTheme}
          icons={customIcons}
          collapse={effectiveCollapse}
          indent={2}
          showCollectionCount="when-closed"
          collapseAnimationTime={0}
          rootName=""
          enableClipboard={false}
          restrictEdit={readOnly}
          restrictDelete={readOnly}
          restrictAdd={readOnly}
          restrictTypeSelection={readOnly}
          minWidth="100%"
          rootFontSize="0.75rem"
          TextEditor={readOnly ? undefined : InlineTextEditor}
        />
      </div>
    </div>
  );
}

// Deep equality check for data prop to prevent re-renders from polling
function arePropsEqual(
  prevProps: EditableJsonTreeProps,
  nextProps: EditableJsonTreeProps
): boolean {
  // Check simple props first (fast)
  if (
    prevProps.readOnly !== nextProps.readOnly ||
    prevProps.collapsed !== nextProps.collapsed ||
    prevProps.hideWarning !== nextProps.hideWarning ||
    prevProps.forceExpanded !== nextProps.forceExpanded ||
    prevProps.showCopyButton !== nextProps.showCopyButton ||
    prevProps.noPadding !== nextProps.noPadding ||
    prevProps.onEdit !== nextProps.onEdit
  ) {
    return false;
  }

  // Deep compare data - use JSON.stringify for stable comparison
  // This is safe because we're comparing JSON-serializable data
  try {
    return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
  } catch {
    // If stringify fails, fall back to reference equality
    return prevProps.data === nextProps.data;
  }
}

// Memoized with deep equality check to prevent re-renders from parent polling updates
export const EditableJsonTree = React.memo(
  EditableJsonTreeInner,
  arePropsEqual
);
