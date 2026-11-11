# 果小铺 · 水果电商静态演示原型

10 种水果可浏览、可加购改量、可下单，订单可**刷新后按单号或最近订单列表查回**。
不用数据库、不用后端、不用构建：订单存在浏览器 `localStorage` 里，金额全程按整数分计算。
应用代码只有 [`index.html`](index.html) 一个文件，零外部请求。

## Docker 运行（推荐）

需要 Docker Desktop 或 Docker Engine + Compose v2。在仓库根目录执行：

```bash
git clone https://github.com/sheerslee/fruit.git
cd fruit
docker compose up -d --build
```

打开 <http://localhost:8080>。

验证容器确实在跑：

```bash
curl -fsS http://localhost:8080/ | grep "果小铺"
docker inspect --format='{{.State.Health.Status}}' fruit-shop
```

第二条应输出 `healthy`。停止并清理：

```bash
docker compose down
```

如果只有 `docker` 没有 Compose 插件，用等价的两条命令：

```bash
docker build -t fruit-shop:local .
docker run -d --name fruit-shop -p 8080:80 --restart unless-stopped fruit-shop:local
```

停止：`docker rm -f fruit-shop`。

## 不用 Docker

直接双击 `index.html` 用 `file://` 打开即可，功能一致。需要 HTTP 环境时：
`python -m http.server 8000`，然后访问 <http://localhost:8000>。

## 演示动线

1. 「今日鲜果」挑水果，点「加入购物车」（共 10 种）。
2. 「购物车与结算」用 `+ / −` 改数量（1–99），核对合计。
3. 填姓名 / 11 位手机号 / 收货地址（至少 5 字），点「提交订单」。
4. 记下成功态的订单号（形如 `FS20261110-0001`），可点「复制订单号」或「查这一单」。
5. **刷新页面** —— 这是核心验收：订单跨刷新仍在。
6. 「订单查询」粘贴单号，或直接点「最近订单」任意一行，核对金额、商品快照、收货人与下单时间。

页内还有「运行自测」按钮（14 条纯逻辑与存储往返自检），空态 / 校验错误 / 成功 / 未命中都有可见文案。

## 数据边界（重要）

- 订单只存在**当前浏览器的当前站点**下，换设备、换浏览器、清缓存即失效。
- 隐私模式或禁用存储时，页面会明确提示「本次刷新后订单不再保留」，此时订单仅在当前会话有效（内存降级）。
- 复位演示数据：浏览器控制台执行 `localStorage.removeItem('fruit-shop:orders:v1')` 后刷新。
- 订单里的商品名称与单价是**下单瞬间的快照**，之后改目录不会影响历史订单。

## 质量验证

```bash
node tests/qa-fruit-shop-runner.mjs
```

输出 JSON：共 21 条用例（Unit 8 / Integration 6 / E2E 1 / Static 2 / Exploratory 4），
`failed` 必须为 0，退出码非 0 表示失败。驱动器用 Node 内置 `vm` + 极简 DOM stub
驱动真实点击与提交链路，不需要浏览器或测试框架；需要 Node.js 18+。

每次 push 到 `main` 都会触发 [`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml)：
在 GitHub Actions 的 ubuntu runner 上真实执行 `docker build` → `docker run` → HTTP 冒烟 → 健康检查，
再跑上面这 21 条用例。可在仓库的 Actions 页查看每次构建结果。

## 目录

| 文件 | 作用 |
|---|---|
| `index.html` | 唯一应用代码（HTML/CSS/JS 内嵌） |
| `Dockerfile` / `nginx.conf` / `docker-compose.yml` / `.dockerignore` | 容器交付 |
| `tests/` | 21 条 QA 用例与驱动器 |
| `.github/workflows/docker-build.yml` | 云端 Docker 构建与冒烟验证 |
