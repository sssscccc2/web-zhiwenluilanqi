# 部署指南 & 踩坑记录

> 本文档记录了完整的部署流程和开发过程中遇到的**所有错误及解决方案**，供 AI 或人类部署时参考。

---

## 一、环境要求

- **OS**: Ubuntu 20.04+ (需要 X11 支持)
- **Node.js**: 18+
- **Python3**: 用于 websockify
- **内存**: 建议 2GB+ (每个浏览器实例约 300-500MB)
- **端口**: 3000 (Web), 6080-6200 (VNC/websockify)

---

## 二、完整安装步骤

### 2.1 系统依赖

```bash
apt update
apt install -y \
  xvfb \
  x11vnc \
  fluxbox \
  xdotool \
  imagemagick \
  python3-pip \
  fonts-noto-cjk \
  fonts-liberation

pip3 install websockify
```

### 2.2 Node.js 环境

```bash
# 如果未安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```

### 2.3 项目安装

```bash
cd /www/fingerprint-browser  # 或你的项目目录

# 安装后端依赖
npm install

# 安装 Playwright Chromium
npx playwright install --with-deps chromium

# 安装前端依赖 & 构建
cd client
npm install
npm run build
cd ..
```

### 2.4 构建 noVNC 打包文件 (关键!)

noVNC 原版使用 ES Module，需要加载 43 个 JS 文件。外部用户的浏览器经常加载失败。
必须用 esbuild 打包成单个 IIFE 文件。

```bash
# 安装 esbuild
npm install esbuild --save-dev

# 准备 noVNC 源码 (如果还没安装)
apt install -y novnc  # 安装到 /opt/noVNC 或 /usr/share/novnc

# !! 重要: 修补 top-level await 问题
mkdir -p /tmp/novnc-patch/core/util
cp -r /opt/noVNC/core/* /tmp/novnc-patch/core/
cp -r /opt/noVNC/vendor /tmp/novnc-patch/vendor

# 修补 browser.js 中的 top-level await (esbuild IIFE 格式不支持)
sed -i 's/supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();/\
_checkWebCodecsH264DecodeSupport().then(v => { supportsWebCodecsH264Decode = v; });/' \
  /tmp/novnc-patch/core/util/browser.js

# 创建入口文件
cat > /tmp/novnc-entry.js << 'EOF'
import RFB from '/tmp/novnc-patch/core/rfb.js';
window.noVNC_RFB = RFB;
EOF

# 打包
mkdir -p server/public
npx esbuild /tmp/novnc-entry.js \
  --bundle \
  --format=iife \
  --global-name=noVNC \
  --outfile=server/public/novnc-bundle.js \
  --minify

# 验证 (应输出 ~186KB)
ls -lh server/public/novnc-bundle.js
```

### 2.5 防火墙配置

```bash
ufw allow 3000/tcp       # Web 管理面板
ufw allow 6080:6200/tcp  # websockify VNC WebSocket 端口
```

### 2.6 启动

```bash
# 前台启动 (调试)
node server/index.js

# 后台启动
nohup node server/index.js > /tmp/fpbrowser.log 2>&1 &

# 或使用 start.sh
bash start.sh start
```

---

## 三、踩坑记录 (按时间顺序)

### ❌ 坑 1: `apt-get install` 锁文件冲突

**错误**: `E: Could not get lock /var/lib/apt/lists/lock`

**原因**: 另一个 apt 进程正在运行。

**解决**: 等待几秒后重试，或 `kill` 占用进程:
```bash
sleep 5 && apt-get install -y ...
# 或
kill $(lsof /var/lib/apt/lists/lock | awk 'NR>1{print $2}')
```

---

### ❌ 坑 2: Express v5 通配路由语法变更

**错误**: `PathError [TypeError]: Missing parameter name at index 1: *`

**原因**: Express v5 不再支持 `app.get('*', handler)` 语法。

**解决**: 改用命名参数:
```javascript
// ❌ Express v4 写法
app.get('*', handler);

// ✅ Express v5 写法
app.get('/{*path}', handler);
```

