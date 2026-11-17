/* 仓库管理系统 Service Worker —— 离线缓存应用外壳
 * 策略：
 *  - 同源导航请求(navigate)：永远网络优先，并更新缓存，失败才回退缓存（确保版本更新立即可达）
 *  - 同源静态资源：网络优先，成功后更新缓存（避免旧缓存一直生效）
 *  - 跨域请求(Gist API)：一律放行网络，不做缓存（数据实时同步）
 */
const CACHE = 'wms-cache-v20261117p'; // v3.12.44：月/季/年出库页新增按物料编号查询「全部历史出库明细」——逐条列出该编号所有出库记录(时间/门店/数量/操作人)+合计
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './zxing-browser.min.js'];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(c) {
            return c.addAll(SHELL).catch(function() { return Promise.resolve(); });
        }).then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'skipWaiting') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
        }).then(function() { return self.clients.claim(); })
    );
});

function cacheWithNetworkUpdate(req, opts) {
    return caches.open(CACHE).then(function(cache) {
        return fetch(req, opts).then(function(res) {
            if (res && res.ok && res.type === 'basic') {
                cache.put(req, res.clone());
            }
            return res;
        }).catch(function() {
            return cache.match(req);
        });
    });
}

self.addEventListener('fetch', function(e) {
    var req = e.request;
    var url = new URL(req.url);
    // 跨域(Gist 等)不拦截，走网络
    if (url.origin !== self.location.origin) return;
    if (req.method !== 'GET') return;

    // 导航请求（页面本身）永远网络优先并更新缓存
    // v3.12.3：cache:'no-cache' 强制绕过浏览器 HTTP 缓存（GitHub Pages max-age=600 会让旧版页面驻留10分钟）
    if (req.mode === 'navigate') {
        e.respondWith(cacheWithNetworkUpdate('./index.html', { cache: 'no-cache' }));
        return;
    }
    e.respondWith(cacheWithNetworkUpdate(req));
});
