import React, { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { linter, lintGutter, Diagnostic } from "@codemirror/lint";
import { autocompletion, CompletionContext, Completion } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import * as acorn from "acorn";
import { CopyButton } from "@src/shared/CopyButton";
import { SaveButton } from "@src/shared/SaveButton";

interface JavaScriptEditorProps {
  code: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
}

// Format icon SVG - exported for external use
export const FormatIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="21" y1="10" x2="7" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="21" y1="18" x2="7" y2="18" />
  </svg>
);

// Check/validate icon SVG - exported for external use
export const ValidateIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 12l2 2 4-4" />
    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.5 0 2.91.37 4.15 1.02" />
  </svg>
);

// Leonardo.Ai theme colors for syntax highlighting
const leoHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#6b7280", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#6b7280", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#6b7280", fontStyle: "italic" },
  { tag: tags.string, color: "#7ec699" },
  { tag: tags.keyword, color: "#b294bb" },
  { tag: tags.controlKeyword, color: "#b294bb" },
  { tag: tags.operatorKeyword, color: "#b294bb" },
  { tag: tags.definitionKeyword, color: "#b294bb" },
  { tag: tags.bool, color: "#c9a0dc" },
  { tag: tags.null, color: "#c9a0dc" },
  { tag: tags.number, color: "#d4a76a" },
  { tag: tags.propertyName, color: "#81a2be" },
  { tag: tags.function(tags.variableName), color: "#8abeb7" },
  { tag: tags.variableName, color: "#c5c8c6" },
  { tag: tags.operator, color: "#8abeb7" },
  { tag: tags.punctuation, color: "#969896" },
  { tag: tags.bracket, color: "#969896" },
  { tag: tags.paren, color: "#969896" },
  { tag: tags.brace, color: "#969896" },
]);

// Dark theme for the editor
const leoEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "#101622",
    color: "#c5c8c6",
    fontSize: "12px",
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  },
  ".cm-content": {
    caretColor: "#e5e7eb",
    padding: "8px 0",
    minHeight: "100px",
  },
  ".cm-scroller": {
    minHeight: "100px",
  },
  ".cm-cursor": {
    borderLeftColor: "#e5e7eb",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(125, 211, 252, 0.3)",
  },
  ".cm-gutters": {
    backgroundColor: "#101622",
    color: "#4a5568",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.5em",
    padding: "0 4px 0 8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  // Lint diagnostics (error squiggles)
  ".cm-lintRange-error": {
    backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="M0 3 L1.5 0 L3 3 L4.5 0 L6 3" stroke="%23ef4444" fill="none" stroke-width="0.7"/></svg>')`,
    backgroundPosition: "left bottom",
    backgroundRepeat: "repeat-x",
  },
  ".cm-lintRange-warning": {
    backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="M0 3 L1.5 0 L3 3 L4.5 0 L6 3" stroke="%23f97316" fill="none" stroke-width="0.7"/></svg>')`,
    backgroundPosition: "left bottom",
    backgroundRepeat: "repeat-x",
  },
  // Tooltip styling
  ".cm-tooltip": {
    backgroundColor: "#1e1e28",
    border: "1px solid #28283a",
    borderRadius: "4px",
  },
  ".cm-tooltip-lint": {
    backgroundColor: "#1e1e28",
    padding: "4px 8px",
  },
  ".cm-diagnostic-error": {
    color: "#ef4444",
    borderLeft: "2px solid #ef4444",
    paddingLeft: "8px",
    marginLeft: "-2px",
  },
  ".cm-diagnostic-warning": {
    color: "#f97316",
    borderLeft: "2px solid #f97316",
    paddingLeft: "8px",
    marginLeft: "-2px",
  },
  // Lint gutter styling
  ".cm-lint-marker-error": {
    content: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%23ef4444"><circle cx="8" cy="8" r="6"/></svg>')`,
  },
  ".cm-lint-marker-warning": {
    content: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%23f97316"><path d="M8 2 L14 13 L2 13 Z"/></svg>')`,
  },
  // Autocomplete styling
  ".cm-tooltip-autocomplete": {
    backgroundColor: "#1e1e28",
    border: "1px solid #28283a",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    fontSize: "12px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 8px",
    color: "#c5c8c6",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "rgba(125, 211, 252, 0.2)",
    color: "#e5e7eb",
  },
  ".cm-completionLabel": {
    color: "#8abeb7",
  },
  ".cm-completionDetail": {
    color: "#6b7280",
    fontStyle: "italic",
    marginLeft: "8px",
  },
  ".cm-completionInfo": {
    padding: "8px",
    backgroundColor: "#1e1e28",
    border: "1px solid #28283a",
    borderRadius: "4px",
    color: "#9ca3af",
    fontSize: "11px",
  },
}, { dark: true });

