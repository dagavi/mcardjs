'use strict';

const currentFolder = location.pathname.substring(0, location.pathname.lastIndexOf("/"));

const cachePrefix = "vmuviewer-";
const staticCacheName = cachePrefix + "static-v1";
const allCaches = [
    staticCacheName
];

self.addEventListener("install", function(event) {
    console.log("Service Worker install. Current folder: " + currentFolder);
    self.skipWaiting();

    event.waitUntil(
        caches.open(staticCacheName).then(function(cache) {
            return cache.addAll([
                currentFolder + "/",
                currentFolder + "/index.html",
                currentFolder + "/style.css",
                currentFolder + "/js/sw-register.js",
                currentFolder + "/vmuviewer.html",
                currentFolder + "/js/vmu.js",
                currentFolder + "/js/vmuviewer.js",
                currentFolder + "/images/vmu_icon-192x192.png",
                currentFolder + "/psxmcviewer.html",
                currentFolder + "/js/psxmc.js",
                currentFolder + "/js/psxmcviewer.js",
                currentFolder + "/js/jistounicode.js",
                currentFolder + "/images/psxmc_icon-192x192.png",
                currentFolder + "/mcviewer.html",
                currentFolder + "/js/mcviewer.js",
                "https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-rc.2/css/materialize.min.css",
                "https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-rc.2/js/materialize.min.js"
            ]);
        })
    );
});

self.addEventListener("activate", function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(cacheName) {
                    return cacheName.startsWith(cachePrefix) &&
                           !allCaches.includes(cacheName);
                }).map(function(cacheName) {
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

const domainsToCache = ["fonts.googleapis.com", "fonts.gstatic.com"];

function cacheFail(request) {
    console.info("Cache fail: " + request.url);
    var requestUrl = new URL(request.url);
    if (!domainsToCache.includes(requestUrl.hostname)) {
        return fetch(request);
    }

    // Useful to cache variable URL from Google fonts
    return caches.open(staticCacheName).then(function(cache) {
        return fetch(request).then(function(response) {
            console.info("Cached on fetch: " + request.url);
            cache.put(request, response.clone());
            return response;
        });
    });
}

self.addEventListener("fetch", function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || cacheFail(event.request);
        })
    );
});
