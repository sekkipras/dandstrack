// D&S Expense Tracker - Service Worker
// Provides offline caching for PWA functionality

// UPDATE THIS VERSION NUMBER WHEN DEPLOYING CHANGES!
const CACHE_VERSION = 'v3';
const CACHE_NAME = `dands-expense-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/manifest.json'
];

// Install - cache static assets and skip waiting
self.addEventListener('install', (event) => {
    console.log('[SW] Installing new version:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // Force activation immediately (don't wait for old SW to stop)
    self.skipWaiting();
});

// Activate - clean up old caches and take control
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new version:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete any cache that isn't our current version
                    if (cacheName.startsWith('dands-expense-') && cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Notify all clients about the update
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                });
            });
        })
    );
    // Take control of all clients immediately
    self.clients.claim();
});

// Fetch - network first with cache fallback
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and API calls
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone and cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request);
            })
    );
});

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
