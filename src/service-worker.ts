/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Create a unique cache name using SvelteKit's build version
const CACHE = `bendtube-cache-${version}`;

// List of all files to cache (app logic, components, static files, and the root HTML)
const ASSETS = [
	'/', 
	...build, 
	...files
];

// 1. INSTALLATION - Pre-cache all essential assets
sw.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
	sw.skipWaiting();
});

// 2. ACTIVATION - Clean up old caches from previous versions
sw.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}
	event.waitUntil(deleteOldCaches());
	sw.clients.claim();
});

// 3. FETCHING - Offline-First Strategy (Cache First, fallback to Network)
sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// Try to serve from cache first
		const cachedResponse = await cache.match(event.request);
		if (cachedResponse) {
			return cachedResponse;
		}

		// If not in cache, fetch from network and cache it for next time
		try {
			const response = await fetch(event.request);
			
			// Only cache valid http/https responses (avoids caching chrome-extension:// etc)
			if (response.status === 200 && url.protocol.startsWith('http')) {
				cache.put(event.request, response.clone());
			}
			
			return response;
		} catch (err) {
			// Provide a generic offline fallback if needed
			return new Response('Offline', { status: 408 });
		}
	}

	event.respondWith(respond());
});