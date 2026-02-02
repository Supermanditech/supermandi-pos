// GO-LIVE-099: Service Worker for SuperMandi SuperAdmin
// Provides offline caching for static assets and API responses

// GO-LIVE-SOP: Updated cache version to force old cache purge on every deploy
// IMPORTANT: Never cache HTML/index files - they must always be fresh
const CACHE_VERSION = 'superadmin-v3-20260203';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// GO-LIVE-SOP: REMOVED HTML from static assets - only cache hashed JS/CSS
// Static assets to cache on install (NO HTML FILES)
const STATIC_ASSETS = [
  // Do NOT cache index.html or / routes - they must always fetch fresh
];

// GO-LIVE-SOP: Patterns that should NEVER be cached (always network-only)
const NEVER_CACHE_PATTERNS = [
  /\/admin\/?$/,           // Main admin route
  /\/admin\/index\.html$/, // Admin index HTML
  /\.html$/,               // Any HTML file
];

// API endpoints to cache (with network-first strategy)
const CACHEABLE_API_PATTERNS = [
  /\/api\/v1\/admin\/stores$/,
  /\/api\/v1\/admin\/analytics\/overview/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v3...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets (excluding HTML)');
        // GO-LIVE-SOP: Empty list - we don't pre-cache anything now
        // Hashed assets will be cached on first request
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn('[SW] Failed to cache some static assets:', err);
        });
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v3...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('superadmin-') && name !== STATIC_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (except API)
  if (url.origin !== self.location.origin && !url.pathname.includes('/api/')) {
    return;
  }

  // GO-LIVE-SOP: NEVER cache HTML files or root paths - always fetch fresh
  const shouldNeverCache = NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
  if (shouldNeverCache) {
    console.log('[SW] Network-only for:', url.pathname);
    event.respondWith(fetch(request));
    return;
  }

  // Check if this is an API request
  const isApiRequest = url.pathname.includes('/api/');

  if (isApiRequest) {
    // Network-first strategy for API requests
    event.respondWith(networkFirstStrategy(request));
  } else {
    // GO-LIVE-SOP: Cache-first ONLY for hashed static assets (JS/CSS with hash in filename)
    const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css)$/.test(url.pathname);
    if (isHashedAsset) {
      event.respondWith(cacheFirstStrategy(request));
    } else {
      // For non-hashed assets (images, fonts, etc.), use network-first
      event.respondWith(networkFirstStrategy(request));
    }
  }
});

// Cache-first strategy - serve from cache, fallback to network
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached response (no background update needed for hashed assets)
    return cachedResponse;
  }

  // Not in cache - fetch from network
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Network request failed:', error);
    // GO-LIVE-SOP: Don't return cached HTML - just fail
    return new Response('Network error', { status: 503 });
  }
}

// Network-first strategy - try network, fallback to cache
async function networkFirstStrategy(request) {
  const url = new URL(request.url);

  // Check if this API endpoint is cacheable
  const isCacheable = CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname));

  try {
    const networkResponse = await fetch(request);

    // Cache successful responses for cacheable endpoints
    if (networkResponse.ok && isCacheable) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network request failed, trying cache:', error);

    // Try to serve from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add header to indicate offline response
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-SW-Offline', 'true');

      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });
    }

    // No cache available - return error response
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You appear to be offline' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => {
      console.log('[SW] All caches cleared');
    });
  }
});
