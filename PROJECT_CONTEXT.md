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
