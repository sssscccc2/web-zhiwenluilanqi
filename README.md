# Web 指纹浏览器 (Fingerprint Browser Manager)

一个类似比特浏览器的 **Web 端指纹浏览器管理系统**，通过网页控制和显示多个隔离的浏览器实例，每个实例拥有独立的指纹、代理和用户数据。

## 检测平台实测结果

> 以下结果基于 fingerprint-chromium v144 + 菲律宾住宅代理实测

| 检测平台 | 结果 | 说明 |
|---|---|---|
| **BrowserScan** | **92% 真实度** | Browser fingerprint authenticity: 92% |
| **Pixelscan** | Chrome 144 on Linux | 无 Incognito Window 检测 |
| **CreepJS** | 0% headless / 0% stealth | 30% like headless (Xvfb 限制) |
| Bot Detection | **No Detection** | 未被识别为机器人 |
| Proxy Detection | **No** | 代理完全不可见 |
| Port Scan | **N/A** | WebSocket 端口扫描已阻断 |
| WebRTC Leak | **Blocked** | 所有 WebRTC 连接已阻断 |
| Incognito Mode | **No** | 隐身模式检测已修复 |

### 已知限制

| 检测项 | 状态 | 原因 |
|---|---|---|
| Pixelscan "Masking detected" | ⚠️ | C++ 级 Canvas/WebGL 修改可被统计分析检测，所有开源指纹浏览器的共同限制 |
| BrowserScan WebGL exception | ⚠️ | Xvfb 软件渲染 vs 伪装 GPU 不匹配 |
| DNS Leak | ⚠️ | 代理服务商出口节点使用的 DNS，非浏览器问题 |

## 功能特性

- **比特浏览器风格界面** — 表格式配置管理，支持批量创建/编辑/删除
- **双引擎支持** — fingerprint-chromium v144（首选）/ CloakBrowser v145（备选）
- **OS 平台选择** — Windows / macOS / Linux 三选一，UserAgent/屏幕/字体等自动匹配
- **SOCKS5/HTTP 代理** — 支持带用户名密码的认证代理，自动创建本地中转
- **IP 地理位置自动匹配** — 根据代理出口 IP 自动设置语言、时区、经纬度
- **代理 Kill Switch** — 代理断开时浏览器直接断网，绝不回退到本机 IP
- **全面防泄露** — DNS / WebRTC / QUIC / 后台服务 / 端口扫描，七层防护
- **Web 远程控制** — 通过 noVNC 在网页内直接操作浏览器，支持剪贴板互通
- **指纹随机化** — Canvas / WebGL / AudioContext / ClientRects / 设备名 / MAC 地址
- **隐身模式防检测** — storage.estimate / webkitRequestFileSystem / performance.memory 全面伪装
- **Intl API 匹配** — DateTimeFormat / NumberFormat / Collator 自动匹配代理所在地区语言
- **浏览器暖机** — 首次启动自动访问 Google/YouTube/Wikipedia 建立真实 cookies/history
- **WebRTC 控制** — 替换 / 隐私 / 允许 / 禁用四种模式
- **文件管理器** — 支持上传 / 下载 / 预览图片视频 / 新建文件夹
- **指纹持久化** — 指纹种子和 GPU 选择跨会话保持一致，防止指纹轮换检测

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器引擎 | **fingerprint-chromium v144**（首选）/ CloakBrowser v145（备选） |
| 隐身扩展 | Chrome Manifest V3 Extension (stealth-extension/) |
| 虚拟显示 | Xvfb + fluxbox (窗口管理器) |
| VNC | x11vnc + noVNC (websockify 中转) |
| 代理中转 | Node.js 自建 SOCKS5 relay (基于 socks 库) |

## 系统架构

```
用户浏览器 (React 前端)
    │
    ├── HTTP API (:3000) ──→ Express 后端 ──→ SQLite 数据库
    │
    └── WebSocket (:6080+) ──→ websockify ──→ x11vnc ──→ Xvfb 虚拟显示器
                                                              │
                                                    fingerprint-chromium v144
                                                    + stealth-extension (MV3)
                                                              │
                                                    本地 SOCKS5 中转 (:21080+)
                                                              │
                                                    上游 SOCKS5 代理 (住宅IP)
                                                              │
                                                          目标网站
```

### 浏览器引擎优先级

系统启动时自动检测可用的浏览器引擎：

```
1. fingerprint-chromium v144 (/opt/fingerprint-chromium/) — 2.3k star 开源项目，首选
2. CloakBrowser v145 (npm cloakbrowser) — 备选
3. 系统 Chrome/Chromium — 最后手段
```

