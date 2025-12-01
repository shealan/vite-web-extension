import React, { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { graphql } from "cm6-graphql";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface GraphQLHighlightProps {
  query: string;
}

// GraphQL syntax highlighting matching Leonardo.Ai theme
const graphqlHighlightStyle = HighlightStyle.define([
  // Keywords (query, mutation, subscription, fragment, on, type, etc.)
  { tag: tags.keyword, color: "#b294bb" },
  { tag: tags.definitionKeyword, color: "#b294bb" },
  // Type names
  { tag: tags.typeName, color: "#8abeb7" },
  // Field names
  { tag: tags.propertyName, color: "#81a2be" },
  // Variables ($var)
  { tag: tags.variableName, color: "#de935f" },
  // Strings
  { tag: tags.string, color: "#7ec699" },
  // Numbers
  { tag: tags.number, color: "#d4a76a" },
  // Booleans and null
  { tag: tags.bool, color: "#c9a0dc" },
  { tag: tags.null, color: "#c9a0dc" },
  // Directives (@skip, @include, etc.)
  { tag: tags.meta, color: "#f0c674" },
  // Comments
  { tag: tags.comment, color: "#6b7280", fontStyle: "italic" },
  // Punctuation
  { tag: tags.punctuation, color: "#969896" },
  { tag: tags.bracket, color: "#969896" },
  { tag: tags.brace, color: "#969896" },
  { tag: tags.paren, color: "#969896" },
  // Operation/Fragment names
  { tag: tags.function(tags.definition(tags.variableName)), color: "#8abeb7" },
  // Argument names
  { tag: tags.definition(tags.propertyName), color: "#81a2be" },
]);

// Read-only theme for the viewer (no gutters, no line numbers)
const graphqlViewerTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "#c5c8c6",
      fontSize: "12px",
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    },
    ".cm-content": {
      caretColor: "transparent",
      padding: "0",
      minHeight: "auto",
    },
    ".cm-scroller": {
      minHeight: "auto",
      overflow: "visible",
    },
    ".cm-line": {
      padding: "0",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(125, 211, 252, 0.3)",
    },
    ".cm-cursor": {
      display: "none",
    },
  },
  { dark: true }
);

export function GraphQLHighlight({ query }: GraphQLHighlightProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: query,
      extensions: [
        graphql(),
        syntaxHighlighting(graphqlHighlightStyle),
        graphqlViewerTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
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
  }, []);

  // Update content when query changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && query !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: query,
        },
      });
    }
  }, [query]);

  return (
    <div
      ref={editorRef}
      className="graphql-highlight leading-relaxed bg-leo-elevated p-3"
    />
  );
}
