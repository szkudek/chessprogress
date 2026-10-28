// Zwiększ numer wersji przy każdej zmianie plików strony.
var CACHE = "szachy-v9";
var CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./chess.js", "./analiza.js", "./trening.js"];
var EXTRA = ["./stockfish-19-lite-single.js", "./stockfish-19-lite-single.wasm"];

// Instalacja nie może się wywalić, jeśli któregoś pliku brakuje w repozytorium.
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(CORE.concat(EXTRA).map(function(f){ return c.add(f).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function cacheFirst(req){
  return caches.open(CACHE).then(function(cache){
    return cache.match(req, {ignoreSearch:true}).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){ if(res && res.ok) cache.put(req, res.clone()); return res; });
    });
  });
}
// Strony, skrypty i manifest: najpierw sieć (świeża wersja), a gdy jej brak lub jest wolna, cache.
function networkFirst(req){
  return caches.open(CACHE).then(function(cache){
    var net = fetch(req).then(function(res){ if(res && res.ok) cache.put(req, res.clone()); return res; });
    net.catch(function(){});
    var slow = new Promise(function(_, rej){ setTimeout(rej, 4000); });
    return Promise.race([net, slow]).catch(function(){
      return cache.match(req, {ignoreSearch:true}).then(function(hit){
        return hit || (req.mode === "navigate" ? cache.match("./index.html") : null);
      }).then(function(hit){ return hit || net; });
    });
  });
}
self.addEventListener("fetch", function(e){
  var req = e.request, url = new URL(req.url);
  if(req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(/\.(wasm|png)$/.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
