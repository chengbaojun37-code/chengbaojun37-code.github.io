/* 仓库管理系统 Service Worker —— 离线缓存应用外壳
 * 策略：
 *  - 同源导航请求(navigate)：永远网络优先，并更新缓存，失败才回退缓存（确保版本更新立即可达）
 *  - 同源静态资源：网络优先，成功后更新缓存（避免旧缓存一直生效）
 *  - 跨域请求(Gist API)：一律放行网络，不做缓存（数据实时同步）
 */
const CACHE = 'wms-cache-v20260824q'; // v3.12.10：SW 放行 /restaurant-inventory/ 路径——主站 SW(scope=/) 曾把饭店版导航请求劫持到主站页面，手机打开饭店版显示成奶茶店
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

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
    // v3.12.10 关键修复：本 SW 注册在域名根路径（scope=/），作用域覆盖包括 /restaurant-inventory/（饭店版）在内的全站。
    // 之前对「所有同源导航请求」都 respondWith('./index.html')——而 './' 相对主站 SW 解析为根路径首页，
    // 导致手机首次打开饭店版时被本 SW 劫持、渲染成奶茶店主站页面（显示奶茶店库存）。
    // 饭店版有自己的 SW（scope=/restaurant-inventory/），这里必须对该路径所有请求直接放行（不 respondWith），
    // 让浏览器走网络获取真·饭店版页面，由饭店版 SW 接管。
    if (url.pathname.indexOf('/restaurant-inventory') === 0) return;

    // 导航请求（页面本身）永远网络优先并更新缓存
    // v3.12.3：cache:'no-cache' 强制绕过浏览器 HTTP 缓存（GitHub Pages max-age=600 会让旧版页面驻留10分钟）
    if (req.mode === 'navigate') {
        e.respondWith(cacheWithNetworkUpdate('./index.html', { cache: 'no-cache' }));
        return;
    }
    e.respondWith(cacheWithNetworkUpdate(req));
});
