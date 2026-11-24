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
  else seedMenu();
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
}

// 启动时按菜名补缺：补入新增菜品；为已有菜品补齐缺失的做法，不覆盖用户改动
function seedMenu() {
  const menu = readJson(MENU_FILE, []);
  const seeds = defaultMenu();
  let changed = false;
  seeds.forEach((s) => {
    const exist = menu.find((x) => x.name === s.name);
    if (!exist) { menu.push(s); changed = true; }
    else if (!exist.recipe && s.recipe) { exist.recipe = s.recipe; changed = true; }
  });
  if (changed) writeJson(MENU_FILE, menu);
}

function defaultMenu() {
  const img = (slug) => '/images/' + slug + '.jpg';
  const defs = [
    { name: '番茄炒蛋', category: '家常菜', desc: '酸甜适口', slug: 'tomato-egg', recipe: '番茄切块，鸡蛋加少许盐打散；\n热锅倒油，蛋液下锅炒至凝固盛出；\n底油下番茄翻炒出汁，加少许糖和盐调味；\n倒回鸡蛋翻匀，撒葱花出锅。' },
    { name: '红烧肉', category: '家常菜', desc: '肥而不腻', slug: 'braised-pork', recipe: '五花肉切块，冷水下锅加料酒焯水去腥，捞出洗净；\n热锅炒糖色，下肉块翻炒上色；\n加姜片、八角、生抽、老抽和热水没过肉；\n小火炖 40 分钟至软烂，大火收汁即可。' },
    { name: '可乐鸡翅', category: '家常菜', desc: '微甜', slug: 'cola-chicken-wings', recipe: '鸡翅两面划刀，冷水焯水捞出；\n热油煎鸡翅至两面金黄；\n倒入可乐没过鸡翅，加生抽、姜片；\n中火焖 15 分钟，大火收浓汤汁。' },
    { name: '宫保鸡丁', category: '家常菜', desc: '香辣花生', slug: 'kung-pao-chicken', recipe: '鸡胸肉切丁，用料酒、生抽、淀粉抓匀腌制；\n调碗汁：生抽、醋、糖、淀粉和少许水；\n热油炒香干辣椒、花椒，下鸡丁滑散；\n加花生米、葱段，淋碗汁翻匀出锅。' },
    { name: '青椒肉丝', category: '家常菜', desc: '咸鲜爽口', slug: 'shredded-pork-pepper', recipe: '猪里脊切丝，加生抽、淀粉、油抓匀；\n青椒切丝，葱姜切末；\n热油滑炒肉丝至变色盛出；\n底油炒青椒，倒回肉丝，加盐、生抽翻炒入味。' },
    { name: '鱼香肉丝', category: '家常菜', desc: '酸甜微辣', slug: 'fish-flavored-pork', recipe: '肉丝腌制滑散盛出；木耳、笋丝、青椒切丝；\n调鱼香汁：生抽、醋、糖、豆瓣酱、淀粉水；\n炒香豆瓣酱和葱姜蒜，下配菜丝翻炒；\n倒回肉丝，淋鱼香汁炒匀。' },
    { name: '麻婆豆腐', category: '家常菜', desc: '麻辣嫩滑', slug: 'mapo-tofu', recipe: '嫩豆腐切块，盐水浸泡备用；\n热油炒香肉末、豆瓣酱、辣椒面；\n加汤水，下豆腐小火煮几分钟；\n分两次淋水淀粉勾芡，撒花椒面、葱花。' },
    { name: '酸辣土豆丝', category: '家常菜', desc: '脆爽开胃', slug: 'spicy-potato-shreds', recipe: '土豆切丝，泡水洗去淀粉，沥干；\n热油爆香干辣椒、花椒、蒜末；\n下土豆丝大火快炒；\n烹醋，加盐、鸡精，翻匀出锅。' },
    { name: '清蒸鲈鱼', category: '家常菜', desc: '鲜嫩清淡', slug: 'steamed-bass', recipe: '鲈鱼处理干净，两面划刀，抹盐和料酒，铺葱姜；\n水开后上锅大火蒸 8 分钟；\n倒掉蒸鱼汁水，拣去旧葱姜；\n铺新葱丝姜丝，淋热油，浇生抽。' },
    { name: '蒜蓉西兰花', category: '家常菜', desc: '清爽素菜', slug: 'broccoli-garlic', recipe: '西兰花切小朵，盐水浸泡后焯水；\n热油爆香蒜蓉；\n下西兰花翻炒，加盐、少许鸡精；\n翻匀即可出锅。' },
    { name: '红烧排骨', category: '家常菜', desc: '酱香入味', slug: 'braised-ribs', recipe: '排骨冷水下锅焯水，捞出洗净；\n炒糖色下排骨翻炒上色；\n加姜片、八角、生抽、老抽和热水；\n小火炖 40 分钟，大火收汁。' },
    { name: '水蒸蛋', category: '家常菜', desc: '滑嫩入口', slug: 'steamed-egg', recipe: '鸡蛋打散，加 1.5 倍温水和少许盐搅匀；\n过筛去浮沫，盖保鲜膜扎孔；\n水开后中火蒸 10 分钟；\n淋生抽、香油，撒葱花。' },
    { name: '清炒时蔬', category: '素菜', desc: '当日新鲜蔬菜', slug: 'stir-fried-greens', recipe: '时蔬洗净切段，蒜切片；\n热油爆香蒜片；\n下蔬菜大火快炒；\n加盐调味，翻匀出锅。' },
    { name: '西红柿蛋汤', category: '汤品', desc: '清淡暖胃', slug: 'tomato-egg-soup', recipe: '西红柿切块，鸡蛋打散；\n底油炒番茄出汁，加水烧开；\n淋入蛋液形成蛋花；\n加盐、香油，撒葱花。' },
    { name: '紫菜虾皮汤', category: '汤品', desc: '鲜美爽口', slug: 'seaweed-shrimp-soup', recipe: '碗中放紫菜、虾皮、葱花、生抽、香油；\n锅中水烧开；\n冲入碗中，搅匀即可。' },
    { name: '米饭', category: '主食', desc: '一碗', slug: 'steamed-rice', recipe: '大米淘洗两遍；\n加水，水面约高出一指节；\n电饭锅煮饭档，跳档后焖 10 分钟再开盖。' },
    { name: '蒜苗炒腊肉', category: '家常菜', desc: '咸香下饭', slug: 'garlic-sprout-bacon', recipe: '腊肉蒸熟切薄片，蒜苗切段；\n热油下腊肉煸炒出油、炒香；\n下蒜苗白段翻炒，再放叶段；\n加少许生抽、糖调味，翻匀出锅。' },
    { name: '香菇滑鸡', category: '家常菜', desc: '嫩滑鲜香', slug: 'mushroom-chicken', recipe: '鸡腿肉切块，用生抽、料酒、淀粉、油腌制；\n香菇泡发切块，姜蒜切末；\n热油炒香姜蒜，下鸡块滑炒至变色；\n加香菇和少许水焖几分钟，加盐收汁。' },
    { name: '干煸豆角', category: '家常菜', desc: '焦香微辣', slug: 'dry-fried-beans', recipe: '豆角洗净掰段，沥干；\n多油煸至豆角起皱、表皮焦斑，盛出；\n底油炒香肉末、干辣椒、蒜；\n倒回豆角，加盐、生抽、花椒面翻匀。' },
    { name: '剁椒鱼头', category: '家常菜', desc: '鲜辣过瘾', slug: 'chopped-chili-fish-head', recipe: '鱼头洗净劈开，抹料酒盐，铺姜片；\n铺满剁椒，水开上锅蒸 10 分钟；\n倒掉汁水，铺葱花蒜末；\n淋热油炝香，浇生抽。' },
    { name: '蒜蓉空心菜', category: '素菜', desc: '蒜香脆嫩', slug: 'water-spinach-garlic', recipe: '空心菜洗净切段，蒜切末；\n热油爆香大部分蒜蓉；\n下空心菜大火快炒至塌软；\n加盐、生抽，放剩余蒜末翻匀出锅。' },
    { name: '冬瓜排骨汤', category: '汤品', desc: '清淡滋补', slug: 'winter-melon-pork-soup', recipe: '排骨焯水洗净；冬瓜去皮切块；\n排骨加姜片、热水，小火炖 30 分钟；\n下冬瓜继续炖 15 分钟至透明；\n加盐、白胡椒，撒葱花。' },
    { name: '蛋炒饭', category: '主食', desc: '粒粒分明', slug: 'fried-rice', recipe: '冷米饭打散，鸡蛋加盐打散；\n热油炒蛋划散盛出；\n底油下米饭炒散，可加胡萝卜丁、葱花；\n倒回鸡蛋，加盐、生抽翻匀。' },
    { name: '葱油拌面', category: '主食', desc: '葱香浓郁', slug: 'scallion-oil-noodles', recipe: '小葱切段，热油小火炸葱段至焦香，得葱油；\n碗中放生抽、老抽、糖、少许葱油；\n面条煮熟捞出，舀面汤化开调料；\n浇葱油，撒酥葱拌匀。' }
  ];
  return defs.map((d) => ({
    id: uid(), name: d.name, category: d.category, desc: d.desc,
    image: img(d.slug), recipe: d.recipe, available: true
  }));
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
    if (body.recipe !== undefined) cur.recipe = String(body.recipe).trim();
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
    recipe: String(body.recipe || '').trim(),
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
