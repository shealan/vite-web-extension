# Leonardo.Ai GraphQL DevTools Extension

## Project Overview

A Chrome DevTools extension for monitoring GraphQL/Apollo operations on Leonardo.Ai. Built using the Vite Web Extension template with React and TypeScript.

## Development Setup

**Important:** The dev server is already running via `pnpm run dev:chrome`. Do NOT run build commands after making changes - hot reload handles this automatically.

## Architecture

This extension uses an **RPC-based polling architecture** similar to the official Apollo DevTools, allowing it to:
- Show data even when the panel is opened after page load
- Display live updates to cached data
- Show the current state of all watched queries/mutations

### Extension Components

1. **Injected Script** (`public/injected.js`)
   - Runs in the page context to access Apollo Client internals
   - Exposes RPC handlers: `getQueries`, `getMutations`, `getCache`, `getClientInfo`
   - Uses `queryManager.getObservableQueries()` and `queryInfo.getDiff()` to get cached data
   - Communicates via `window.postMessage`

2. **Content Script** (`src/pages/content/index.ts`)
   - Bridge between injected script and background service worker
   - Injects the script into the page
   - Relays RPC requests/responses between page and extension
   - Handles async RPC responses using `sendResponse`

3. **Background Service Worker** (`src/pages/background/index.ts`)
   - Manages connections between content scripts and DevTools panel
   - Routes RPC requests to content script and responses back to panel
   - Tracks Apollo Client detection state per tab

4. **DevTools Panel** (`src/pages/panel/`)
   - React-based UI displaying operations and cache
   - **Polls every 500ms** for live data updates
   - Uses RPC client to request data from injected script
   - Converts raw Apollo data to `GraphQLOperation` format for UI
   - Main components:
     - `Panel.tsx` - Main container, RPC client, polling logic
     - `OperationList.tsx` - Filterable list of queries/mutations
     - `OperationDetail.tsx` - Shows query, variables, result, and cached data
     - `CacheViewer.tsx` - Browse full Apollo cache by key
     - `JsonTree.tsx` - Collapsible JSON viewer with copy functionality
     - `GraphQLHighlight.tsx` - Syntax highlighting for GraphQL queries

### Data Flow

```
Panel (React)
    ↓ RPC Request (getQueries, getMutations, getCache)
Background Service Worker
    ↓ chrome.tabs.sendMessage
Content Script
    ↓ window.postMessage
Injected Script (accesses Apollo Client)
    ↓ window.postMessage (RPC Response)
Content Script
    ↓ sendResponse
Background Service Worker
    ↓ port.postMessage
Panel (receives data, converts to GraphQLOperation[], updates state)
```

### Key Types (`src/shared/types.ts`)

```typescript
// Main operation type used by UI
interface GraphQLOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  result?: unknown;
  cachedData?: unknown; // Merged/paginated data from Apollo
  error?: string;
  timestamp: number;
  duration?: number;
  status: 'loading' | 'success' | 'error';
}

// Raw data from Apollo Client (internal use)
interface RawWatchedQuery {
  id: string;
  operationName: string;
  queryString: string;
  variables?: Record<string, unknown>;
  cachedData?: unknown;
  networkStatus: number;
  pollInterval?: number | null;
}

interface RawMutation {
  id: string;
  operationName: string;
  mutationString: string;
  variables?: Record<string, unknown>;
  loading: boolean;
  error?: unknown;
}
```

## RPC Methods

The injected script exposes these RPC methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `getQueries` | `RawWatchedQuery[]` | All active watched queries with cached data |
| `getMutations` | `RawMutation[]` | All mutations in the mutation store |
| `getCache` | `Record<string, unknown>` | Full Apollo cache extract |
| `getClientInfo` | `{ version, queryCount, mutationCount }` | Apollo Client info |

## UI Features

- **Tabs**: Queries, Mutations, Cache
- **Operation List**: Searchable, shows loading/success/error states with timing
- **Operation Detail**: Two-panel layout
  - Left: Query (syntax highlighted) | Variables
  - Right: Result | Cache (merged data from Apollo)
- **Cache Viewer**: Browse all cache keys, view/copy values
- **Clear button**: Reset operations list
- **Dark theme** matching DevTools aesthetic

## File Structure

```
├── public/
│   └── injected.js          # Page-context script with RPC handlers
├── src/
│   ├── pages/
│   │   ├── background/      # Service worker (RPC routing)
│   │   ├── content/         # Content script (RPC bridge)
│   │   ├── devtools/        # DevTools page that creates panel
│   │   └── panel/           # React DevTools panel UI
│   │       ├── Panel.tsx    # Main component with RPC client & polling
│   │       ├── Panel.css
│   │       └── components/
│   │           ├── OperationList.tsx
│   │           ├── OperationDetail.tsx
│   │           ├── CacheViewer.tsx
│   │           ├── JsonTree.tsx
│   │           └── GraphQLHighlight.tsx
│   └── shared/
│       └── types.ts         # Shared TypeScript interfaces
├── manifest.json            # Extension manifest v3
└── vite.config.chrome.ts    # Vite build config
```

## How It Differs From Official Apollo DevTools