---

### ❌ 坑 3: websockify 启动失败 — Python shebang 问题

**错误**: `SyntaxError: invalid syntax` (websockify run 脚本)

**原因**: `/opt/noVNC/utils/websockify/run` 是 bash 脚本，用 `python3` 直接执行会报语法错误。

**解决**: 通过 pip 安装 websockify，直接调用可执行文件:
```bash
pip3 install websockify
# 然后使用 /usr/local/bin/websockify 而不是 python3 /opt/noVNC/utils/websockify/run
spawn('/usr/local/bin/websockify', [wsPort, `localhost:${vncPort}`])
```

---

### ❌ 坑 4: `EADDRINUSE` 端口被占用

**错误**: `Error: listen EADDRINUSE: address already in use :::3000`

**原因**: 之前的 Node 进程没有正确终止。

**解决**: 启动前杀掉旧进程:
```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1
node server/index.js
```

---

### ❌ 坑 5: SOCKS5 代理认证失败

**错误**: `browserType.launchPersistentContext: Browser does not support socks5 proxy authentication`

**原因**: Chromium 原生不支持带用户名密码的 SOCKS5 代理。Playwright 也无法传递认证信息。

**解决**: 创建本地无认证中转代理:
```
用户浏览器 → Chromium → localhost:21080 (无认证) → 本地relay → upstream:10000 (带认证)
```

实现在 `server/services/proxy-relay.js`:
- 在本地端口启动 SOCKS5 服务器 (无需认证)
- 接受 Chromium 连接后，通过 `socks` 库连接上游认证代理
- 双向转发数据

```javascript
const { SocksClient } = require('socks');
// 本地 relay 监听 21080，转发到 upstream SOCKS5 (带认证)
```

**关键代码**: `server/services/proxy-relay.js` → `getRelay()` 函数

---

### ❌ 坑 6: 代理 IP 地理位置解析 — "定位中..." 卡住

**错误**: 创建配置时粘贴代理后，地理位置解析一直显示 "定位中..."

**原因**: 最初只用代理 host 直接查 IP 地理位置，但住宅代理的 host 是服务商域名 (如 `us.rrp.b2proxy.com`)，不是真实出口 IP。

**解决**: 需要**通过代理发请求**获取真实出口 IP:
```javascript
// 通过 SOCKS5 代理连接 ip-api.com 获取出口 IP
const { SocksClient } = require('socks');
const conn = await SocksClient.createConnection({
  proxy: { host, port, type: 5, userId: user, password: pass },
  command: 'connect',
  destination: { host: 'ip-api.com', port: 80 },
});
// 然后发 HTTP 请求获取地理位置 JSON
```

实现在 `server/services/geolocation.js` → `fetchExitIpViaSocks()`

---

### ❌ 坑 7: 浏览器启动后黑屏 (about:blank)

**错误**: 通过 VNC 看到浏览器窗口，但页面空白 (about:blank)

**原因**: Playwright `launchPersistentContext` 默认打开 `about:blank`，不会自动导航。

**解决**: 启动后手动导航到起始页:
```javascript
const firstPage = browser.pages()[0] || await browser.newPage();
await firstPage.goto('https://www.google.com', {
  waitUntil: 'domcontentloaded',
  timeout: 30000
});
```

---

### ❌ 坑 8: 浏览器窗口没有最大化

**错误**: VNC 中看到浏览器窗口只占屏幕一小部分，周围大片黑色。

**原因**: Chromium 默认不最大化窗口，即使设置了 `--start-maximized`。

**解决**: 组合使用 launch arg + xdotool 强制最大化:
```javascript
// 1. launch arg
args: ['--start-maximized']

// 2. 等待窗口出现后用 xdotool 强制调整
await sleep(800);
const wid = execSync(
  `DISPLAY=${display} xdotool search --onlyvisible --class chromium | head -1`
).toString().trim();
if (wid) {
  execSync(`DISPLAY=${display} xdotool windowactivate ${wid} \
    windowsize ${wid} ${screenW} ${screenH} windowmove ${wid} 0 0`);
}
```

