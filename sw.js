const CACHE_NAME = 'fisherforce-v1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css', // si tu as un CSS séparé
  '/logo.jpg',
  '/resultat.html',
  '/script.js',
  '/manifest.json',
  '/Capture d\'écran 2024-11-15 18380.png',
  '/learn.js',
  '/learnedPatterns.json',
  '/openai.js',
  '/package.json',
  '/save-spot.php',
  '/server.js',
  '/sessions.json',
  '/spots.json',
  '/suggestLures.js'
  // Ajoute ici tes autres fichiers importants (images, sons, etc.)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
