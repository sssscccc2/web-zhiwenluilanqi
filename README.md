# Web 指纹浏览器 (web-zhiwenluilanqi)

一个类似比特浏览器的 **Web 端指纹浏览器管理系统**，通过网页控制和显示多个隔离的浏览器实例，每个实例拥有独立的指纹、代理和用户数据。

## 功能特性

- **比特浏览器风格界面** — 表格式配置管理，支持批量创建/编辑/删除
- **CloakBrowser 引擎** — C++ 源码级 Chromium 指纹伪装，非 JS 注入，无法被检测
- **OS 平台选择** — Windows / macOS / Linux 三选一，UserAgent/屏幕/字体等自动匹配
- **SOCKS5/HTTP 代理** — 支持带用户名密码的认证代理，自动创建本地中转
- **IP 地理位置自动匹配** — 根据代理出口 IP 自动设置语言、时区、经纬度
- **代理 Kill Switch** — 代理断开时浏览器直接断网，绝不回退到本机 IP
- **全面防泄露** — DNS / WebRTC / QUIC / 后台服务，六层防护
- **Web 远程控制** — 通过 noVNC 在网页内直接操作浏览器，支持剪贴板互通
- **指纹随机化** — Canvas / WebGL / AudioContext / ClientRects / 设备名 / MAC 地址
- **WebRTC 控制** — 替换 / 隐私 / 允许 / 禁用四种模式
- **文件管理器** — 支持上传 / 下载 / 预览图片视频 / 新建文件夹

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器引擎 | CloakBrowser (C++ 源码级修改的 Chromium 145) |
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
                                                         CloakBrowser
                                                              │
                                                    本地 SOCKS5 中转 (:21080+)
                                                              │
                                                    上游 SOCKS5 代理 (DataImpulse等)
                                                              │
                                                          目标网站
```

### 代理中转架构（重要）

我们**没有使用 sing-box**，而是用 Node.js 自建 SOCKS5 中转服务：

```
CloakBrowser ──→ socks5://127.0.0.1:21080 (本地中转，无需认证)
                          │
                          └──→ socks5://user:pass@gw.dataimpulse.com:10001 (上游认证代理)
                                         │
                                         └──→ 目标网站
