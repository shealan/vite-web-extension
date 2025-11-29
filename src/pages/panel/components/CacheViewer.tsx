import React, { useState, useMemo } from 'react';
import { JsonTree, CopyButton } from './JsonTree';

interface CacheViewerProps {
  cache: Record<string, unknown> | null;
}

export function CacheViewer({ cache }: CacheViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const cacheKeys = useMemo(() => {
    if (!cache) return [];
    const keys = Object.keys(cache).filter((key) =>
      key.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Keep ROOT_QUERY at the top unless there's a search query
    if (!searchQuery) {
      const rootQueryIndex = keys.indexOf('ROOT_QUERY');
      if (rootQueryIndex > 0) {
        keys.splice(rootQueryIndex, 1);
        keys.unshift('ROOT_QUERY');
      }
    }

    return keys;
  }, [cache, searchQuery]);

  if (!cache) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No cache data available. Make sure Apollo Client is connected.
      </div>
    );
  }

  const selectedValue = selectedKey ? cache[selectedKey] : null;

  return (
    <div className="flex h-full w-full">
      {/* Cache Keys List */}
      <div className="w-80 shrink-0 border-r border-[#2d2d4a] flex flex-col">
        {/* Search */}
        <div className="p-2 border-b border-[#2d2d4a]">
          <input
            type="text"
            placeholder="Search cache keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-[#2d2d4a] border border-[#3d3d5c] rounded focus:outline-none focus:border-purple-500 text-gray-200 placeholder-gray-500"
          />
        </div>

        {/* Keys List */}
        <div className="flex-1 overflow-y-auto">
          {cacheKeys.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 text-center">
              {searchQuery ? 'No matching keys' : 'Cache is empty'}
            </div>
          ) : (
            <div className="divide-y divide-[#2d2d4a]">
              {cacheKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full px-3 py-2 text-left hover:bg-[#2d2d4a]/50 transition-colors ${
                    selectedKey === key ? 'bg-[#2d2d4a]' : ''
                  }`}
                >
                  <span className="text-sm text-gray-200 truncate block font-mono">
                    {key}
                  </span>
                  <span className="text-xs text-gray-500">
                    {getTypeBadge(cache[key])}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="p-2 border-t border-[#2d2d4a] text-xs text-gray-500">
          {cacheKeys.length} / {Object.keys(cache).length} keys
        </div>
      </div>

      {/* Cache Value Detail */}
      <div className="flex-1 overflow-auto p-4 w-full json-panel">
        {selectedKey ? (
          <>
            <div className="w-full">
              <h3 className="text-sm font-semibold text-purple-400 mb-3 font-mono break-all">
                {selectedKey}
              </h3>
              <div className="json-tree w-full">
                <JsonTree data={selectedValue} />
              </div>
            </div>
            <div className="fixed-copy-button">
              <CopyButton data={selectedValue} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a cache key to view its contents
          </div>
        )}
      </div>
    </div>
  );
}

function getTypeBadge(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value as object).length})`;
  return typeof value;
}
