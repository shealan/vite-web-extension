import React from "react";
import Editor from "react-simple-code-editor";

interface JavaScriptEditorProps {
  code: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
}

export function JavaScriptEditor({
  code,
  onChange,
  readOnly = false,
}: JavaScriptEditorProps) {
  return (
    <div className="js-editor bg-[#2d2d4a] rounded overflow-auto max-h-64">
      <Editor
        value={code}
        onValueChange={onChange}
        highlight={highlightJavaScript}
        padding={12}
        readOnly={readOnly}
        style={{
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: "0.75rem",
          lineHeight: "1rem",
          minHeight: "100px",
        }}
        textareaClassName="js-editor-textarea"
        preClassName="js-editor-pre"
      />
    </div>
  );
}

// Syntax highlighting function that returns HTML string
function highlightJavaScript(code: string): string {
  const tokens = tokenize(code);
  return tokens
    .map((token) => {
      if (token.className) {
        return `<span class="${token.className}">${escapeHtml(token.text)}</span>`;
      }
      return escapeHtml(token.text);
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface Token {
  text: string;
  className: string;
}

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  const patterns: { regex: RegExp; className: string }[] = [
    // Single-line comments
    { regex: /^\/\/[^\n]*/, className: "text-gray-500 italic" },
    // Multi-line comments
    { regex: /^\/\*[\s\S]*?\*\//, className: "text-gray-500 italic" },
    // Template literals (backtick strings)
    { regex: /^`(?:[^`\\]|\\.)*`/, className: "text-green-400" },
    // Double-quoted strings
    { regex: /^"(?:[^"\\]|\\.)*"/, className: "text-green-400" },
    // Single-quoted strings
    { regex: /^'(?:[^'\\]|\\.)*'/, className: "text-green-400" },
    // Keywords
    {
      regex:
        /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|typeof|instanceof|in|of|class|extends|static|get|set|async|await|import|export|default|from|as|yield)\b/,
      className: "text-purple-400 font-semibold",
    },
    // Boolean and null literals
    {
      regex: /^(true|false|null|undefined|NaN|Infinity)\b/,
      className: "text-pink-400",
    },
    // this, super
    { regex: /^(this|super)\b/, className: "text-pink-400" },
    // Numbers (including hex, octal, binary, and floats)
    { regex: /^0x[0-9a-fA-F]+/, className: "text-amber-300" },
    { regex: /^0o[0-7]+/, className: "text-amber-300" },
    { regex: /^0b[01]+/, className: "text-amber-300" },
    { regex: /^-?\d+\.?\d*(?:e[+-]?\d+)?/, className: "text-amber-300" },
    // Arrow function
    { regex: /^=>/, className: "text-purple-400" },
    // Spread/rest operator
    { regex: /^\.\.\./, className: "text-purple-400" },
    // Object property shorthand or method (word followed by colon)
    { regex: /^[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*:)/, className: "text-cyan-400" },
    // Function calls (word followed by paren)
    { regex: /^[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/, className: "text-sky-300" },
    // Regular identifiers
    { regex: /^[a-zA-Z_$][a-zA-Z0-9_$]*/, className: "text-gray-200" },
    // Operators
    { regex: /^[+\-*/%=!<>&|^~?]+/, className: "text-gray-400" },
    // Punctuation - braces
    { regex: /^[{}]/, className: "text-gray-400" },
    // Punctuation - brackets and parens
    { regex: /^[[\]()]/, className: "text-gray-500" },
    // Punctuation - other
    { regex: /^[;,.:]+/, className: "text-gray-500" },
    // Whitespace (preserve it)
    { regex: /^[ \t]+/, className: "" },
    // Newlines (preserve them)
    { regex: /^\n/, className: "" },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, className } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        tokens.push({ text: match[0], className });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Push single character if nothing matches
      tokens.push({ text: remaining[0], className: "text-gray-200" });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}
