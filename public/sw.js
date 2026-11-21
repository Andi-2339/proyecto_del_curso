importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v12';
var CACHE_DYNAMIC_NAME = 'dynamic-v12';
var apikey = "sb_publishable_VZIBKKbLsnS4RIBNf5yv4Q_xPUFpndL";
var STATIC_FILES = [
    '/',
    '/index.html',
    '/offline.html',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/js/material.min.js',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/css/help.css',
    '/src/images/main-image.jpeg',
    '/src/images/UTEQ-1.jpg',
    '/manifest.json',
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css'
];

self.addEventListener('install', function (event) {
    console.log('[Service Worker] Installing Service Worker ...', event);
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME).then(function (cache) {
            console.log('[Service Worker] Precaching App Shell ...');
            return cache.addAll(STATIC_FILES);
        })
    );
});

self.addEventListener('activate', function (event) {
    console.log('[Service Worker] Activating Service Worker ....', event);
    event.waitUntil(
        caches.keys()
            .then(function (keyList) {
                return Promise.all(keyList.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        console.log('[Service Worker] Removing old cache.', key);
                        return caches.delete(key);
                    }
                }));
            })
    );
    return self.clients.claim();
});

function isInArray(string, array) {
    var cachePath;
    if (string.indexOf(self.location.origin) === 0) {
        cachePath = string.substring(self.location.origin.length);
    } else {
        cachePath = string;
    }
    return array.indexOf(cachePath) > -1;
}

self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') {
        return;
    }

    // URL de Supabase para interceptar
    var url = 'https://uctcigxwrwqiajnazggs.supabase.co/rest/v1/post';

    if (event.request.url.indexOf(url) > -1 && event.request.method === 'GET') {
        event.respondWith(fetch(event.request)
            .then(function (res) {
                var cloneRes = res.clone();
                clearAllData('posts')
                    .then(function () {
                        return cloneRes.json();
                    })
                    .then(function (data) {
                        for (var key in data) {
                            writeData('posts', data[key]);
                        }
                    });
                return res;
            })
        );
    } else if (isInArray(event.request.url, STATIC_FILES)) {
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request)
                        .then(function (res) {
                            return caches.open(CACHE_STATIC_NAME)
                                .then(function (cache) {
                                    cache.put(event.request, res.clone());
                                    return res;
                                });
                        });
                })
        );
    } else {
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                    if (response) {
                        return response;
                    } else {
                        return fetch(event.request)
                            .then(function (res) {
                                return caches.open(CACHE_DYNAMIC_NAME)
                                    .then(function (cache) {
                                        cache.put(event.request.url, res.clone());
                                        return res;
                                    });
                            })
                            .catch(function (err) {
                                return caches.open(CACHE_STATIC_NAME)
                                    .then(function (cache) {
                                        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
                                            return cache.match('/offline.html');
                                        }
                                    });
                            });
                    }
                })
        );
    }
});

function sendPostToSupabase(dt) {
    var postUrl = 'https://uctcigxwrwqiajnazggs.supabase.co/rest/v1/post';
    var headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': apikey,
        'Authorization': 'Bearer ' + apikey
    };
    var defaultImage = dt.image || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';

    return fetch(postUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            id: dt.id,
            title: dt.title,
            location: dt.location,
            image: defaultImage
        })
    });
}

self.addEventListener('sync', function (event) {
    console.log('[Service Worker] Background syncing', event);
    if (event.tag === 'sync-new-posts') {
        console.log('[Service Worker] Syncing new Posts');
        event.waitUntil(
            readAllData('sync-posts')
                .then(function (data) {
                    var syncPromises = data.map(function (dt) {
                        return sendPostToSupabase(dt)
                            .then(function (res) {
                                if (res && (res.ok || res.status === 409)) {
                                    console.log('[Service Worker] Post sincronizado con Supabase:', dt.title);
                                    return deleteItemFromData('sync-posts', dt.id);
                                }
                            })
                            .catch(function () {
                                console.log('[Service Worker] Sin internet aún, se sincronizará al reconectar.');
                            });
                    });
                    return Promise.all(syncPromises);
                })
                .then(function () {
                    return self.clients.matchAll({ includeUncontrolled: true });
                })
                .then(function (clients) {
                    clients.forEach(function (client) {
                        client.postMessage({ action: 'sync-completed' });
                    });
                })
        );
    }
});