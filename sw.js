/*
 * Service worker do Plotador de ERBs e Pontos.
 *
 * Guarda em cache apenas os arquivos da própria ferramenta (HTML, CSS, JS,
 * fontes e ícones), para que ela abra offline depois da primeira visita.
 * Mapas de fundo, Nominatim e Google Fonts NÃO são cacheados: as políticas do
 * OpenStreetMap e do Google proíbem armazenar tiles em massa.
 *
 * Estratégia: rede primeiro com cache como reserva. Assim, quem está online
 * sempre recebe a versão mais nova, e quem está offline usa a última vista.
 */
const CACHE_NAME = 'plotador-erb-ponto-v1';

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './utils.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/apple-touch-icon.png',
    './vendor/leaflet/leaflet.js',
    './vendor/leaflet/leaflet.css',
    './vendor/leaflet/images/layers.png',
    './vendor/leaflet/images/layers-2x.png',
    './vendor/leaflet/images/marker-icon.png',
    './vendor/leaflet/images/marker-icon-2x.png',
    './vendor/leaflet/images/marker-shadow.png',
    './vendor/markercluster/leaflet.markercluster.js',
    './vendor/markercluster/MarkerCluster.css',
    './vendor/markercluster/MarkerCluster.Default.css',
    './vendor/sheetjs/xlsx.full.min.js',
    './vendor/polygon-clipping/polygon-clipping.umd.min.js',
    './vendor/fontawesome/css/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './vendor/fontawesome/webfonts/fa-v4compatibility.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // Só a própria origem entra no cache. Tiles, geocodificação e fontes externas seguem direto para a rede.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
                }
                return response;
            })
            .catch(() => caches.match(request, { ignoreSearch: true }).then(cached => cached || Response.error()))
    );
});
