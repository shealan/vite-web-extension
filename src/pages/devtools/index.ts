// Store for captured network headers (keyed by operation name)
const networkHeaders = new Map<
  string,
  {
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
    timestamp: number;
  }
>();

// Listen for network requests to capture complete headers
// This uses the privileged DevTools API which can see all headers (not CORS-restricted)
chrome.devtools.network.onRequestFinished.addListener((request) => {
  // Check if this is a GraphQL request
  const url = request.request.url;
  const isGraphQL =
    url.includes("graphql") ||
    (request.request.postData?.text?.includes('"query"') ?? false);

  if (!isGraphQL) return;

  // Try to extract operation name from request body
  let operationName: string | null = null;
  try {
    if (request.request.postData?.text) {
      const body = JSON.parse(request.request.postData.text);
      operationName = body.operationName;
    }
  } catch {
    // Not JSON, ignore
  }

  if (!operationName) return;

  // Convert HAR headers array to object
  const requestHeaders: Record<string, string> = {};
  request.request.headers.forEach((h) => {
    requestHeaders[h.name.toLowerCase()] = h.value;
  });

  const responseHeaders: Record<string, string> = {};
  request.response.headers.forEach((h) => {
    responseHeaders[h.name.toLowerCase()] = h.value;
  });

  // Store the headers
  networkHeaders.set(operationName, {
    requestHeaders,
    responseHeaders,
    timestamp: Date.now(),
  });

  // Keep map size bounded
  if (networkHeaders.size > 100) {
    const firstKey = networkHeaders.keys().next().value;
    if (firstKey) networkHeaders.delete(firstKey);
  }

  // Send to panel via runtime messaging
  // The panel can listen for these messages to update its headers display
  chrome.runtime.sendMessage({
    source: "leonardo-devtools-network",
    type: "NETWORK_HEADERS",
    payload: {
      operationName,
      requestHeaders,
      responseHeaders,
      timestamp: Date.now(),
    },
  }).catch(() => {
    // Panel might not be ready yet, ignore
  });
});

// Create the Leonardo.Ai DevTools panel
chrome.devtools.panels.create(
  "Leonardo.Ai",
  "icon-32.png",
  "src/pages/panel/index.html",
  () => {
    console.log("[Leonardo.Ai] DevTools panel created");
  }
);