// JavaScript linter using acorn
function createJsLinter() {
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const code = view.state.doc.toString();

    if (!code.trim()) return diagnostics;

    try {
      // Try parsing as an expression first
      acorn.parseExpressionAt(code, 0, {
        ecmaVersion: "latest",
        allowAwaitOutsideFunction: true,
      });
    } catch {
      // If expression parsing fails, try as a program
      try {
        acorn.parse(code, {
          ecmaVersion: "latest",
          allowAwaitOutsideFunction: true,
          allowReturnOutsideFunction: true,
        });
      } catch (e) {
        const error = e as Error & { pos?: number; loc?: { line: number; column: number } };
        const pos = error.pos ?? 0;
        const message = error.message.replace(/\s*\(\d+:\d+\)$/, "");

        // Find the end of the current token/word for better squiggle visibility
        let endPos = pos;
        while (endPos < code.length && /\S/.test(code[endPos])) {
          endPos++;
        }
        // Ensure we underline at least a few characters
        if (endPos - pos < 3) {
          endPos = Math.min(pos + 10, code.length);
        }

        diagnostics.push({
          from: pos,
          to: endPos,
          severity: "error",
          message,
        });
      }
    }

    return diagnostics;
  }, { delay: 300 });
}

// Mock script variable completions
const mockScriptCompletions: Completion[] = [
  {
    label: "variables",
    type: "variable",
    info: "GraphQL operation variables object",
    detail: "object",
    boost: 10,
  },
  {
    label: "operationName",
    type: "variable",
    info: "Name of the GraphQL operation",
    detail: "string",
    boost: 10,
  },
  {
    label: "request",
    type: "variable",
    info: "Full GraphQL request object",
    detail: "object",
    boost: 10,
  },
];

// Custom completion source for mock script variables
function mockScriptCompletionSource(context: CompletionContext) {
  // Get the word before the cursor
  const word = context.matchBefore(/\w*/);

  // Don't show completions if no word is being typed (unless explicitly triggered)
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  return {
    from: word.from,
    options: mockScriptCompletions,
    validFor: /^\w*$/,
  };
}

// Validate JavaScript syntax using acorn parser (for manual validation button)
export function validateJavaScript(code: string): { valid: boolean; error?: string } {
  try {
    acorn.parseExpressionAt(code, 0, {
      ecmaVersion: "latest",
      allowAwaitOutsideFunction: true,
    });
    return { valid: true };
  } catch {
    try {
      acorn.parse(code, {
        ecmaVersion: "latest",
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true,
      });
      return { valid: true };
    } catch (e) {
      const error = e as Error & { loc?: { line: number; column: number } };
      const location = error.loc ? ` (line ${error.loc.line}, col ${error.loc.column})` : "";
      return {
        valid: false,
        error: error.message.replace(/\s*\(\d+:\d+\)$/, "") + location,
      };
    }
  }
}

export function JavaScriptEditor({
  code,
  onChange,
  readOnly = false,
}: JavaScriptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        lintGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        javascript(),
        syntaxHighlighting(leoHighlightStyle),
        leoEditorTheme,
        keymap.of([...defaultKeymap, indentWithTab]),
        updateListener,
        createJsLinter(),
        autocompletion({
          override: [mockScriptCompletionSource],
          activateOnTyping: true,
        }),
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  // Update the editor content when code prop changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (view && code !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: code,
        },
      });
    }
  }, [code]);


  return (
    <div className="js-editor bg-leo-elevated rounded overflow-hidden relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
        <CopyButton text={code} title="Copy JavaScript" />
        <SaveButton
          content={code}
          filename="mock.js"
          mimeType="text/javascript"
          title="Save JavaScript"
        />
      </div>
      <div ref={editorRef} className="overflow-auto max-h-64" />
    </div>
  );
}
