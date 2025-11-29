import React from "react";
import ReactJson, { InteractionProps } from "@microlink/react-json-view";

interface EditableJsonTreeProps {
  data: unknown;
  onEdit?: (updatedData: unknown) => void;
  readOnly?: boolean;
  collapsed?: number | boolean;
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

export function EditableJsonTree({
  data,
  onEdit,
  readOnly = false,
  collapsed = 2,
}: EditableJsonTreeProps) {
  const handleChange = (interaction: InteractionProps) => {
    onEdit?.(interaction.updated_src);
  };

  return (
    <div className="w-full editable-json-tree">
      <ReactJson
        src={data as object}
        theme={theme}
        name={false}
        collapsed={collapsed}
        collapseStringsAfterLength={100}
        displayDataTypes={false}
        displayObjectSize={false}
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
