// sw.js - Service Worker for persistent image caching
const CACHE_NAME = 'viral-gallery-v3';
const IMAGE_CACHE = 'viral-images-v3';

// Cache images when they're loaded
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache images from your Supabase storage
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        // Try to get from cache first
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          console.log('📦 Serving from cache:', url.pathname);
          return cachedResponse; // Serve from cache - 0 egress!
        }
        
        // If not in cache, fetch from network
        console.log('🌐 Fetching from network:', url.pathname);
        const networkResponse = await fetch(event.request);
        
        // Store in cache for next time
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      })
    );
  }
});

// Precache critical assets (optional)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // You can precache your HTML and CSS if desired
      return cache.addAll([
        '/',
        '/index.html'
      ]).catch(err => console.log('Precache failed:', err));
    })
  );
});

// Clean up old caches when new version activates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== IMAGE_CACHE)
          .map(key => {
            console.log('🗑️ Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
});