---

### ❌ 坑 9: noVNC 显示 "Loading" 不动

**错误**: 用户浏览器打开 noVNC 页面后一直停在 "Loading"。

**原因**: websockify 内置 HTTP 服务器提供 noVNC 文件时，`.js` 文件的 MIME 类型不是 `text/javascript`。
浏览器对 ES Module 的 MIME 类型要求严格，不正确的类型会导致模块加载被拒绝。

**解决**: 不使用 websockify 的 HTTP 服务功能，改由 Express 提供 noVNC 静态文件:
```javascript
app.use('/vnc-assets', express.static('/opt/noVNC'));
```

---

### ❌ 坑 10: noVNC ES Module 加载失败 (43 个文件)

**错误**: `Failed to fetch dynamically imported module: .../vnc-assets/core/rfb.js`

**原因**: noVNC v1.6 使用 ES Module 系统，`rfb.js` 及其依赖链共 43 个 JS 文件。
用户的浏览器到服务器之间可能网络不稳定，导致其中某个文件加载超时或失败。

**解决**: 用 esbuild 将所有 43 个文件打包成**单个 IIFE 文件** (~186KB):
```bash
npx esbuild entry.js --bundle --format=iife --outfile=novnc-bundle.js --minify
```

⚠️ **注意**: noVNC 的 `core/util/browser.js` 包含 `top-level await`，IIFE 格式不支持。
必须先修补:
```bash
# 将 top-level await 改为 .then()
sed -i 's/supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();/\
_checkWebCodecsH264DecodeSupport().then(v => { supportsWebCodecsH264Decode = v; });/' \
  browser.js
```

---

### ❌ 坑 11: 打包的 noVNC bundle 外部加载失败

**错误**: `<script src="/public/novnc-bundle.js">` onerror 触发，bundle 加载失败。

**原因**: 190KB 的 JS 文件作为外部脚本加载时，某些用户网络环境下会超时。

**解决**: 将 noVNC bundle **内联到 HTML 页面**，随 HTML 一起返回:
```javascript
const noVNCBundle = fs.readFileSync('server/public/novnc-bundle.js', 'utf8');

app.get('/vnc/:profileId', (req, res) => {
  const html = `
    <script>
    // --- noVNC bundle (inlined) ---
    ${noVNCBundle}
    </script>
    <script>
    var RFB = window.noVNC_RFB;
    // ... 连接逻辑
    </script>
  `;
  res.type('html').send(html);
});
```

---

### ❌ 坑 12: WebSocket 代理 — http-proxy 与 noVNC 不兼容

**错误**: 通过 `http-proxy` 代理 WebSocket 时，noVNC 连接黑屏。

**原因**: `http-proxy` 的 WebSocket 代理在转发 noVNC 的 binary 帧时可能存在兼容性问题。

**解决**: 最终方案 — **双重连接策略**:
1. **主连接**: 浏览器直连 websockify 端口 (如 `ws://IP:6181`)
2. **备用连接**: 通过 Node.js 服务器的 http-proxy 代理 (`ws://IP:3000/ws-vnc/profileId`)

```javascript
// VNC 页面内的连接逻辑
var urls = [
  { url: 'ws://host:6181', label: '直连' },
  { url: 'ws://host:3000/ws-vnc/profileId', label: '代理' },
];
function tryVNC(idx) {
  // 尝试第一个，8秒超时后自动切换到备用
}
```

---

### ❌ 坑 13: 代理字符串自动解析

**需求**: 用户粘贴 `host:port:user:pass` 格式的代理字符串，自动拆分填入各字段。

**实现**: 前端 `parseProxyString()` 函数:
```javascript
function parseProxyString(str) {
  const s = str.trim();
  // 支持格式: host:port:user:pass
  const parts = s.split(':');
  if (parts.length >= 4) {
    return {
      host: parts[0],
      port: parseInt(parts[1]),
      user: parts[2],
      pass: parts.slice(3).join(':'),  // 密码中可能含冒号
    };
  }
}
```

