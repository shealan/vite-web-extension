import React from "react";
import ReactJson, { InteractionProps } from "@microlink/react-json-view";

interface EditableJsonTreeProps {
  data: unknown;
  onEdit?: (updatedData: unknown) => void;
  readOnly?: boolean;
}

// Custom theme matching the existing JsonTree color scheme
// react-json-view maps base16 colors differently than react-json-tree
// Adjusted to match our original theme visually
const theme = {
  base00: "transparent", // background
  base01: "#2d2d4a", // lighter background
  base02: "#3d3d5c", // selection background
  base03: "#9ca3af", // comments, line numbers
  base04: "#9ca3af", // dark foreground
  base05: "#e5e7eb", // default text
  base06: "#f3f4f6", // light foreground
  base07: "#7dd3fc", // keys (cyan)
  base08: "#f472b6", // null, NaN, undefined (pink)
  base09: "#86efac", // strings (green)
  base0A: "#fbbf24", // symbols, dates
  base0B: "#fbbf24", // numbers (yellow)
  base0C: "#7dd3fc", // regex
  base0D: "#c4b5fd", // functions (purple)
  base0E: "#f472b6", // booleans (pink)
  base0F: "#f472b6", // integers (pink)
};

export function EditableJsonTree({
  data,
  onEdit,
  readOnly = false,
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
        collapsed={2}
        collapseStringsAfterLength={100}
        displayDataTypes={false}
        displayObjectSize={true}
        enableClipboard={true}
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
