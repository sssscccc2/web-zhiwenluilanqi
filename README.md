# Web 指纹浏览器 (web-zhiwenluilanqi)

一个类似比特浏览器的 **Web 端指纹浏览器管理系统**，通过网页控制和显示多个隔离的 Chromium 浏览器实例，每个实例拥有独立的指纹、代理和用户数据。

## 功能特性

- **比特浏览器风格** — 表格式管理界面，支持批量操作
- **浏览器指纹隔离** — 每个配置拥有独立的 UserAgent、Canvas、WebGL、AudioContext 等指纹
- **SOCKS5/HTTP 代理** — 支持认证代理，自动创建本地中转绕过 Chromium 限制
- **IP 地理位置匹配** — 根据代理出口 IP 自动匹配语言、时区、经纬度
- **Reddit 防检测** — 针对 Reddit 的额外反检测措施
- **Web 远程控制** — 通过 noVNC 在网页内直接操作浏览器
- **剪贴板互通** — 本地和远程浏览器之间的复制粘贴同步

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器引擎 | Playwright + Chromium |
| 虚拟显示 | Xvfb + fluxbox |
| VNC | x11vnc + noVNC (esbuild 打包) |
| 代理中转 | socks 库 (本地 SOCKS5 relay) |

## 快速部署

> 详细的部署步骤和**踩坑记录**请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

```bash
# 1. 安装系统依赖
apt update && apt install -y xvfb x11vnc fluxbox xdotool imagemagick python3-pip
pip3 install websockify

# 2. 安装 Playwright + Chromium
npx playwright install --with-deps chromium

# 3. 安装项目依赖
npm install
cd client && npm install && npm run build && cd ..

# 4. 打包 noVNC (关键步骤!)
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
│   │   └── browsers.js          # 浏览器启动/关闭 API
│   ├── services/
│   │   ├── database.js          # SQLite 数据库
│   │   ├── fingerprint.js       # 指纹生成
│   │   ├── browser.js           # Playwright 浏览器生命周期管理
│   │   ├── proxy-relay.js       # 本地 SOCKS5/HTTP 代理中转
│   │   └── geolocation.js       # IP 地理位置查询
│   └── public/
│       └── novnc-bundle.js      # noVNC 打包文件 (构建生成)
├── client/
│   ├── src/
│   │   ├── App.jsx              # 主应用
│   │   └── components/
│   │       ├── ProfileList.jsx  # 配置列表 (比特浏览器风格表格)
│   │       ├── CreateProfile.jsx # 创建/编辑配置
│   │       └── BrowserView.jsx  # VNC 浏览器视图
│   └── ...
├── scripts/
│   ├── inject-fingerprint.js    # 浏览器端指纹注入脚本
│   └── reddit-stealth.js        # Reddit 防检测脚本
├── start.sh                     # 服务管理脚本
├── DEPLOYMENT.md                # 完整部署指南 + 踩坑经验
└── README.md
```

## License

MIT
