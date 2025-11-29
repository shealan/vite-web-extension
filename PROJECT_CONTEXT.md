# Leonardo.Ai GraphQL DevTools Extension

## Project Overview

A Chrome DevTools extension for monitoring GraphQL/Apollo operations on Leonardo.Ai. Built using the Vite Web Extension template with React and TypeScript.

## Development Setup

**Important:** The dev server is already running via `pnpm run dev:chrome`. Do NOT run build commands after making changes - hot reload handles this automatically.

## Architecture

### Extension Components

1. **Injected Script** (`public/injected.js`)
   - Runs in the page context to access Apollo Client internals
   - Intercepts fetch requests to capture GraphQL operations
   - Uses `queryManager.getObservableQueries()` and `queryInfo.getDiff()` to get cached data (same approach as official Apollo DevTools)
   - Communicates via `window.postMessage`

2. **Content Script** (`src/pages/content/index.ts`)
   - Bridge between injected script and background service worker
   - Injects the script into the page
   - Relays messages between page and extension

3. **Background Service Worker** (`src/pages/background/index.ts`)
   - Manages connections between content scripts and DevTools panel
   - Routes messages to the appropriate tab's panel

4. **DevTools Panel** (`src/pages/panel/`)
   - React-based UI displaying operations and cache
   - Main components:
     - `Panel.tsx` - Main container, manages state and message handling
     - `OperationList.tsx` - Filterable list of queries/mutations
     - `OperationDetail.tsx` - Shows query, variables, result, and cached data
     - `CacheViewer.tsx` - Browse full Apollo cache by key
     - `JsonTree.tsx` - Collapsible JSON viewer with copy functionality
     - `GraphQLHighlight.tsx` - Syntax highlighting for GraphQL queries

### Data Flow

```
Page (Apollo Client)
    ↓ (injected.js intercepts fetch + accesses Apollo internals)
    ↓ window.postMessage
Content Script
    ↓ chrome.runtime.sendMessage
Background Service Worker
    ↓ port.postMessage
DevTools Panel
```

### Key Types (`src/shared/types.ts`)

```typescript
interface GraphQLOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  result?: unknown;
  cachedData?: unknown; // Merged/paginated data from Apollo's queryInfo.getDiff()
  error?: string;
  timestamp: number;
  duration?: number;
  status: 'loading' | 'success' | 'error';
}
```

## Cache Data Approach

The extension retrieves cached data using the same method as official Apollo DevTools:

1. When a GraphQL operation completes, `injected.js` waits 150ms for Apollo to process
2. Calls `getWatchedQueries()` which accesses `client.queryManager.getObservableQueries('active')`
3. For each query, gets `queryInfo.getDiff().result` - this returns the **merged/paginated cached data**
4. For infinite scroll queries, this shows all accumulated items (e.g., 50→100→150) not just the last page

## UI Features

- **Tabs**: Queries, Mutations, Cache
- **Operation List**: Searchable, shows loading/success/error states with timing
- **Operation Detail**: Two-panel layout
  - Left: Query (syntax highlighted) | Variables
  - Right: Result | Cache (merged data from Apollo)
- **Cache Viewer**: Browse all cache keys, view/copy values
- **Dark theme** matching DevTools aesthetic

## File Structure

```
├── public/
│   └── injected.js          # Page-context script for Apollo access
├── src/
│   ├── pages/
│   │   ├── background/      # Service worker
│   │   ├── content/         # Content script bridge
│   │   ├── devtools/        # DevTools page that creates panel
│   │   └── panel/           # React DevTools panel UI
│   │       ├── Panel.tsx
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

## Known Issues / Notes

- Pre-existing TypeScript errors in `background/index.ts` related to null handling (not blocking)
- Cache data availability depends on queries being actively watched by Apollo Client
- 150ms delay after response for Apollo to update cache before reading `getDiff()`

## Reference

The official Apollo Client DevTools repository was analyzed to understand their approach:
- Located at `apollo-client-devtools-main/` (local copy for reference)
- Key file: `src/extension/tab/v3/handler.ts` - shows `queryInfo.getDiff()` usage