**为什么选择 fingerprint-chromium？**
- GitHub 2.3k star，社区活跃
- 基于 Ungoogled Chromium，没有 Google 私有 API 缺失导致的隐身检测问题
- 支持 `--fingerprint` seed 持久化 Canvas/WebGL/Audio 指纹
- 支持 `--fingerprint-brand=Chrome` 让 UA 报告为 Chrome 而非 Chromium
- 通过 `--timezone` 设置时区

### 代理中转架构

我们**没有使用 sing-box**，而是用 Node.js 自建 SOCKS5 中转服务：

```
fingerprint-chromium ──→ socks5://127.0.0.1:21080 (本地中转，无需认证)
                                   │
                                   └──→ socks5://user:pass@proxy:port (上游认证代理)
                                                    │
                                                    └──→ 目标网站
```

**为什么需要本地中转？** Chromium 原生不支持带用户名密码的 SOCKS5 认证。本地中转在 `127.0.0.1` 上监听一个无需认证的 SOCKS5 端口，浏览器连接到这个端口，中转服务再用用户名密码连接上游代理。

## 指纹伪装能力

### 第一层：C++ 源码级伪装（fingerprint-chromium）

在 Chromium 源码级别修改，JS 无法检测到伪装：

| 指纹 | 说明 | 持久化 |
|---|---|---|
| `navigator.userAgent` | 完整 UA 字符串匹配 Chrome 144 | ✅ |
| `navigator.platform` | 匹配 Win32 / MacIntel / Linux x86_64 | ✅ |
| Canvas 2D | 像素级噪声，由 seed 决定，跨会话一致 | ✅ |
| WebGL | GPU 厂商/渲染器/参数，由 seed 自动生成 | ✅ |
| AudioContext | 音频指纹噪声 | ✅ |
| ClientRects | DOM 元素尺寸微调 | ✅ |
| `navigator.hardwareConcurrency` | CPU 核心数 | ✅ |
| Client Hints | `Sec-CH-UA-Platform-Version` 等 | ✅ |

### 第二层：Stealth Extension 伪装（stealth-extension/）

Chrome Manifest V3 扩展，在 `document_start` 阶段注入 `MAIN` world：

| 伪装项 | 说明 |
|---|---|
| `navigator.storage.estimate()` | 返回 >2GB 配额，防止隐身模式检测 |
| `webkitRequestFileSystem` | 兼容旧版隐身检测 |
| `performance.memory` | 返回 4GB jsHeapSizeLimit |
| `navigator.connection` | WiFi/4G 网络信息伪装 |
| `navigator.getBattery()` | 电池状态模拟（桌面：100% 充电中） |
| `navigator.mediaDevices` | 伪装摄像头 + 麦克风 + 扬声器 |
| Permissions API | 返回真实 Chrome 默认权限值 |
| `Notification.permission` | 返回 'default' |
| `window.chrome` | 补全 `app`/`csi`/`loadTimes` 对象 |
| WebSocket 端口扫描防护 | 阻止 localhost 端口扫描 |
| `document.visibilityState` | 始终返回 'visible' |
| `devicePixelRatio` | 固定为 1 |
| Intl API | DateTimeFormat/NumberFormat/Collator 匹配 profile 语言 |
| `screen.availTop/availLeft` | 设为 0（防止 headless 检测） |

### 第三层：环境级伪装

| 配置项 | 说明 |
|---|---|
| 时区 | 根据代理 IP 自动设置（`--timezone` + TZ 环境变量） |
| 语言 | 根据代理 IP 自动设置（`--lang` + `--accept-lang` + LANG 环境变量） |
| 地理位置 | 根据代理 IP 自动设置经纬度（带随机偏移） |
| 指纹种子持久化 | `.fp_seed` 文件，跨会话保持 Canvas/WebGL/Audio 一致 |
| GPU 选择持久化 | `.gpu_index` 文件，每个 profile 固定 GPU |
| Chrome Preferences | 语言偏好/下载设置/退出状态正常 |
| Bookmarks | YouTube/Gmail/Amazon 等常见书签 |
| 浏览器暖机 | 首次启动访问 Google/YouTube/Wikipedia |
| Windows 字体 | 安装 Arial/Times/Verdana/Georgia 等核心字体 |
| Xvfb DPI | 固定 96 DPI，防止屏幕参数不匹配 |

## ⚠️ SOCKS5 代理防泄露

### 七层防护（已内置）

