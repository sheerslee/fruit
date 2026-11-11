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

### 国内网络拉不到 Docker Hub 时

如果 `docker compose up -d --build` 报 `failed to resolve source metadata for
docker.io/library/nginx:1.27-alpine` 或 `i/o timeout`，是 Docker Hub 不可达，不是代码问题。
用环境变量把基础镜像换到可直连的镜像源：

```bash
BASE_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine docker compose up -d --build
```

先测源是否在线（返回 `401` 是正常的，表示 registry 在响应）：

```bash
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" https://docker.m.daocloud.io/v2/
```

备用源任选其一，三者提供的是同一份 `nginx:1.27-alpine` 镜像（manifest digest 一致）：

```bash
BASE_IMAGE=docker.1ms.run/library/nginx:1.27-alpine docker compose up -d --build
BASE_IMAGE=hub.rat.dev/library/nginx:1.27-alpine docker compose up -d --build
```

`Dockerfile` 的默认值没有改，所以 GitHub Actions 云端构建仍走 Docker Hub 官方地址。
不想改任何文件时，也可以先预拉镜像再打上官方 tag 后重跑：

```bash
docker pull docker.m.daocloud.io/library/nginx:1.27-alpine
docker tag docker.m.daocloud.io/library/nginx:1.27-alpine nginx:1.27-alpine
docker compose up -d --build
```

### WSL 报 `docker-credential-desktop.exe` 找不到

如果 `load metadata` 阶段报 `error getting credentials - err: exec:
"docker-credential-desktop.exe": executable file not found in $PATH`，这既不是镜像源的问题，
也不是 `Dockerfile` 的问题：Docker 客户端配置里残留了 Docker Desktop 的凭据助手
`credsStore: desktop.exe`，而对应程序已随 Docker Desktop 卸载消失（常见于 WSL 里独立安装
Docker Engine 的场景）。`/usr/bin/docker-credential-desktop.exe` 往往只是一个失效的软链。

先确认（下面以 WSL 默认 root 用户为例，其他用户把 `/root` 换成自己的 HOME）：

```bash
ls -la /root/.docker/ && cat /root/.docker/config.json && (ls -l /usr/bin/docker-credential-desktop.exe 2>/dev/null || echo "helper missing or dead link")
```

看到 `"credsStore": "desktop.exe"` 且该 exe 是死链或不存在即可确诊。拉取公开镜像不需要
任何凭据，备份后去掉这个字段（用 python3 保留配置里的其余字段）：

```bash
cp /root/.docker/config.json /root/.docker/config.json.bak-fruit && python3 -c "import json,pathlib;p=pathlib.Path('/root/.docker/config.json');d=json.loads(p.read_text() or '{}');d.pop('credsStore',None);d.pop('credHelpers',None);p.write_text(json.dumps(d,indent=2)+'\n')" && cat /root/.docker/config.json
```

没有 python3 时的等价降级（配置只有 `auths` 和 `credsStore` 时直接覆盖即可）：

```bash
cp /root/.docker/config.json /root/.docker/config.json.bak-fruit && printf '{"auths": {}}\n' > /root/.docker/config.json && cat /root/.docker/config.json
```

不想动全局配置，也可以用一个干净的 `DOCKER_CONFIG` 目录临时绕开，先确认 compose 插件
在新目录下仍可用：

```bash
mkdir -p /root/.docker-fruit && printf '{}\n' > /root/.docker-fruit/config.json && DOCKER_CONFIG=/root/.docker-fruit docker compose version && DOCKER_CONFIG=/root/.docker-fruit BASE_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine docker compose up -d --build
```

回滚：`cp /root/.docker/config.json.bak-fruit /root/.docker/config.json`。

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
