// Makes the system installable as an app on a phone or a computer. It keeps nothing: every request goes to the
// network as before, so a new release is seen at once and nothing stale is ever shown.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