```

**为什么需要本地中转？** Chromium 原生不支持带用户名密码的 SOCKS5 认证。本地中转在 `127.0.0.1` 上监听一个无需认证的 SOCKS5 端口，浏览器连接到这个端口，中转服务再用用户名密码连接上游代理。

## ⚠️ SOCKS5 代理防泄露（重要）

### 六层防护（已内置）

| # | 风险 | 说明 | 防护措施 | Chrome 参数 |
|---|---|---|---|---|
| 1 | **DNS 泄露** | Chrome 默认本地解析 DNS，暴露真实服务器 IP | 强制 DNS 走 SOCKS5 代理 | `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` |
| 2 | **WebRTC 泄露** | WebRTC 用 UDP STUN 请求绕过 TCP 代理 | 禁止非代理 UDP | `--webrtc-ip-handling-policy=disable_non_proxied_udp` |
| 3 | **QUIC/HTTP3 回退** | SOCKS5 仅支持 TCP，Chrome QUIC 失败回退可被检测 | 禁用 QUIC | `--disable-quic` |
| 4 | **自动化痕迹** | CDP/Playwright 留下 `navigator.webdriver` | CloakBrowser 独立进程，零 CDP | 无需参数 |
| 5 | **后台服务泄露** | Safe Browsing/组件更新/Metrics 可能绕过代理直连 | 全部禁用 | 见下方 Kill Switch |
| 6 | **loopback 旁路** | Chrome 默认 localhost 不走代理 | 移除 loopback 豁免 | `--proxy-bypass-list=<-loopback>` |

### Kill Switch（代理断开 = 浏览器断网）

当 SOCKS5 代理断开时，浏览器**不会回退到本机直连**，而是直接显示网络错误页。

这通过以下参数组合实现：

```
--proxy-server=socks5://127.0.0.1:21080    # 所有流量必须走代理
--proxy-bypass-list=<-loopback>             # 连 loopback 也走代理
--host-resolver-rules=MAP * ~NOTFOUND ...   # DNS 也走代理
--disable-background-networking             # 禁止后台网络请求绕过代理
--disable-component-update                  # 禁止组件更新直连 Google
--disable-domain-reliability                # 禁止域名可靠性上报
--disable-client-side-phishing-detection    # 禁止 Safe Browsing 直连
--metrics-recording-only                    # 禁止 metrics 上报
--no-pings                                  # 禁止 <a ping> 跟踪请求
--safebrowsing-disable-auto-update          # 禁止安全浏览自动更新
```

**效果：代理在 → 正常上网；代理断 → 整个浏览器断网，没有任何流量走本机 IP。**

### 需要你自己注意的风险

| 风险 | 说明 | 建议 |
|---|---|---|
| **IP 类型 (ASN)** | 数据中心 IP 的 ASN 标记为"企业/托管"，反欺诈一查即知 | **必须使用住宅代理 (Residential)**，不要用机房 IP |
| **IP 信誉** | 被滥用过的 IP 已在 IPQS/MaxMind 黑名单中 | 用 [ipqualityscore.com](https://ipqualityscore.com) 查询 IP 信誉分 |
| **TCP TTL 不匹配** | 服务器 Linux (TTL=64)，浏览器声称 Windows (TTL=128)，被动 TCP 分析可发现 | 好的代理商会在网络层修改 TTL，廉价代理不会 |
| **延迟三角测量** | RTT 过高暴露中间节点，IP 说纽约但延迟像从欧洲来的 | 选择低延迟代理 (<50ms)，避免多层隧道 |
| **MTU/MSS 异常** | VPN 隧道 MTU (1300) 与正常以太网 (1500) 不同，暴露隧道存在 | 不要在代理上面再套 VPN |
| **开放端口扫描** | 代理常见端口 1080/8080/3128 开放 = 一看就是代理 | 好的代理商会关闭这些端口 |
| **手机号与 IP 地区** | 注册时手机号国家与代理 IP 国家不一致 | 手机号和 IP 必须同一地区 |
| **hCaptcha 环境检测** | hCaptcha Enterprise 检测虚拟显示器/自动化环境 | Linux VPS + Xvfb 可能被识别，建议高安全场景用 Windows RDP |

### 推荐代理选择

```
✅ 住宅代理 (Residential) — 如 DataImpulse、IPRoyal、Bright Data
✅ 静态住宅 IP (Sticky Session) — 保持同一 IP 至少 30 分钟
✅ ISP 代理 — 数据中心速度 + 住宅 ASN，最佳性价比

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
  系统会在解析代理时自动添加此后缀
