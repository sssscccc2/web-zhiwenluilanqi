# Web 指纹浏览器 (web-zhiwenluilanqi)

一个类似比特浏览器的 **Web 端指纹浏览器管理系统**，通过网页控制和显示多个隔离的浏览器实例，每个实例拥有独立的指纹、代理和用户数据。

## 功能特性

- **比特浏览器风格** — 表格式管理界面，支持批量操作
- **CloakBrowser 引擎** — C++ 源码级指纹伪装，非 JS 注入，无法被检测
- **OS 平台选择** — Windows / macOS / Linux 三选一，指纹自动匹配
- **SOCKS5/HTTP 代理** — 支持认证代理，自动创建本地中转绕过 Chromium 限制
- **IP 地理位置匹配** — 根据代理出口 IP 自动匹配语言、时区、经纬度
- **全面防泄露** — DNS 强制走代理、禁用 QUIC/HTTP3、WebRTC 防泄露
- **Web 远程控制** — 通过 noVNC 在网页内直接操作浏览器
- **剪贴板互通** — 本地和远程浏览器之间的复制粘贴同步
- **文件管理器** — 支持上传/下载/预览图片视频/新建文件夹

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器引擎 | CloakBrowser (C++ 源码级 Chromium 145) |
| 虚拟显示 | Xvfb + fluxbox |
| VNC | x11vnc + noVNC (esbuild 打包) |
| 代理中转 | socks 库 (本地 SOCKS5 relay) |

## ⚠️ SOCKS5 代理注意事项（重要）

使用 SOCKS5 代理时，以下因素会导致被网站（如 Reddit、Facebook）检测到代理：

### 已内置防护

| 风险 | 说明 | 防护措施 |
|---|---|---|
| **DNS 泄露** | Chrome 默认本地解析 DNS，暴露真实服务器 IP | `--host-resolver-rules` 强制 DNS 走 SOCKS5 |
| **QUIC/HTTP3 回退** | SOCKS5 仅支持 TCP，Chrome 尝试 UDP QUIC 失败后回退，可被检测 | `--disable-quic` 禁用 |
| **WebRTC 泄露** | WebRTC 使用 UDP STUN 请求绕过 TCP 代理，暴露真实 IP | `--webrtc-ip-handling-policy=disable_non_proxied_udp` |
| **浏览器自动化痕迹** | CDP/Playwright 协议留下 `navigator.webdriver` 等痕迹 | CloakBrowser 独立进程，零 CDP 连接 |

### 需要你自己注意

| 风险 | 说明 | 建议 |
|---|---|---|
| **IP 类型 (ASN)** | 数据中心 IP 的 ASN 标记为"企业/托管"，一查即知 | **必须使用住宅代理 (Residential)**，不要用机房 IP |
| **IP 信誉** | 被滥用过的 IP 已被标记在 IPQS/MaxMind 黑名单 | 用 [ipqualityscore.com](https://ipqualityscore.com) 查询 IP 信誉分 |
| **TCP TTL 不匹配** | 服务器 Linux (TTL=64)，浏览器声称 Windows (TTL=128) | 好的代理商会在网络层修改 TTL，廉价代理不会 |
| **延迟三角测量** | RTT 过高暴露中间节点 | 选择低延迟代理 (<50ms)，避免多层隧道 |
| **MTU/MSS 异常** | VPN 隧道的 MTU (1300) 与正常网络 (1500) 不同 | 不要在代理上面再套 VPN |
| **开放端口** | 代理常见端口 1080/8080/3128 开放说明是代理 | 好的代理商会关闭这些端口 |
| **手机号与 IP 地区** | 注册时手机号国家与代理 IP 国家不一致 | 手机号和 IP 必须同一地区 |

### 推荐代理选择

```
✅ 住宅代理 (Residential) — 如 DataImpulse、IPRoyal、Bright Data
✅ 静态住宅 IP (Sticky Session) — 保持同一 IP 至少 30 分钟
✅ ISP 代理 — 数据中心速度 + 住宅 ASN

❌ 机房代理 (Datacenter) — ASN 立刻暴露
❌ 免费公共代理 — 已在所有黑名单中
❌ 频繁轮换 IP — 同一账号短时间换 IP 是明确风险信号
```

### DataImpulse 代理配置示例

```
格式: socks5://用户名:密码@gw.dataimpulse.com:端口

端口选择:
  10000 = 美国住宅 IP
  10001 = 随机国家住宅 IP

Sticky Session（推荐）:
  用户名后加 _session-随机数_lifetime-30m
  例: user123_session-abc456_lifetime-30m
  确保 30 分钟内保持同一 IP
```

### IP 检测工具

启动浏览器后访问以下网站检查代理效果：

- `browserleaks.com/ip` — IP 信誉 + ASN 类型
- `browserleaks.com/webrtc` — WebRTC 泄露检测
- `browserleaks.com/dns` — DNS 泄露检测
- `ipleak.net` — 综合泄露检测
- `ipqualityscore.com` — IP 欺诈评分

## 快速部署

> 详细的部署步骤请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

```bash
# 1. 安装系统依赖
apt update && apt install -y xvfb x11vnc fluxbox xdotool imagemagick python3-pip
pip3 install websockify

# 2. 安装项目依赖
cd fingerprint-browser
npm install

# 3. 构建前端
cd client && npm install && npm run build && cd ..

# 4. 打包 noVNC
npx esbuild /tmp/novnc-entry.js --bundle --format=iife --outfile=server/public/novnc-bundle.js --minify

# 5. 开放防火墙端口
ufw allow 3000/tcp
ufw allow 6080:6200/tcp

# 6. 启动
node server/index.js
```

访问 `http://你的IP:3000`

## 项目结构

```
fingerprint-browser/
├── server/
│   ├── index.js                 # Express 主服务 + noVNC WebSocket 代理
│   ├── routes/
│   │   ├── profiles.js          # 配置 CRUD API + 代理地理位置解析
│   │   ├── browsers.js          # 浏览器启动/关闭 API
│   │   └── files.js             # 文件管理 API (上传/下载/列表)
│   ├── services/
│   │   ├── database.js          # SQLite 数据库
│   │   ├── fingerprint.js       # 指纹生成 (支持 Win/Mac/Linux)
│   │   ├── browser.js           # CloakBrowser 独立进程管理
│   │   ├── proxy-relay.js       # 本地 SOCKS5/HTTP 代理中转
│   │   └── geolocation.js       # IP 地理位置查询
│   ├── public/
│   │   └── novnc-bundle.js      # noVNC 打包文件 (构建生成)
│   └── uploads/                 # 文件管理器存储目录
├── client/
│   ├── src/
│   │   ├── App.jsx              # 主应用 (配置管理 + 文件管理)
│   │   └── components/
│   │       ├── ProfileList.jsx  # 配置列表 (比特浏览器风格表格)
│   │       ├── CreateProfile.jsx # 创建/编辑配置 (OS选择/指纹/代理)
│   │       ├── BrowserView.jsx  # VNC 浏览器视图
│   │       └── FileManager.jsx  # 文件管理器
│   └── ...
├── scripts/
│   ├── inject-fingerprint.js    # 备用浏览器端指纹注入脚本
│   └── reddit-stealth.js        # 备用 Reddit 防检测脚本
├── start.sh                     # 服务管理脚本
├── DEPLOYMENT.md                # 完整部署指南
└── README.md
```

## License

MIT
