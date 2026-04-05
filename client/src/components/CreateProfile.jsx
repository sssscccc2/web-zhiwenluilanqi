import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import './CreateProfile.css';

export default function CreateProfile({ editProfile, onDone }) {
  const [form, setForm] = useState({
    name: '',
    group_name: 'default',
    proxy_type: 'socks5',
    proxy_host: '',
    proxy_port: '',
    proxy_user: '',
    proxy_pass: '',
    notes: '',
  });
  const [fingerprint, setFingerprint] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fpTab, setFpTab] = useState('basic');

  const [proxyRaw, setProxyRaw] = useState('');
  const [proxyParsed, setProxyParsed] = useState(false);
  const [geoInfo, setGeoInfo] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const geoTimer = useRef(null);

  useEffect(() => {
    if (editProfile) {
      setForm({
        name: editProfile.name,
        group_name: editProfile.group_name || 'default',
        proxy_type: editProfile.proxy_type || 'socks5',
        proxy_host: editProfile.proxy_host || '',
        proxy_port: editProfile.proxy_port || '',
        proxy_user: editProfile.proxy_user || '',
        proxy_pass: editProfile.proxy_pass || '',
        notes: editProfile.notes || '',
      });
      setFingerprint(editProfile.fingerprint);
      if (editProfile.proxy_host) {
        setProxyParsed(true);
      }
    } else {
      generateNewFP();
    }
  }, [editProfile]);

  const generateNewFP = async () => {
    try {
      const fp = await api.generateFingerprint();
      setFingerprint(fp);
    } catch (err) {
      console.error('Generate FP failed:', err);
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // --- Proxy parsing ---
  const parseProxyString = (raw) => {
    setProxyRaw(raw);
    setProxyParsed(false);
    setGeoInfo(null);
    if (!raw.trim()) return;

    let str = raw.trim();
    let type = form.proxy_type || 'socks5';

    const protoMatch = str.match(/^(socks5|socks4|http|https):\/\//i);
    if (protoMatch) {
      type = protoMatch[1].toLowerCase();
      str = str.slice(protoMatch[0].length);
    }

    let host = '', port = '', user = '', pass = '';

    if (str.includes('@')) {
      const atIdx = str.lastIndexOf('@');
      const before = str.slice(0, atIdx);
      const after = str.slice(atIdx + 1);
      const afterParts = after.split(':');
      const beforeParts = before.split(':');

      if (afterParts.length >= 2 && /^\d+$/.test(afterParts[afterParts.length - 1])) {
        host = afterParts.slice(0, -1).join(':');
        port = afterParts[afterParts.length - 1];
        const firstColon = before.indexOf(':');
        if (firstColon > -1) { user = before.slice(0, firstColon); pass = before.slice(firstColon + 1); }
        else { user = before; }
      } else {
        if (beforeParts.length >= 2 && /^\d+$/.test(beforeParts[beforeParts.length - 1])) {
          host = beforeParts.slice(0, -1).join(':');
          port = beforeParts[beforeParts.length - 1];
          const firstColon = after.indexOf(':');
          if (firstColon > -1) { user = after.slice(0, firstColon); pass = after.slice(firstColon + 1); }
          else { user = after; }
        }
      }
    } else {
      const parts = str.split(':');
      if (parts.length >= 2) {
        if (/^\d+$/.test(parts[1])) {
          host = parts[0]; port = parts[1];
          if (parts.length >= 4) { user = parts[2]; pass = parts.slice(3).join(':'); }
          else if (parts.length === 3) { user = parts[2]; }
        } else {
          host = parts[0]; port = parts[1];
          user = parts[2] || ''; pass = parts.slice(3).join(':') || '';
        }
      }
    }

    if (host) {
      setForm(prev => ({ ...prev, proxy_type: type, proxy_host: host, proxy_port: port, proxy_user: user, proxy_pass: pass }));
      setProxyParsed(true);

      // Auto-resolve geo after a short debounce, pass full proxy info
      if (geoTimer.current) clearTimeout(geoTimer.current);
      geoTimer.current = setTimeout(() => resolveGeo({ host, port, user, pass, type }), 300);
    }
  };

  // --- IP Geo resolve (through proxy for real exit IP) ---
  const resolveGeo = async (proxyInfo) => {
    setGeoLoading(true);
    try {
      const { geo, fingerprint: fp } = await api.resolveProxy(proxyInfo);
      setGeoInfo(geo);
      setFingerprint(fp);
    } catch (err) {
      console.error('Geo resolve failed:', err);
      if (!fingerprint) generateNewFP();
    } finally {
      setGeoLoading(false);
    }
  };

  const handleFpChange = (path, value) => {
    setFingerprint(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('请输入配置名称'); return; }
    setSaving(true);
    try {
      const data = { ...form, fingerprint };
      if (editProfile) { await api.updateProfile(editProfile.id, data); }
      else { await api.createProfile(data); }
      onDone();
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="create-profile">
      <div className="create-header">
        <h2>{editProfile ? '编辑配置' : '新建配置'}</h2>
        <button className="btn btn-ghost" onClick={onDone}>返回</button>
      </div>

      <div className="create-body">
        <div className="form-section">
          <h3>基本信息</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>配置名称 *</label>
              <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="例如: Reddit账号1" />
            </div>
            <div className="form-group">
              <label>分组</label>
              <input type="text" value={form.group_name} onChange={(e) => handleChange('group_name', e.target.value)} placeholder="default" />
            </div>
            <div className="form-group full">
              <label>备注</label>
              <textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="可选备注信息" rows={2} />
            </div>
          </div>
        </div>

        {/* Proxy Section */}
        <div className="form-section">
          <div className="section-header">
            <h3>代理设置</h3>
            <div className="section-badges">
              {proxyParsed && <span className="parse-ok">✓ 已识别</span>}
              {geoLoading && <span className="geo-loading">定位中...</span>}
              {geoInfo && <span className="geo-ok">✓ {geoInfo.city}, {geoInfo.region}, {geoInfo.countryCode}</span>}
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label>快捷粘贴（自动识别格式 + 自动匹配指纹）</label>
              <input
                type="text"
                value={proxyRaw}
                onChange={(e) => parseProxyString(e.target.value)}
                onPaste={(e) => { setTimeout(() => parseProxyString(e.target.value), 0); }}
                placeholder="粘贴代理，如: host:port:user:pass — 自动识别IP位置并生成匹配指纹"
                className={proxyParsed ? 'input-parsed' : ''}
              />
              <span className="input-hint">粘贴后自动: 解析代理 → 查询IP位置 → 匹配时区/语言/经纬度 → 生成指纹</span>
            </div>

            {/* Geo info banner */}
            {geoInfo && (
              <div className="form-group full">
                <div className="geo-banner">
                  <div className="geo-flag">{countryFlag(geoInfo.countryCode)}</div>
                  <div className="geo-details">
                    <div className="geo-location">{geoInfo.city}, {geoInfo.region}, {geoInfo.country}</div>
                    <div className="geo-meta">
                      <span>IP: {geoInfo.ip}</span>
                      <span>ISP: {geoInfo.isp}</span>
                      <span>时区: {geoInfo.timezone}</span>
                    </div>
                    <div className="geo-meta">
                      <span>经纬度: {fingerprint?.geolocation?.latitude}, {fingerprint?.geolocation?.longitude}</span>
                      <span>语言: {geoInfo.languages?.join(', ')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>代理类型</label>
              <select value={form.proxy_type} onChange={(e) => handleChange('proxy_type', e.target.value)}>
                <option value="socks5">SOCKS5</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </div>
            <div className="form-group">
              <label>代理地址</label>
              <input type="text" value={form.proxy_host} onChange={(e) => handleChange('proxy_host', e.target.value)} placeholder="127.0.0.1" />
            </div>
            <div className="form-group">
              <label>端口</label>
              <input type="number" value={form.proxy_port} onChange={(e) => handleChange('proxy_port', e.target.value)} placeholder="1080" />
            </div>
            <div className="form-group">
              <label>用户名</label>
              <input type="text" value={form.proxy_user} onChange={(e) => handleChange('proxy_user', e.target.value)} placeholder="可选" />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input type="password" value={form.proxy_pass} onChange={(e) => handleChange('proxy_pass', e.target.value)} placeholder="可选" />
            </div>
          </div>
        </div>

        {/* Fingerprint Section */}
        <div className="form-section">
          <div className="section-header">
            <h3>浏览器指纹</h3>
            <button className="btn btn-ghost btn-sm" onClick={generateNewFP}>重新生成</button>
          </div>

          {fingerprint && (
            <>
              <div className="fp-tabs">
                {['basic', 'screen', 'webgl', 'geo', 'advanced'].map(tab => (
                  <button key={tab} className={`fp-tab ${fpTab === tab ? 'active' : ''}`} onClick={() => setFpTab(tab)}>
                    {{ basic: '基础', screen: '屏幕', webgl: 'WebGL', geo: '地理位置', advanced: '高级' }[tab]}
                  </button>
                ))}
              </div>

              <div className="fp-content">
                {fpTab === 'basic' && (
                  <div className="form-grid">
                    <div className="form-group full">
                      <label>User-Agent</label>
                      <input type="text" value={fingerprint.userAgent} onChange={(e) => handleFpChange('userAgent', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>平台</label>
                      <select value={fingerprint.platform} onChange={(e) => handleFpChange('platform', e.target.value)}>
                        <option value="Win32">Win32</option>
                        <option value="MacIntel">MacIntel</option>
                        <option value="Linux x86_64">Linux x86_64</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>语言</label>
                      <input type="text" value={fingerprint.languages?.join(', ')} onChange={(e) => handleFpChange('languages', e.target.value.split(',').map(s => s.trim()))} />
                    </div>
                    <div className="form-group">
                      <label>时区</label>
                      <input type="text" value={fingerprint.timezone} onChange={(e) => handleFpChange('timezone', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>CPU 核心数</label>
                      <select value={fingerprint.hardwareConcurrency} onChange={(e) => handleFpChange('hardwareConcurrency', parseInt(e.target.value))}>
                        {[2, 4, 8, 12, 16].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>设备内存 (GB)</label>
                      <select value={fingerprint.deviceMemory} onChange={(e) => handleFpChange('deviceMemory', parseInt(e.target.value))}>
                        {[2, 4, 8, 16, 32].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {fpTab === 'screen' && (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>屏幕宽度</label>
                      <input type="number" value={fingerprint.screen?.width} onChange={(e) => handleFpChange('screen.width', parseInt(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>屏幕高度</label>
                      <input type="number" value={fingerprint.screen?.height} onChange={(e) => handleFpChange('screen.height', parseInt(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>色深</label>
                      <select value={fingerprint.screen?.colorDepth} onChange={(e) => handleFpChange('screen.colorDepth', parseInt(e.target.value))}>
                        <option value={24}>24</option>
                        <option value={32}>32</option>
                      </select>
                    </div>
                  </div>
                )}

                {fpTab === 'webgl' && (
                  <div className="form-grid">
                    <div className="form-group full">
                      <label>WebGL Vendor</label>
                      <input type="text" value={fingerprint.webgl?.vendor} onChange={(e) => handleFpChange('webgl.vendor', e.target.value)} />
                    </div>
                    <div className="form-group full">
                      <label>WebGL Renderer</label>
                      <input type="text" value={fingerprint.webgl?.renderer} onChange={(e) => handleFpChange('webgl.renderer', e.target.value)} />
                    </div>
                  </div>
                )}

                {fpTab === 'geo' && (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>纬度 (Latitude)</label>
                      <input type="number" step="0.0001" value={fingerprint.geolocation?.latitude || ''} onChange={(e) => handleFpChange('geolocation.latitude', parseFloat(e.target.value))} placeholder="自动从代理IP获取" />
                    </div>
                    <div className="form-group">
                      <label>经度 (Longitude)</label>
                      <input type="number" step="0.0001" value={fingerprint.geolocation?.longitude || ''} onChange={(e) => handleFpChange('geolocation.longitude', parseFloat(e.target.value))} placeholder="自动从代理IP获取" />
                    </div>
                    <div className="form-group">
                      <label>精度 (Accuracy, 米)</label>
                      <input type="number" value={fingerprint.geolocation?.accuracy || 50} onChange={(e) => handleFpChange('geolocation.accuracy', parseInt(e.target.value))} />
                    </div>
                    <div className="form-group full">
                      <span className="input-hint">
                        {fingerprint.geolocation?.latitude
                          ? `当前坐标已根据代理IP随机偏移（5-15km范围内），确保不会暴露精确位置`
                          : `粘贴代理后会自动查询IP位置并生成随机偏移的经纬度`}
                      </span>
                    </div>
                  </div>
                )}

                {fpTab === 'advanced' && (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>WebRTC</label>
                      <select value={fingerprint.webrtc?.mode} onChange={(e) => handleFpChange('webrtc.mode', e.target.value)}>
                        <option value="fake">阻止泄漏 (推荐)</option>
                        <option value="real">真实</option>
                        <option value="disabled">禁用</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Do Not Track</label>
                      <select value={fingerprint.doNotTrack || ''} onChange={(e) => handleFpChange('doNotTrack', e.target.value || null)}>
                        <option value="">未设置</option>
                        <option value="1">开启</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>触控点数</label>
                      <select value={fingerprint.maxTouchPoints} onChange={(e) => handleFpChange('maxTouchPoints', parseInt(e.target.value))}>
                        <option value={0}>0 (桌面)</option>
                        <option value={10}>10 (触屏)</option>
                      </select>
                    </div>
                    <div className="form-group full">
                      <label>Canvas 噪声种子</label>
                      <input type="text" value={fingerprint.canvas?.noise} readOnly className="readonly" />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onDone}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : (editProfile ? '更新配置' : '创建配置')}
          </button>
        </div>
      </div>
    </div>
  );
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
}