---

### ❌ 坑 14: 下拉菜单 hover 方式不可用

**错误**: 表格行的操作下拉菜单 (⋮) 用 CSS `:hover` 实现，鼠标移动到菜单项时容易离开 hover 区域导致菜单消失。

**解决**: 改用 React state + click 事件控制:
```javascript
const [openMenu, setOpenMenu] = useState(null);
// 点击 ⋮ 切换菜单
// 点击页面其他地方关闭菜单
useEffect(() => {
  if (!openMenu) return;
  const close = () => setOpenMenu(null);
  document.addEventListener('click', close);
  return () => document.removeEventListener('click', close);
}, [openMenu]);
```

菜单方向改为**向上弹出** (`bottom: calc(100% + 4px)`) 避免被表格底部遮挡。

---

## 四、架构要点

### 4.1 代理认证中转流程

```
Chromium → localhost:21080 (无认证 SOCKS5)
    ↓
proxy-relay.js (Node.js)
    ↓
upstream proxy (带认证 SOCKS5)
    ↓
目标网站
```

### 4.2 VNC 显示流程

```
Chromium → Xvfb (虚拟显示 :101)
    ↓
x11vnc (VNC 服务器, 端口 6001)
    ↓
websockify (WebSocket 桥接, 端口 6181)
    ↓
noVNC (浏览器 HTML5 VNC 客户端)
    ↓
用户浏览器
```

### 4.3 noVNC 内联方案

```
Express 服务器启动时:
  → 读取 novnc-bundle.js 到内存

用户请求 /vnc/:profileId:
  → 生成 HTML 页面，bundle 代码内联在 <script> 中
  → 单次 HTTP 请求即可加载整个 VNC 查看器
  → 不依赖任何外部 JS 文件
```

### 4.4 指纹注入

浏览器启动时通过 Playwright 的 `addInitScript` 注入两个脚本:
1. `inject-fingerprint.js` — 覆盖 navigator、screen、canvas、WebGL、AudioContext 等 API
2. `reddit-stealth.js` — 针对 Reddit 的额外防检测措施

---

## 五、常见运维操作

```bash
# 查看运行中的浏览器进程
ps aux | grep -E "Xvfb|x11vnc|chromium|websockify" | grep -v grep

# 强制清理所有浏览器进程
pkill -9 -f Xvfb; pkill -9 -f x11vnc; pkill -9 -f websockify; pkill -9 -f chromium; pkill -9 -f fluxbox

# 截取虚拟显示屏幕截图 (调试用)
DISPLAY=:101 import -window root /tmp/screenshot.png

# 测试 VNC 端口
echo "" | nc -w 2 127.0.0.1 6001  # 应返回 "RFB 003.008"

# 测试 WebSocket
wscat -c "ws://127.0.0.1:6181" --subprotocol binary

# 查看服务器日志
tail -f /tmp/fpbrowser.log
```

---

## 六、AI 部署注意事项

如果你是 AI 助手正在部署此项目，请注意:

1. **noVNC bundle 必须重新构建** — `server/public/novnc-bundle.js` 不在 git 中，需要按 2.4 节的步骤构建
2. **websockify 必须通过 pip 安装** — 不要直接用 noVNC 自带的 run 脚本
3. **防火墙必须开放 6080-6200** — websockify 在动态端口上监听
4. **Chromium 认证代理需要中转** — 不能直接传 SOCKS5 用户名密码给 Playwright
5. **noVNC 的 top-level await 必须修补** — 否则 esbuild IIFE 打包会失败
6. **noVNC bundle 必须内联** — 作为外部 JS 文件加载经常失败
7. **Express v5 的通配路由** — 用 `'/{*path}'` 而不是 `'*'`
8. **服务器重启后浏览器状态丢失** — `activeBrowsers` 存在内存中，重启后需要清理残留进程
