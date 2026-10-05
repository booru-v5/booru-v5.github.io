/* 알파 와이프 — service worker
 *
 * Purpose: offline use, nothing else.
 *
 * Privacy contract
 * ----------------
 * - This worker makes exactly one kind of outbound request: fetching the
 *   app's own files (index.html, manifest, icons) from the origin it was
 *   served from, and only when they are not already in the cache.
 * - It never sees image data. Images are read in the page with the File API
 *   and processed on a canvas / with CompressionStreams; they never become
 *   an HTTP request, so a fetch handler cannot observe them.
 * - Any request that is not a same-origin GET is passed straight through to
 *   the network untouched (and in practice the app issues none).
 * - There is no analytics, no telemetry, no background sync, no push.
 */

"use strict";

const VERSION = "alphawipe-v1";

/* Relative to the worker's own location, so this works at any GitHub Pages
   sub-path without editing. */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll is all-or-nothing; add individually so one missing icon
    // cannot leave the app without an offline copy of the page itself.
    await Promise.all(SHELL.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* will be filled in on first successful load */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Only ever touch our own files. Everything else is none of our business.
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      // Offline and not cached: for a page navigation, hand back the app.
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html", { ignoreSearch: true });
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