```

### IP 检测工具

启动浏览器后访问以下网站验证代理效果：

| 工具 | 地址 | 检测项目 |
|---|---|---|
| BrowserLeaks IP | `browserleaks.com/ip` | IP 信誉、ASN 类型、地理位置 |
| BrowserLeaks WebRTC | `browserleaks.com/webrtc` | WebRTC 泄露检测 |
| BrowserLeaks DNS | `browserleaks.com/dns` | DNS 泄露检测 |
| IPLeak | `ipleak.net` | 综合泄露检测（IP/DNS/WebRTC） |
| IPQS | `ipqualityscore.com` | IP 欺诈评分（反欺诈系统实际使用的数据库） |
| BrowserLeaks 指纹 | `browserleaks.com/canvas` | Canvas/WebGL/Audio 指纹 |
| CreepJS | `abrahamjuliot.github.io/creepjs` | 深度指纹一致性检测 |

## 指纹伪装能力

### CloakBrowser C++ 级伪装（核心）

CloakBrowser 在 Chromium 源码级别修改，以下指纹在 C++ 层面处理，JS 无法检测到伪装：

| 指纹 | 说明 |
|---|---|
| `navigator.userAgent` | 完整 UA 字符串匹配目标 OS |
| `navigator.platform` | 匹配 Win32 / MacIntel / Linux x86_64 |
| Canvas 2D | 像素级噪声，每个配置唯一 |
| WebGL | GPU 厂商/渲染器/参数全套伪装 |
| AudioContext | 音频指纹噪声 |
| ClientRects | DOM 元素尺寸微调 |
| `navigator.hardwareConcurrency` | CPU 核心数 |
| `navigator.deviceMemory` | 设备内存 |
| Screen 分辨率 | 屏幕宽高/色深 |

### 应用层补充伪装

| 指纹 | 说明 |
|---|---|
| 时区 | 根据代理 IP 自动设置（TZ 环境变量 + `--fingerprint-timezone`） |
| 语言 | 根据代理 IP 自动设置（`--lang` + `--fingerprint-locale`） |
| 地理位置 | 根据代理 IP 自动设置经纬度（带随机偏移） |
| 设备名 | 随机生成（如 DESKTOP-A1B2C3D） |
| 本地 IP | 随机生成私有 IP（如 192.168.1.xxx） |
| MAC 地址 | 随机生成 |
| WebRTC | 四种模式：替换/隐私/允许/禁用 |

## 环境真实性措施（防 Reddit 检测）

Reddit 使用 Fingerprint2 库收集以下信息生成设备唯一指纹，并缓存在 localStorage 中用于关联账号：

### Reddit Fingerprint2 收集的数据

| 数据 | 说明 | 我们的防护 |
|---|---|---|
| UserAgent | 浏览器和操作系统标识 | CloakBrowser C++ 级伪装 |
| 已安装字体 | 系统字体列表 | **已安装 Windows 核心字体**（Arial/Times/Verdana/Georgia 等） |
| 屏幕分辨率 | 显示器尺寸 | 指纹配置中随机生成，Xvfb 匹配 |
| 语言设置 | navigator.language | 根据代理 IP 自动匹配 |
| WebGL 渲染器 | GPU 标识 | CloakBrowser `--fingerprint-gpu-*` + 多 GPU 配置池 |
| 时区 | 系统时区 | TZ 环境变量 + `--fingerprint-timezone` |
| Canvas 指纹 | 画布渲染差异 | CloakBrowser C++ 级像素噪声 |
| AudioContext | 音频栈签名 | CloakBrowser C++ 级噪声 |

### 环境预配置（模拟真实用户）

每个浏览器配置首次启动时自动预设：

| 配置项 | 内容 | 目的 |
|---|---|---|
| Chrome Preferences | 语言偏好/下载设置/窗口位置/字体大小 | 新浏览器不会有完全空白的偏好文件 |
| Bookmarks | YouTube/Gmail/Amazon 等常见书签 | 真实用户通常有书签 |
| Local State | 浏览器已初始化标记 | 避免首次运行向导等异常信号 |
| Profile 信息 | 随机头像/名称/退出状态正常 | 模拟正常使用过的浏览器 |

### GPU 配置池（按 OS 平台匹配）

| 平台 | GPU 配置 |
|---|---|
| Windows | NVIDIA RTX 3060/3070, GTX 1660 SUPER, AMD RX 6700 XT, Intel UHD 770 |
| macOS | Apple M1, M1 Pro, M2 |
| Linux | NVIDIA RTX 3060, Intel UHD 630 |

GPU 配置与选择的 OS 平台自动匹配，不会出现"声称 Windows 却使用 macOS GPU"的矛盾。

### Windows 字体安装

系统已安装以下 Windows 核心字体（通过 `ttf-mscorefonts-installer`）：

```
Arial, Arial Black, Comic Sans MS, Courier New, Georgia,
Impact, Times New Roman, Trebuchet MS, Verdana, Webdings
```

加上 `fonts-crosextra-carlito`（Calibri 替代）和 `fonts-crosextra-caladea`（Cambria 替代），字体指纹与真实 Windows 系统高度一致。

### Reddit 4 层检测系统

| 层 | 检测方法 | 我们的应对 |
|---|---|---|
| **L1: 网络指纹** | IP/UA/屏幕/字体/WebGL/时区的唯一组合 | CloakBrowser + 住宅代理 + 全套指纹伪装 |
| **L2: 行为分析** | 发帖节奏/投票时间/内容相似度/会话行为 | 需用户自行模拟真人行为 |
| **L3: CQS 评分** | 内容质量/被举报率/被删除率 | 需用户发布高质量内容 |
| **L4: 人工审核** | 版主的主观判断 | 需用户真实参与社区 |

> **关键原则：** 稳定性比花哨重要。长期使用同一配置、同一 IP、一致的行为模式，比频繁换指纹换 IP 更安全。

## 快速部署

> 详细的部署步骤请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 系统要求

- **OS**: Ubuntu 20.04+ / Debian 11+ (需要 Linux x64)
- **RAM**: 最少 2GB，建议 4GB+（每个浏览器实例约 300-500MB）
- **硬盘**: 10GB+ 可用空间
- **Node.js**: 18+

### 安装步骤

```bash
# 1. 安装系统依赖
apt update && apt install -y xvfb x11vnc fluxbox xdotool imagemagick python3-pip
pip3 install websockify

