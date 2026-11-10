// Fruit-shop full QA runner (21 cases).
// Usage (from repo root): node tests/qa-fruit-shop-runner.mjs [--smoke]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { makeStore, loadPage, extractScript, WS, HTML } from './qa-fruit-shop.mjs';

const SMOKE = process.argv.includes('--smoke');
const R = [];
const add = (layer, id, name, ok, detail, card) => R.push({ layer, id, name, ok: !!ok, detail: detail || '', card: card || '' });
const tick = () => new Promise((r) => setImmediate(r));

function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out); else out.push(p);
  }
  return out;
}

// ---------- Static gates ----------
const html = fs.readFileSync(HTML, 'utf8');
const script = extractScript(html);
let syntaxOk = true, syntaxErr = '';
try { new vm.Script(script, { filename: 'index.html:inline-script' }); }
catch (e) { syntaxOk = false; syntaxErr = e.message; }

// 实现文件门禁：只统计产品代码；tests/ 下的是测试驱动器，不计入实现文件数
const TESTS_DIR = path.join(WS, 'tests') + path.sep;
const implFiles = walkFiles(WS)
  .filter((p) => !p.startsWith(TESTS_DIR))
  .filter((p) => /\.(html|js|mjs|css|json)$/i.test(p) || /package\.json$/i.test(p));