| # | 风险 | 防护措施 | Chrome 参数 |
|---|---|---|---|
| 1 | **DNS 泄露** | 强制 DNS 走 SOCKS5 代理 | `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` |
| 2 | **WebRTC 泄露** | 禁止非代理 UDP | `--webrtc-ip-handling-policy=disable_non_proxied_udp` |
| 3 | **QUIC/HTTP3 回退** | 禁用 QUIC | `--disable-quic` |
| 4 | **自动化痕迹** | `--disable-blink-features=AutomationControlled` + 独立进程 | 无 CDP |
| 5 | **后台服务泄露** | 禁用所有 Chrome 后台直连 | Kill Switch 参数组 |
| 6 | **loopback 旁路** | 移除 loopback 豁免 | `--proxy-bypass-list=<-loopback>` |
| 7 | **端口扫描** | stealth-extension 拦截 localhost WebSocket | JS 层防护 |

### Kill Switch（代理断开 = 浏览器断网）

当 SOCKS5 代理断开时，浏览器**不会回退到本机直连**，而是直接显示网络错误页：

```
--proxy-server=socks5://127.0.0.1:21080    # 所有流量必须走代理
--proxy-bypass-list=<-loopback>             # 连 loopback 也走代理
--host-resolver-rules=MAP * ~NOTFOUND ...   # DNS 也走代理
--disable-background-networking             # 禁止后台网络请求
--disable-component-update                  # 禁止组件更新直连 Google
--disable-domain-reliability                # 禁止域名可靠性上报
--disable-client-side-phishing-detection    # 禁止 Safe Browsing 直连
--metrics-recording-only                    # 禁止 metrics 上报
--no-pings                                  # 禁止 <a ping> 跟踪请求
--safebrowsing-disable-auto-update          # 禁止安全浏览自动更新
```

### 需要你自己注意的风险