# 2. 克隆项目
git clone https://github.com/sssscccc2/web-zhiwenluilanqi.git
cd web-zhiwenluilanqi

# 3. 安装后端依赖（自动下载 CloakBrowser 二进制）
npm install

# 4. 构建前端
cd client && npm install && npm run build && cd ..

# 5. 打包 noVNC（如果 server/public/novnc-bundle.js 不存在）
# 参考 DEPLOYMENT.md 中的详细步骤

# 6. 开放防火墙端口
ufw allow 3000/tcp       # Web 管理界面
ufw allow 6080:6200/tcp  # noVNC WebSocket（每个浏览器实例一个端口）

# 7. 启动
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
│   │   ├── database.js          # SQLite 数据库 (better-sqlite3)
│   │   ├── fingerprint.js       # 指纹生成 (Win/Mac/Linux 三平台)
│   │   ├── browser.js           # CloakBrowser 独立进程生命周期管理
│   │   ├── proxy-relay.js       # 本地 SOCKS5/HTTP 代理中转服务
│   │   └── geolocation.js       # IP 地理位置查询 (ip-api.com)
│   ├── public/
│   │   └── novnc-bundle.js      # noVNC 打包文件 (esbuild 构建)
│   ├── uploads/                 # 文件管理器存储目录
│   └── data/
│       └── profiles/            # 浏览器用户数据目录 (每配置独立)
├── client/
│   ├── src/
│   │   ├── App.jsx              # 主应用 (Tab: 配置管理 / 文件管理)
│   │   └── components/
│   │       ├── ProfileList.jsx  # 配置列表 (比特浏览器风格表格)
│   │       ├── CreateProfile.jsx # 创建/编辑配置 (OS/指纹/代理)
│   │       ├── BrowserView.jsx  # noVNC 浏览器远程视图
│   │       └── FileManager.jsx  # 文件管理器 (上传/下载/预览)
│   └── ...
├── scripts/
│   ├── inject-fingerprint.js    # 备用 JS 指纹注入 (CloakBrowser 不可用时)
│   └── reddit-stealth.js        # 备用 Reddit 防检测 (CloakBrowser 不可用时)
├── start.sh                     # 服务管理脚本
├── DEPLOYMENT.md                # 完整部署指南 + 踩坑记录
└── README.md
```

## 已知限制

| 限制 | 说明 | 替代方案 |
|---|---|---|
| **hCaptcha Enterprise** | Linux VPS + Xvfb 虚拟显示器可能被 hCaptcha 环境检测识别 | 高安全场景用 Windows RDP + 比特浏览器 |
| **TCP TTL** | Linux 服务器 TTL=64，与 Windows 浏览器声称的 TTL=128 不匹配 | 需要代理商在网络层修改 TTL |
| **并发数量** | 每个浏览器实例占用约 300-500MB 内存 | 根据服务器内存规划实例数量 |
| **GPU 加速** | Xvfb 无 GPU，WebGL 使用软件渲染 | 不影响指纹伪装，但渲染性能较低 |

## 更新日志

| 日期 | 内容 |
|---|---|
| 2025-04 | 初始版本：Web 指纹浏览器管理系统 |
| 2025-04 | 升级至 CloakBrowser C++ 级隐身 + 独立进程模式（无 CDP 泄露） |
| 2025-04 | 修复 SOCKS5 三大泄露：DNS / QUIC / WebRTC |
| 2025-04 | 添加代理 Kill Switch：禁用所有 Chrome 后台直连服务 |
| 2025-04 | 新增文件管理器：上传/下载/预览/新建文件夹 |
| 2026-04 | **环境真实性大升级**：安装 Windows 字体、动态 OS/GPU 匹配、Chrome 偏好预设、书签预填充 |

## License

MIT
