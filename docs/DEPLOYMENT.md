# 生产部署

本项目提供浏览器页面和常驻 Node 房间服务。PVE 在客户端运行；PVP 需要同源 `/ws` WebSocket，不能只把 `dist/` 上传到静态托管平台。

## 运行约定

| 项目 | 设置 |
|---|---|
| Node | 24 LTS，见 `.nvmrc`；最低22.12 |
| 入口 | `npm start` 或 `node --import tsx server/index.ts` |
| `PORT` | 默认8787，可由平台注入 |
| `HOST` | 默认0.0.0.0；同机反代时可设127.0.0.1 |
| 静态文件 | 构建后的 `dist/`，路径由服务器源码位置定位 |
| 健康检查 | `GET /healthz`；服务及构建可用时返回200，缺少构建时返回503 |
| WebSocket | `/ws`，HTTPS页面自动使用WSS |
| 副本数量 | **1个常驻进程**，关闭按请求扩缩容和自动休眠 |
| 站点路径 | 独立域名根路径，例如 `https://game.example.com/` |

Node 24 的生产选择依据 [Node.js 发布与支持周期](https://nodejs.org/en/about/previous-releases)。

**PVP房间只存在进程内存中。** 重启、崩溃或更换版本会结束现有房间，房间码无法恢复进度；PVE本机存档不受服务更新影响。部署前应等待联机对局结束。当前版本没有账号系统、跨实例共享房间或服务器持久化；负载均衡的多个实例会造成同一个房间码在不同实例无法访问。客户端接收整份房间游戏状态，因此折叠其他玩家HUD仅是界面展示规则。

## Node 部署

从Git中选择已通过CI的提交，在新发布目录构建：

```bash
npm ci
npm run build
npm test
npm audit --audit-level=moderate
npm prune --omit=dev
npm run smoke:production
NODE_ENV=production HOST=127.0.0.1 PORT=8787 npm start
```

构建需要开发依赖，因此不能在构建前执行 `npm ci --omit=dev`。构建完成后，运行服务只需生产依赖、`package.json`、`dist/`、`server/` 和 `src/game/`。`tsx`属于生产依赖。使用进程管理器保持服务运行并转存标准输出/错误日志，终止时发送SIGTERM；服务会关闭连接和计时器。启动失败应检查端口、Node版本、依赖和构建是否完整。

`smoke:production` 会用随机可用端口临时启动本机服务，检查实际构建和WebSocket握手，再发送SIGTERM并验证退出；不会接管8787上的已有对局。也可运行 `npm run smoke:production -- https://game.example.com` 检查已部署实例；它只进行HTTP读取和一次无房间的WebSocket握手。

## Docker 部署

仓库提供多阶段Dockerfile，以非root用户运行。构建镜像时固定当前发布提交，镜像标签使用该提交的SHA，便于回滚：

```bash
docker build -t prism-days:release .
docker run -d --name prism-days --restart unless-stopped \
  -p 127.0.0.1:8787:8787 prism-days:release
docker inspect --format '{{.State.Health.Status}}' prism-days
```

上例仅发布到宿主机回环接口，配合同机HTTPS反代。托管平台直接承接容器入口时，可使用平台提供的端口映射和 `PORT`，容器内保持 `HOST=0.0.0.0`。

## HTTPS 与反向代理

应用和WebSocket使用同一个域名。以下Nginx片段放在已经配置域名和TLS证书的 `server` 块中；证书由运行者的现有部署流程维护：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

容器或Node端口应由反代或托管平台接入。不要用 `vite preview` 或开发服务器作为生产房间服务。此仓库的CI只构建并检查，不自动发布到公网、申请域名或改动现有服务器。

## 发布与回滚

1. 确认PR所指提交的CI全部通过，记录合入后的main提交SHA。
2. 在新目录或新镜像中完成构建，保留上一版部署产物。
3. 等待现有联机对局结束后切换版本；更新期间房间不能跨进程迁移。
4. 验证HTTPS首页、JS/CSS及 `/healthz`，并用两个浏览器创建/加入房间、准备、掷骰和刷新重连。
5. 如需回滚，停止新实例，重新启动上一版目录/镜像，并确认健康检查；回滚同样不能恢复已结束的内存房间。

仅HTTP健康通过不代表公网WSS代理已正确配置；首次部署必须在最终域名上完成双客户端联机检查。
