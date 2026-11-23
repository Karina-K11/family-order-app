/**
 * 家庭点菜小程序 · 零依赖 Node 后端
 * 运行：node server.js   （默认端口 3000，可用环境变量 PORT 覆盖）
 * 订单保留最近 30 天，超期自动清理；数据保存在 ./data 目录下的 JSON 文件中。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const PORT = Number(process.env.PORT || 3000);
// 订单保留天数：超过该天数的订单在读取/写入时自动清除
const ORDER_RETENTION_DAYS = Number(process.env.ORDER_RETENTION_DAYS || 30);

// ---------- 数据读写 ----------
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MENU_FILE)) fs.writeFileSync(MENU_FILE, JSON.stringify(defaultMenu(), null, 2), 'utf8');
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
}

function defaultMenu() {
  const img = (slug) => '/images/' + slug + '.jpg';
  return [
    { id: uid(), name: '番茄炒蛋', category: '家常菜', desc: '酸甜适口', image: img('tomato-egg'), available: true },
    { id: uid(), name: '红烧肉', category: '家常菜', desc: '肥而不腻', image: img('braised-pork'), available: true },
    { id: uid(), name: '可乐鸡翅', category: '家常菜', desc: '微甜', image: img('cola-chicken-wings'), available: true },
    { id: uid(), name: '宫保鸡丁', category: '家常菜', desc: '香辣花生', image: img('kung-pao-chicken'), available: true },
    { id: uid(), name: '青椒肉丝', category: '家常菜', desc: '咸鲜爽口', image: img('shredded-pork-pepper'), available: true },
    { id: uid(), name: '鱼香肉丝', category: '家常菜', desc: '酸甜微辣', image: img('fish-flavored-pork'), available: true },
    { id: uid(), name: '麻婆豆腐', category: '家常菜', desc: '麻辣嫩滑', image: img('mapo-tofu'), available: true },
    { id: uid(), name: '酸辣土豆丝', category: '家常菜', desc: '脆爽开胃', image: img('spicy-potato-shreds'), available: true },
    { id: uid(), name: '清蒸鲈鱼', category: '家常菜', desc: '鲜嫩清淡', image: img('steamed-bass'), available: true },
    { id: uid(), name: '蒜蓉西兰花', category: '家常菜', desc: '清爽素菜', image: img('broccoli-garlic'), available: true },
    { id: uid(), name: '红烧排骨', category: '家常菜', desc: '酱香入味', image: img('braised-ribs'), available: true },
    { id: uid(), name: '水蒸蛋', category: '家常菜', desc: '滑嫩入口', image: img('steamed-egg'), available: true },
    { id: uid(), name: '清炒时蔬', category: '素菜', desc: '当日新鲜蔬菜', image: img('stir-fried-greens'), available: true },
    { id: uid(), name: '西红柿蛋汤', category: '汤品', desc: '清淡暖胃', image: img('tomato-egg-soup'), available: true },
    { id: uid(), name: '紫菜虾皮汤', category: '汤品', desc: '鲜美爽口', image: img('seaweed-shrimp-soup'), available: true },
    { id: uid(), name: '米饭', category: '主食', desc: '一碗', image: img('steamed-rice'), available: true }
  ];
}

function uid() {
  return crypto.randomBytes(4).toString('hex');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- HTTP 辅助 ----------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// 过滤出仍在保留期内的订单（超过 ORDER_RETENTION_DAYS 天的自动清除）
function pruneExpiredOrders(orders) {
  const cutoff = Date.now() - ORDER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return !isNaN(t) && t >= cutoff;
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- 业务接口 ----------
async function handleApi(req, res, url) {
  // 健康检查（托管平台探测用）
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, uptime: process.uptime() });
  }
  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};

  // 菜单
  if (req.method === 'GET' && url.pathname === '/api/menu') {
    return sendJson(res, 200, { ok: true, menu: readJson(MENU_FILE, []) });
  }
  if (req.method === 'POST' && url.pathname === '/api/menu') {
    const menu = readJson(MENU_FILE, []);
    const item = normalizeMenuItem(body);
    if (!item.name) return sendJson(res, 400, { ok: false, error: '菜名不能为空' });
    item.id = uid();
    menu.push(item);
    writeJson(MENU_FILE, menu);
    return sendJson(res, 200, { ok: true, item });
  }
  let m = url.pathname.match(/^\/api\/menu\/([\w-]+)$/);
  if (m && req.method === 'PUT') {
    const menu = readJson(MENU_FILE, []);
    const idx = menu.findIndex((x) => x.id === m[1]);
    if (idx < 0) return sendJson(res, 404, { ok: false, error: '菜品不存在' });
    const cur = menu[idx];
    // 仅覆盖本次提交的字段，未提交的字段（含图片）保留原值
    if (body.name !== undefined && String(body.name).trim()) cur.name = String(body.name).trim();
    if (body.category !== undefined) cur.category = String(body.category).trim() || '其他';
    if (body.desc !== undefined) cur.desc = String(body.desc).trim();
    if (body.image !== undefined) cur.image = String(body.image).trim();
    if (body.available !== undefined) cur.available = !!body.available;
    writeJson(MENU_FILE, menu);
    return sendJson(res, 200, { ok: true, item: cur });
  }
  if (m && req.method === 'DELETE') {
    let menu = readJson(MENU_FILE, []);
    menu = menu.filter((x) => x.id !== m[1]);
    writeJson(MENU_FILE, menu);
    return sendJson(res, 200, { ok: true });
  }

  // 订单
  if (req.method === 'GET' && url.pathname === '/api/orders') {
    let orders = pruneExpiredOrders(readJson(ORDERS_FILE, []));
    writeJson(ORDERS_FILE, orders);
    orders = orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendJson(res, 200, { ok: true, orders });
  }
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    const person = String(body.person || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!person) return sendJson(res, 400, { ok: false, error: '请填写点菜人称呼' });
    if (items.length === 0) return sendJson(res, 400, { ok: false, error: '请先选择菜品' });
    const cleanItems = items.map((it) => ({
      menuId: String(it.menuId || ''),
      name: String(it.name || '').trim(),
      price: Number(it.price) || 0,
      qty: Math.max(1, Number(it.qty) || 1),
      note: String(it.note || '').trim()
    })).filter((it) => it.name);
    if (cleanItems.length === 0) return sendJson(res, 400, { ok: false, error: '请先选择菜品' });

    let orders = pruneExpiredOrders(readJson(ORDERS_FILE, []));
    const order = {
      id: uid(),
      person,
      items: cleanItems,
      status: 'pending', // pending | done | canceled
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    writeJson(ORDERS_FILE, orders);
    return sendJson(res, 200, { ok: true, order });
  }
  m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
  if (m && req.method === 'PATCH') {
    const orders = readJson(ORDERS_FILE, []);
    const idx = orders.findIndex((x) => x.id === m[1]);
    if (idx < 0) return sendJson(res, 404, { ok: false, error: '订单不存在' });
    if (['pending', 'done', 'canceled'].includes(body.status)) orders[idx].status = body.status;
    writeJson(ORDERS_FILE, orders);
    return sendJson(res, 200, { ok: true, order: orders[idx] });
  }
  if (m && req.method === 'DELETE') {
    let orders = readJson(ORDERS_FILE, []);
    orders = orders.filter((x) => x.id !== m[1]);
    writeJson(ORDERS_FILE, orders);
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { ok: false, error: '接口不存在' });
}

function normalizeMenuItem(body) {
  return {
    name: String(body.name || '').trim(),
    category: String(body.category || '其他').trim() || '其他',
    desc: String(body.desc || '').trim(),
    image: String(body.image || '').trim(),
    available: body.available === undefined ? true : !!body.available
  };
}

// ---------- 启动 ----------
ensureData();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res);
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`家庭点菜服务已启动：http://localhost:${PORT}`);
  console.log(`订单保留最近 ${ORDER_RETENTION_DAYS} 天，超期自动清理`);
});