| 风险 | 说明 | 建议 |
|---|---|---|
| **IP 类型 (ASN)** | 数据中心 IP 一查即知 | **必须使用住宅代理 (Residential)** |
| **IP 信誉** | 被滥用过的 IP 已在黑名单 | 用 [ipqualityscore.com](https://ipqualityscore.com) 查询 |
| **TCP TTL** | Linux TTL=64 vs Windows TTL=128 | 好的代理商会修改 TTL |
| **延迟三角测量** | RTT 过高暴露中间节点 | 选择低延迟代理 (<50ms) |
| **手机号与 IP 地区** | 不一致会被标记 | 手机号和 IP 必须同一地区 |

### 推荐代理

```
✅ 住宅代理 (Residential) — DataImpulse、IPRoyal、Bright Data
✅ 静态住宅 IP (Sticky Session) — 保持同一 IP 至少 30 分钟
✅ ISP 代理 — 数据中心速度 + 住宅 ASN

❌ 机房代理 (Datacenter) — ASN 立刻暴露
❌ 免费公共代理 — 已在所有黑名单中
❌ 频繁轮换 IP — 同一账号短时间换 IP 是风险信号
```

### DataImpulse 代理配置

```
SOCKS5 Rotating:  socks5://用户名:密码@gw.dataimpulse.com:824
SOCKS5 Sticky:    socks5://用户名:密码@gw.dataimpulse.com:10000-20000
HTTP Rotating:    http://用户名:密码@gw.dataimpulse.com:823
HTTP Sticky:      http://用户名:密码@gw.dataimpulse.com:10000-20000

用户名格式: 账号ID__cr.国家代码
例: 050b81be1d01__cr.ph (菲律宾)
```

## 快速部署

### 系统要求

- **OS**: Ubuntu 20.04+ / Debian 11+ (Linux x64)
- **RAM**: 最少 2GB，建议 4GB+（每个浏览器实例约 300-500MB）
- **硬盘**: 15GB+ 可用空间（含浏览器二进制）
- **Node.js**: 18+

### 安装步骤

```bash
# 1. 安装系统依赖
apt update && apt install -y \
  xvfb x11vnc fluxbox xdotool wmctrl imagemagick \
  python3-pip fonts-liberation ttf-mscorefonts-installer \
  fonts-crosextra-carlito fonts-crosextra-caladea
pip3 install websockify

# 2. 创建 Chrome 运行用户（安全沙箱需要）
useradd -m -s /bin/bash chrome-user
echo 1 > /proc/sys/kernel/unprivileged_userns_clone

# 3. 生成所需语言环境（按需）
locale-gen en_US.UTF-8 en_PH.UTF-8 zh_CN.UTF-8

# 4. 克隆项目
git clone https://github.com/sssscccc2/web-zhiwenluilanqi.git
cd web-zhiwenluilanqi

# 5. 安装后端依赖
npm install

# 6. 下载 fingerprint-chromium v144（推荐）
mkdir -p /opt/fingerprint-chromium
cd /opt/fingerprint-chromium
wget https://github.com/adryfish/fingerprint-chromium/releases/download/144.0.7559.132/ungoogled-chromium-144.0.7559.132-1-x86_64_linux.tar.xz
tar xf ungoogled-chromium-144.0.7559.132-1-x86_64_linux.tar.xz
chmod -R 755 /opt/fingerprint-chromium
cd -

# 7. 构建前端
cd client && npm install && npm run build && cd ..

# 8. 打包 noVNC（如果 server/public/novnc-bundle.js 不存在）
# 参考 DEPLOYMENT.md 中的详细步骤

# 9. 开放防火墙端口
ufw allow 3000/tcp       # Web 管理界面
ufw allow 6080:6200/tcp  # noVNC WebSocket

# 10. 启动
node server/index.js
```

访问 `http://你的IP:3000`

### 使用流程

1. 打开 Web 管理界面，点击「新建配置」
2. 选择 OS 平台（Windows / macOS / Linux）
3. 填入 SOCKS5 代理地址（格式：`socks5://user:pass@host:port`）
4. 点击「解析」自动获取 IP 地理位置并匹配指纹
5. 保存配置，在列表中点击「启动」
6. 点击「查看」通过 VNC 在网页内操作浏览器

### 指纹检测验证

启动浏览器后访问以下网站验证效果：

| 工具 | 地址 | 检测项目 | 期望结果 |
|---|---|---|---|
| BrowserScan | `browserscan.net` | 综合指纹评分 | 92%+ |
| Pixelscan | `pixelscan.net/fingerprint-check` | 指纹一致性 | 无 Incognito, Bot: No |
| CreepJS | `abrahamjuliot.github.io/creepjs` | 深度指纹分析 | 0% headless, 0% stealth |
| BrowserLeaks | `browserleaks.com` | IP/WebRTC/DNS/Canvas | 无泄露 |
| IPLeak | `ipleak.net` | 综合泄露检测 | 仅显示代理 IP |

## 项目结构

```
fingerprint-browser/
├── server/
│   ├── index.js                 # Express 主服务 + noVNC WebSocket 代理
│   ├── routes/
│   │   ├── profiles.js          # 配置 CRUD API + 代理地理位置解析
│   │   ├── browsers.js          # 浏览器启动/关闭 API
│   │   └── files.js             # 文件管理 API (上传/下载/列表/删除)
│   ├── services/
│   │   ├── browser.js           # 浏览器引擎生命周期管理 (核心)
│   │   ├── database.js          # SQLite 数据库 (better-sqlite3)
│   │   ├── fingerprint.js       # 指纹生成 (Win/Mac/Linux 三平台)
│   │   ├── proxy-relay.js       # 本地 SOCKS5/HTTP 代理中转服务
│   │   └── geolocation.js       # IP 地理位置查询 (ip-api.com)
│   ├── stealth-extension/       # Chrome Manifest V3 隐身扩展
│   │   ├── manifest.json        # MV3 manifest, MAIN world 注入
│   │   └── stealth.js           # 全部 JS 级伪装逻辑
│   ├── public/
│   │   └── novnc-bundle.js      # noVNC 打包文件 (esbuild 构建)
│   ├── uploads/                 # 文件管理器存储目录
│   └── data/
│       └── profiles/            # 浏览器用户数据目录 (每配置独立)
│           ├── .fp_seed         # 指纹种子 (持久化)
│           ├── .gpu_index       # GPU 配置索引 (持久化)
│           └── .warmed_up       # 暖机完成标记
├── client/
│   ├── src/
│   │   ├── App.jsx              # 主应用 (Tab: 配置管理 / 文件管理)
│   │   ├── main.jsx             # React 入口
│   │   └── components/
│   │       ├── ProfileList.jsx  # 配置列表 (比特浏览器风格表格)
│   │       ├── CreateProfile.jsx # 创建/编辑配置 (OS/指纹/代理)
│   │       ├── BrowserView.jsx  # noVNC 浏览器远程视图
│   │       └── FileManager.jsx  # 文件管理器
│   └── vite.config.js
├── scripts/
│   ├── inject-fingerprint.js    # 备用 JS 指纹注入
│   └── reddit-stealth.js        # 备用 Reddit 防检测
├── start.sh                     # 服务管理脚本
├── DEPLOYMENT.md                # 完整部署指南
└── README.md
```

### 核心文件说明

**`server/services/browser.js`** — 浏览器引擎管理核心

- 自动检测引擎优先级：fingerprint-chromium > CloakBrowser > 系统 Chrome
- 根据引擎类型自动适配命令行参数（v144 vs v145 差异）
- 管理 Xvfb / fluxbox / x11vnc / websockify 全套虚拟显示栈
- 指纹种子持久化和 GPU 选择持久化
- 浏览器暖机（首次启动）和干净退出（Preferences 修复）

**`server/stealth-extension/`** — Chrome MV3 隐身扩展

- `manifest.json`: `"world": "MAIN"` 在页面主世界注入
- `stealth.js`: 全部 JS 级 API 伪装，覆盖 storage.estimate / connection / battery / mediaDevices / permissions / chrome / Intl / WebSocket 等

## GPU 配置池

| 平台 | GPU 配置 |
|---|---|
| Windows | NVIDIA RTX 3060/3070, GTX 1660 SUPER, AMD RX 6700 XT, Intel UHD 770 |
| macOS | Apple M1, M1 Pro, M2 |
| Linux | NVIDIA RTX 3060, Intel UHD 630 |

fingerprint-chromium v144 的 GPU 由 `--fingerprint` seed 自动生成，不使用单独的 GPU 参数。CloakBrowser 仍使用 `--fingerprint-gpu-vendor/renderer`。

## 更新日志

| 日期 | 内容 |
|---|---|
| 2026-04-06 | **替换 CloakBrowser 为 fingerprint-chromium v144**：消除 Incognito Window 检测，BrowserScan 92%，添加 storage.estimate/Intl API/端口扫描防护 |
| 2026-04-05 | **环境真实性大升级**：Chrome 品牌伪装、Stealth 扩展（connection/battery/mediaDevices/permissions/chrome）、指纹持久化、浏览器暖机、Xvfb DPI 修复 |
| 2026-04 | 修复 Pixelscan/CreepJS 检测：screen.availTop、非 root 用户真实沙箱、--test-type 隐藏警告 |
| 2026-04 | SOCKS5 代理 Kill Switch：禁用所有 Chrome 后台直连服务 |
| 2026-04 | 修复 SOCKS5 三大泄露：DNS / QUIC / WebRTC |
| 2025-04 | 初始版本：Web 指纹浏览器管理系统 + CloakBrowser 引擎 |

## 常见问题

### Q: 为什么 Pixelscan 显示 "Masking detected"？

这是所有开源指纹浏览器的共同限制。Pixelscan 通过统计分析检测 C++ 级的 Canvas/WebGL 修改。即使是商业指纹浏览器（Multilogin/GoLogin/AdsPower）也会在 Pixelscan 上显示类似结果。实际的网站（Reddit/Discord/Facebook）不会使用如此严格的检测。

### Q: 为什么不用 CloakBrowser？

CloakBrowser 基于一个修改过的 Chromium 构建，缺少某些 Google 私有 API（如 `chrome.runtime` 的完整实现），导致 Pixelscan/BrowserScan 检测到 "Incognito Window"。fingerprint-chromium 基于 Ungoogled Chromium，没有这个问题。

### Q: BrowserScan 的 "Browser: Detection" 是什么？

BrowserScan 检测到浏览器内核是 Chromium 而非官方 Google Chrome。这是使用任何 Chromium 分支（包括 Edge/Brave/Opera）都会出现的标记，不影响实际使用。

### Q: DNS Leak 怎么解决？

BrowserScan 显示的 DNS 泄露是代理服务商出口节点使用的 DNS 服务器（通常是 Google DNS），不是你服务器的 DNS。这是代理商的配置，不是浏览器问题。

### Q: 浏览器启动时显示 "Restore pages?"

已修复。系统在关闭浏览器时会自动修复 Chrome Preferences 中的 `exit_type` 和 `exited_cleanly` 字段。

### Q: fingerprint-chromium 启动失败？

确保：
1. 二进制已下载到 `/opt/fingerprint-chromium/`
2. 已创建 `chrome-user` 用户：`useradd -m -s /bin/bash chrome-user`
3. 权限正确：`chmod -R 755 /opt/fingerprint-chromium`
4. unprivileged userns 已启用：`echo 1 > /proc/sys/kernel/unprivileged_userns_clone`

## License

MIT