| Feature | Official | This Extension |
|---------|----------|----------------|
| Data retrieval | Native Apollo Client integration | RPC + polling |
| Update frequency | Real-time via Apollo hooks | 500ms polling |
| Panel open late | Works | Works (via polling) |
| Paginated cache | Full merged data | Full merged data |
| Operation history | No (current state only) | No (current state only) |
| Bundle size | Large (includes Apollo Client) | Small (no dependencies) |

## Reference

The official Apollo Client DevTools repository was analyzed to understand their approach:
- Located at `apollo-client-devtools-main/` (local copy for reference)
- Key insight: `queryInfo.getDiff().result` for merged cached data
- Key insight: Polling with `pollInterval: 500` in `useQuery`

---

## Recent Updates (Session Notes)

### Mock Data System

The extension supports mocking GraphQL responses with two mock types:

1. **JSON Mocks** - Static JSON data that replaces the operation result
2. **JavaScript Mocks** - Dynamic scripts that can access `variables`, `operationName`, and `request` objects

Mock data is stored in the wrapper format:
```typescript
// JSON mock - stored as raw JSON string
const jsonMock = '{"data": {...}}'

// JS mock - wrapped in special format
const jsMock = JSON.stringify({
  __mockType: "js",
  __mockScript: "return { data: { ... } }"
})
```

Mock state is persisted to `chrome.storage.local` and re-applied on page refresh via `reapplyMocks()`.

### EditableJsonTree Component (`src/pages/panel/components/EditableJsonTree.tsx`)

A React component wrapping `@microlink/react-json-view` with Leonardo.Ai theming.

**Props:**
- `data: unknown` - JSON data to display
- `onEdit?: (updatedData: unknown) => void` - Called when user edits inline
- `readOnly?: boolean` - Disable editing (default: false)
- `collapsed?: number | boolean` - Collapse level (default: 2)
- `hideWarning?: boolean` - Hide internal large file warning (for external warning placement)
- `forceExpanded?: boolean` - External control for expanded state
- `showCopyButton?: boolean` - Show copy button in top-right corner
- `noPadding?: boolean` - Remove default `pt-2` top padding (use when no content above)

**Large JSON Handling:**
- `LARGE_JSON_THRESHOLD = 50000` (~50KB estimated size)
- `estimateJsonSize(data)` - Estimates JSON size without full stringification
- `useIsLargeJson(data)` - Hook to check if data exceeds threshold
- `LargeJsonWarning` - Exported component for external warning rendering
- Large files auto-collapse and show warning banner with "Expand All" button

**Copy Button:**
- Built into component via `showCopyButton` prop
- Uses `navigator.clipboard.writeText()` with textarea fallback
- SVG icons exempt from JSON tree grey icon styling via `.json-copy-button` class

### JavaScriptEditor Component (`src/pages/panel/components/JavaScriptEditor.tsx`)

CodeMirror 6-based JavaScript editor with:
- Leonardo.Ai dark theme (`leoEditorTheme`, `leoHighlightStyle`)
- Real-time syntax validation via `acorn` parser
- Lint gutter with error/warning squiggles
- Autocomplete for mock script variables (`variables`, `operationName`, `request`)
- `validateJavaScript(code)` - Exported validation function

### CSS Architecture (`src/pages/panel/Panel.css`)

**JSON Tree Icon Styling:**
```css
/* Grey expand/collapse icons, excluding copy button */
.editable-json-tree svg:not(.json-copy-button svg) {
  fill: #4a4a4a !important;
  stroke: #4a4a4a !important;
}

/* Copy button uses currentColor for Tailwind classes */
.json-copy-button svg {
  fill: none !important;
  stroke: currentColor !important;
}
```

### OperationDetail Component Structure

The component uses extracted tab components for better organization:
- `ResultTab` - Data tab with mock banner, error state, loading spinner
- `ResponseTab` - HTTP response with status, headers, body
- `CacheTab` - Apollo cached data
- Mock Data tab - File picker, JSON/JS editor, enable/disable toggle

**Tab Components Pattern:**
Each tab component manages its own `forceExpanded` state for large JSON handling, receives props for display data and collapse settings.

### Popup Session Detection (`src/pages/popup/Popup.tsx`)

The popup checks for valid Leonardo.Ai session cookies before displaying user data:
```typescript
async function checkSessionCookie(): Promise<boolean> {
  const cookies = await chrome.cookies.getAll({ domain: "app.leonardo.ai" });
  return cookies.some(c =>
    c.name.includes("session-token") ||
    c.name.includes("SessionPresent")
  );
}
```

### Injected Script User Data Capture (`public/injected.js`)

Captures user data from `__NEXT_DATA__` and GraphQL responses:
- Listens for `GetSelfUser` GraphQL operations
- Posts `USER_DATA_CAPTURED` and `USER_LOGGED_OUT` messages
- Content script persists to `chrome.storage.local`

### Settings System

Settings stored in `Panel.tsx` and persisted:
```typescript
interface Settings {
  autoExpandJson: boolean;   // Expand all JSON nodes by default
  highlightChakra: boolean;  // Inject Chakra component highlighter
}
```

Chakra highlighter injects colored outlines around Chakra UI components for debugging.