const external = [...html.matchAll(/https?:\/\//gi)].map((m) => m[0]);
const innerHtml = (html.match(/innerHTML/g) || []).length;
const srcAttrs = (html.match(/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/gi) || []).length;
const labels = (html.match(/<label\s+for=/g) || []).length;
const focusVisible = html.includes(':focus-visible');
// 修正：原断言误把 `priceFen` 全文出现次数当商品数（脚本里该词共 14 处）。
// 改为读取实际 PRODUCTS 常量，逐条核对规格定价表与 id 唯一性（覆盖 AC-01 / AC-02）。
const PRICE_TABLE = { F01: 1280, F02: 650, F03: 990, F04: 3500, F05: 2800,
                      F06: 480, F07: 1580, F08: 1990, F09: 1150, F10: 4200 };
const catalogPage = loadPage(makeStore());
const PS = catalogPage.sandbox.FS.PRODUCTS;
const productsOk = PS.length === 10 && new Set(PS.map((p) => p.id)).size === 10 &&
  PS.every((p) => PRICE_TABLE[p.id] === p.priceFen);

add('Static', 'S1', '实现文件数 = 1 且脚本语法通过', implFiles.length === 1 && syntaxOk,
  'files=' + implFiles.map((p) => path.basename(p)).join(',') + '; syntax=' + (syntaxOk ? 'ok' : syntaxErr),
  'protects=单文件零依赖交付; fails_when=出现第二个实现文件或语法错误; no_claim=不证明所有浏览器兼容');
add('Static', 'S2', '零外链 / 零 innerHTML / label 关联 / focus-visible',
  external.length === 0 && innerHtml === 0 && srcAttrs === 0 && labels >= 3 && focusVisible && productsOk,
  'http=' + external.length + '; innerHTML=' + innerHtml + '; src/link=' + srcAttrs + '; labels=' + labels + '; focus-visible=' + focusVisible + '; products/prices=' + productsOk,
  'protects=零依赖与输出编码; fails_when=出现 CDN/外链/innerHTML 拼接; no_claim=不证明 CSP 配置');

if (SMOKE) {
  const p = loadPage(makeStore());
  const boot = p.el('catalogGrid').children.length === 10 && p.el('submitBtn').disabled === true;
  add('Smoke', 'BOOT', '页面启动：10 张卡片 + 空车禁用', boot, 'cards=' + p.el('catalogGrid').children.length + '; disabled=' + p.el('submitBtn').disabled);
  const st = p.sandbox.__fruitShopSelfTest();
  add('Smoke', 'SELFTEST', '页面内自测全绿', st.fail === 0, st.summary + (st.fail ? ' | ' + st.results.filter((x) => !x.ok).map((x) => x.name + ':' + x.detail).join('; ') : ''));
} else {
  // ---------- Unit + Integration: page-internal self test (14 checks) ----------
  const p0 = loadPage(makeStore());
  const st = p0.sandbox.__fruitShopSelfTest();
  const cardFor = (n) => 'protects=' + n + '; fails_when=断言失败或抛异常; no_claim=单元级验证，不替代真实点击链路';
  st.results.forEach((x, i) => {
    const layer = x.name.startsWith('U') ? 'Unit' : 'Integration';
    add(layer, layer === 'Unit' ? 'U' + (i + 1) : 'I' + (i - 7), x.name, x.ok, x.detail || 'ok', cardFor(x.name));
  });

  // ---------- E2E: one full demo use case ----------
  const e = [];
  const ck = (name, ok, detail) => e.push({ name, ok: !!ok, detail: detail || '' });
  const store = makeStore();
  let p = loadPage(store);
  const el = (id) => p.el(id);
  const addBtn = (id) => el('catalogGrid').descendants().find((n) => n.getAttribute('data-add') === id);
  const deltaBtn = (id, d) => el('cartList').descendants().find((n) => n.getAttribute('data-id') === id && n.getAttribute('data-delta') === String(d));

  ck('E2E-1 首屏 10 张卡片且空车提交禁用', el('catalogGrid').children.length === 10 && el('submitBtn').disabled === true,
    'cards=' + el('catalogGrid').children.length + '; disabled=' + el('submitBtn').disabled);
  ck('E2E-2 目录价格与规格表一致', el('catalogGrid').textContent.includes('¥12.80') && el('catalogGrid').textContent.includes('¥42.00') && el('catalogGrid').textContent.includes('红富士苹果'),
    'catalog text length=' + el('catalogGrid').textContent.length);
  addBtn('F04').click(); addBtn('F06').click();
  ck('E2E-3 加购两件，徽标 = 2', el('cartBadge').textContent === '购物车 2 件', el('cartBadge').textContent);
  deltaBtn('F04', 1).click(); deltaBtn('F06', 1).click(); deltaBtn('F06', 1).click();
  ck('E2E-4 改数量后合计 ¥84.40（整数分无尾数）', el('cartTotal').textContent === '¥84.40', el('cartTotal').textContent);
  for (let i = 0; i < 100; i++) deltaBtn('F06', 1).click();
  ck('E2E-5 数量上限钳制 99', el('cartTotal').textContent === fenOf(3500 * 2 + 480 * 99), el('cartTotal').textContent);
  for (let i = 0; i < 96; i++) deltaBtn('F06', -1).click();
  ck('E2E-6 减回 3 斤，金额恢复 ¥84.40', el('cartTotal').textContent === '¥84.40', el('cartTotal').textContent);
  deltaBtn('F04', -1).click(); deltaBtn('F04', -1).click();
  ck('E2E-6b 减到 0 移除该行，只剩西瓜 ¥14.40',
    el('cartList').children.length === 1 && el('cartTotal').textContent === '¥14.40',
    'rows=' + el('cartList').children.length + '; total=' + el('cartTotal').textContent);
  addBtn('F04').click(); addBtn('F04').click();
  ck('E2E-6c 重新加回 2 盒草莓，金额恢复 ¥84.40',
    el('cartList').children.length === 2 && el('cartTotal').textContent === '¥84.40',
    'rows=' + el('cartList').children.length + '; total=' + el('cartTotal').textContent);

  el('buyerName').value = '张三';
  el('buyerPhone').value = '13800138000';
  el('buyerAddress').value = '杭州市西湖区文三路 88 号';
  // 连点 5 次（AC-13）
  for (let i = 0; i < 5; i++) el('orderForm').submit();
  const raw = store.getItem('fruit-shop:orders:v1');
  const orders = raw ? JSON.parse(raw) : [];
  ck('E2E-7 连点 5 次只生成 1 单', orders.length === 1, 'orders=' + orders.length);
  const no = el('orderNo').textContent;
  ck('E2E-8 订单号 FSYYYYMMDD-0001', /^FS\d{8}-0001$/.test(no), no);
  ck('E2E-9 成功态可见', el('success').hidden === false, 'hidden=' + el('success').hidden);
  const snap = orders[0];
  const straw = snap && snap.items.find((i) => i.id === 'F04');
  const melon = snap && snap.items.find((i) => i.id === 'F06');
  ck('E2E-10 订单快照含名称 / 单价 / 数量 / 合计 / 收货人（按 id 查，不依赖插入顺序）',
    !!(straw && straw.name === '丹东草莓' && straw.priceFen === 3500 && straw.qty === 2 &&
       melon && melon.name === '麒麟西瓜' && melon.priceFen === 480 && melon.qty === 3 &&
       snap.totalFen === 8440 && snap.buyer.name === '张三' &&
       snap.status === 'created' && typeof snap.createdAt === 'string'),
    JSON.stringify(snap && snap.items));
  el('copyBtn').click(); await tick();
  ck('E2E-11 一键复制的文本就是订单号（无空格）', p.clipboardCalls[0] === no, 'copied=' + JSON.stringify(p.clipboardCalls[0]));
  el('gotoBtn').click();
  ck('E2E-12 「查这一单」回填并直达详情', el('queryInput').value === no && el('orderCard').hidden === false,
    'input=' + el('queryInput').value + '; cardHidden=' + el('orderCard').hidden);
  const recentRows = el('recentWrap').descendants().filter((n) => n.getAttribute('data-order'));
  ck('E2E-13 最近订单列表出现 1 行', recentRows.length === 1 && recentRows[0].getAttribute('data-order') === no, 'rows=' + recentRows.length);
  const emptyPage = loadPage(makeStore());
  ck('E2E-14 空存储时查询区显示「暂无订单」可见文案', emptyPage.el('recentWrap').textContent.includes('暂无订单，先去下一单吧'),
    emptyPage.el('recentWrap').textContent.slice(0, 60));

  // 刷新：同一 localStorage，全新页面实例
  let p2 = loadPage(store);
  const el2 = (id) => p2.el(id);
  ck('E2E-15 刷新后最近订单仍在', el2('recentWrap').descendants().filter((n) => n.getAttribute('data-order')).length === 1,
    'rows=' + el2('recentWrap').descendants().filter((n) => n.getAttribute('data-order')).length);
  el2('queryInput').value = no; el2('queryBtn').click();
  const cardText = el2('orderCard').textContent;
  ck('E2E-16 刷新后按号查回，金额 / 收货人 / 时间逐项一致',
    el2('orderCard').hidden === false && cardText.includes('¥84.40') && cardText.includes('张三') &&
    cardText.includes('13800138000') && cardText.includes('丹东草莓') && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(cardText),
    cardText.slice(0, 160));
  el2('queryInput').value = 'FS20261110-9999'; el2('queryBtn').click();
  ck('E2E-17 查询未命中显示明确文案且详情卡隐藏', el2('queryMsg').textContent.includes('未找到') && el2('orderCard').hidden === true,
    el2('queryMsg').textContent + '; hidden=' + el2('orderCard').hidden);
  el2('queryInput').value = '  ' + no.toLowerCase() + '  '; el2('queryBtn').click();
  ck('E2E-18 trim + 转大写后仍命中', el2('orderCard').hidden === false && el2('queryMsg').textContent.includes('已找到'),
    el2('queryMsg').textContent);
  el2('queryInput').value = no + '<script>'; el2('queryBtn').click();
  ck('E2E-18b 含非法字符按白名单过滤后不命中、不抛异常、无注入节点',
    el2('orderCard').hidden === true && el2('queryMsg').textContent.includes('未找到') &&
    el2('orderCard').descendants().filter((n) => n.tagName === 'SCRIPT').length === 0,
    el2('queryMsg').textContent);
  const row2 = el2('recentWrap').descendants().find((n) => n.getAttribute('data-order') === no);
  row2.click();
  ck('E2E-19 点击最近订单行回填并触发查询', el2('queryInput').value === no && el2('orderCard').hidden === false,
    'input=' + el2('queryInput').value);

  // 注入防御（AC-15）：新页面同 store，姓名/地址含 HTML
  let p3 = loadPage(store);
  addBtnFor(p3, 'F01').click();
  p3.el('buyerName').value = '<img src=x onerror=alert(1)>';
  p3.el('buyerPhone').value = '13900139000';
  p3.el('buyerAddress').value = '<img src=x onerror=alert(1)> 杭州市西湖区';
  p3.el('orderForm').submit();
  const no3 = p3.el('orderNo').textContent;
  p3.el('queryInput').value = no3; p3.el('queryBtn').click();
  const imgNodes = p3.el('orderCard').descendants().filter((n) => n.tagName === 'IMG');
  ck('E2E-20 注入串按文本渲染，DOM 无 img 节点', imgNodes.length === 0 && p3.el('orderCard').textContent.includes('<img src=x onerror=alert(1)>'),
    'imgNodes=' + imgNodes.length + '; textKept=' + p3.el('orderCard').textContent.includes('<img src=x onerror=alert(1)>'));
  ck('E2E-21 同日第 2 单序号 -0002', /-0002$/.test(no3), no3);

  // 校验失败定位（AC-07）
  const store4 = makeStore();
  let p4 = loadPage(store4);
  addBtnFor(p4, 'F02').click();
  p4.el('buyerName').value = '';
  p4.el('buyerPhone').value = '123';
  p4.el('buyerAddress').value = '短';
  p4.el('orderForm').submit();
  ck('E2E-22 三项校验拦下并聚焦首个错误字段、不落库',
    p4.el('errName').textContent.includes('姓名') && p4.doc.focused === p4.el('buyerName') &&
    store4.getItem('fruit-shop:orders:v1') === null,
    'errName=' + p4.el('errName').textContent + '; focused=' + (p4.doc.focused && p4.doc.focused.id) + '; stored=' + store4.getItem('fruit-shop:orders:v1'));
  ck('E2E-23 控制台零报错', p.logs.filter((l) => l.startsWith('ERROR')).length === 0 && p2.logs.filter((l) => l.startsWith('ERROR')).length === 0,
    'errors=' + p.logs.concat(p2.logs).filter((l) => l.startsWith('ERROR')).join('|'));

  const eOk = e.every((x) => x.ok);
  add('E2E', 'E2E-1', '完整演示用例（浏览→加购→改量→填表→提交→复制→刷新→查回→未命中→列表点选→注入防御）',
    eOk, e.length + ' 个断言，' + e.filter((x) => x.ok).length + ' 通过' + (eOk ? '' : '；失败：' + e.filter((x) => !x.ok).map((x) => x.name + '(' + x.detail + ')').join('; ')),
    'protects=三条主流程可当场演示; fails_when=任一环节断链; no_claim=不证明跨设备 / 多标签并发');

  // ---------- Exploratory probes（/qa Phase 1-6 基线外，不占计划 17 条） ----------
  const dp = (() => { const d = new Date(); return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); })();
  const goodOrder = (n) => ({
    orderNo: 'FS' + dp + '-' + String(n).padStart(4, '0'),
    createdAt: new Date().toISOString(),
    items: [{ id: 'F01', name: '红富士苹果', priceFen: 1280, unit: '斤', qty: 1, subtotalFen: 1280 }],
    totalFen: 1280,
    buyer: { name: '李四', phone: '13900139000', address: '杭州市西湖区文三路 88 号' },
    status: 'created'
  });
  const fill = (page, name, phone) => {
    page.el('buyerName').value = name;
    page.el('buyerPhone').value = phone;
    page.el('buyerAddress').value = '杭州市西湖区文三路 88 号';
  };

  // EX-1 跳号/重号历史单后的避碰（adversarial F1 的真实点击链路验证）
  const seed1 = makeStore({ 'fruit-shop:orders:v1': JSON.stringify([goodOrder(1), goodOrder(5)]) });
  const px1 = loadPage(seed1);
  px1.el('catalogGrid').descendants().find((n) => n.getAttribute('data-add') === 'F02').click();
  fill(px1, '王五', '13700137000');
  px1.el('orderForm').submit();
  add('Exploratory', 'EX-1', '历史单跳号时新单取最大序号 +1（-0006），不撞号',
    /-0006$/.test(px1.el('orderNo').textContent), px1.el('orderNo').textContent,
    'protects=撞号不静默换单; fails_when=生成 -0003 或 -0002; no_claim=不覆盖跨设备唯一');

  // EX-2 file:// 下剪贴板 API 缺失时的降级文案
  const px2 = loadPage(makeStore(), { noClipboard: true });
  px2.el('catalogGrid').descendants().find((n) => n.getAttribute('data-add') === 'F03').click();
  fill(px2, '赵六', '13600136000');
  px2.el('orderForm').submit();
  px2.el('copyBtn').click(); await tick();
  add('Exploratory', 'EX-2', '剪贴板不可用时给出可行动的手动复制指引',
    px2.el('copyHint').textContent.includes('手动选中'), px2.el('copyHint').textContent,
    'protects=复制失败不静默; fails_when=按钮无反馈; no_claim=不证明所有浏览器剪贴板可用');

  // EX-3 写路径降级：真实点击下单 → 内存可查 → 刷新按预期查不到且已告知
  const s3 = makeStore();
  s3.setItem = function () { throw new Error('QuotaExceededError'); };
  const px3 = loadPage(s3);
  px3.el('catalogGrid').descendants().find((n) => n.getAttribute('data-add') === 'F04').click();
  fill(px3, '钱七', '13500135000');
  px3.el('orderForm').submit();
  const no3x = px3.el('orderNo').textContent;
  px3.el('queryInput').value = no3x; px3.el('queryBtn').click();
  const memoryHit = px3.el('orderCard').hidden === false;
  const warned = px3.el('successMsg').textContent.includes('不再保留');
  const px3b = loadPage(s3);
  px3b.el('queryInput').value = no3x; px3b.el('queryBtn').click();
  const lostAfterRefresh = px3b.el('orderCard').hidden === true;
  add('Exploratory', 'EX-3', '写路径抛异常：本会话可查 + 成功态明确警示 + 刷新后按预期查不到',
    memoryHit && warned && lostAfterRefresh,
    'memoryHit=' + memoryHit + '; warned=' + warned + '; lostAfterRefresh=' + lostAfterRefresh,
    'protects=降级不误导用户; fails_when=仍宣称刷新可查; no_claim=不证明配额满场景');

  // EX-4 金额矛盾的畸形单被跳过并计数
  const bad = goodOrder(1); bad.totalFen = 9999;
  const s4 = makeStore({ 'fruit-shop:orders:v1': JSON.stringify([bad, goodOrder(2)]) });
  const px4 = loadPage(s4);
  const rows4 = px4.el('recentWrap').descendants().filter((n) => n.getAttribute('data-order'));
  add('Exploratory', 'EX-4', '金额与明细不一致的畸形单被跳过并可见提示，列表只剩 1 行',
    rows4.length === 1 && px4.el('storageNotice').textContent.includes('1 条订单数据异常'),
    'rows=' + rows4.length + '; notice=' + px4.el('storageNotice').textContent.slice(0, 60),
    'protects=篡改存储不显示矛盾金额; fails_when=坏条进入列表; no_claim=不证明数据可自动修复');
}

function fenOf(f) { return '¥' + (f / 100).toFixed(2); }
function addBtnFor(page, id) { return page.el('catalogGrid').descendants().find((n) => n.getAttribute('data-add') === id); }

// loadPage 是唯一入口；store 由调用方持有，用于刷新与未落库断言
const summary = {
  mode: SMOKE ? 'smoke' : 'full',
  total: R.length,
  passed: R.filter((x) => x.ok).length,
  failed: R.filter((x) => !x.ok).length,
  results: R
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.failed ? 1 : 0;
