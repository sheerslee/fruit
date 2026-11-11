# 果小铺 —— 单文件静态电商 demo 的容器镜像
# 应用代码只有 index.html，镜像内用 nginx 提供静态服务。

# 基础镜像可通过 build-arg 覆盖：国内网络拉不到 Docker Hub 时，用
# BASE_IMAGE=<镜像源>/library/nginx:1.27-alpine 指向可直连的加速源。
# 默认值仍是 Docker Hub 官方地址，GitHub Actions 云端构建走这条。
ARG BASE_IMAGE=nginx:1.27-alpine
FROM ${BASE_IMAGE}

# 站点配置：显式 UTF-8、禁用缓存（demo 每次刷新都拿最新页面）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 唯一的应用代码
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80

# 容器级健康检查：CI 与 docker compose 都会用到
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
