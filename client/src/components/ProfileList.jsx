import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import './ProfileList.css';

const PROXY_FLAGS = {
  US: '🇺🇸', GB: '🇬🇧', CN: '🇨🇳', JP: '🇯🇵', KR: '🇰🇷', DE: '🇩🇪', FR: '🇫🇷',
  CA: '🇨🇦', AU: '🇦🇺', BR: '🇧🇷', IN: '🇮🇳', RU: '🇷🇺', SG: '🇸🇬', HK: '🇭🇰',
  TW: '🇹🇼', NL: '🇳🇱', IT: '🇮🇹', ES: '🇪🇸', SE: '🇸🇪', CH: '🇨🇭', TR: '🇹🇷',
  MX: '🇲🇽', PH: '🇵🇭', TH: '🇹🇭', VN: '🇻🇳', ID: '🇮🇩', MY: '🇲🇾', PL: '🇵🇱',
};

function getCountryFromTimezone(tz) {
  if (!tz) return '';
  const map = {
    'America/': 'US', 'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
    'Asia/Singapore': 'SG', 'Asia/Taipei': 'TW', 'Australia/': 'AU', 'America/Toronto': 'CA',
    'America/Sao_Paulo': 'BR', 'Asia/Kolkata': 'IN', 'Europe/Moscow': 'RU',
  };
  for (const [prefix, code] of Object.entries(map)) {
    if (tz.startsWith(prefix)) return code;
  }
  return '';
}

function getOSIcon(fp) {
  if (fp && fp.os) {
    if (fp.os === 'windows') return '🪟';
    if (fp.os === 'macos') return '🍎';
    if (fp.os === 'linux') return '🐧';
  }
  const platform = fp?.platform;
  if (!platform) return '💻';
  if (platform.includes('Win')) return '🪟';
  if (platform.includes('Mac') || platform.includes('iPhone')) return '🍎';
  if (platform.includes('Linux')) return '🐧';
  return '💻';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

export default function ProfileList({ onLaunch, onEdit, onNew }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [groupFilter, setGroupFilter] = useState('all');
  const [openMenu, setOpenMenu] = useState(null);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await api.getProfiles();
      setProfiles(data);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    const interval = setInterval(loadProfiles, 5000);
    return () => clearInterval(interval);
  }, [loadProfiles]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenu]);

  const handleLaunch = async (profile) => {
    setLaunching(profile.id);
    try {
      const info = await api.launchBrowser(profile.id);
      onLaunch({ ...info, profileName: profile.name });
      loadProfiles();
    } catch (err) {
      alert('启动失败: ' + err.message);
    } finally {
      setLaunching(null);
    }
  };

  const handleClose = async (profileId) => {
    try {
      await api.closeBrowser(profileId);
      loadProfiles();
    } catch (err) {
      alert('关闭失败: ' + err.message);
    }
  };

  const handleView = async (profile) => {
    try {
      const info = await api.getBrowserStatus(profile.id);
      onLaunch({ ...info, profileName: profile.name });
    } catch {
      onLaunch({ profileId: profile.id, profileName: profile.name });
    }
  };

  const handleDelete = async (profileId) => {
    if (!confirm('确定要删除此配置？')) return;
    try {
      await api.closeBrowser(profileId).catch(() => {});
      await api.deleteProfile(profileId);
      loadProfiles();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleBatchLaunch = async () => {
    for (const id of selected) {
      const profile = profiles.find(p => p.id === id);
      if (profile && profile.status !== 'running') {
        await handleLaunch(profile);
      }
    }
  };

  const handleBatchClose = async () => {
    for (const id of selected) {
      const profile = profiles.find(p => p.id === id);
      if (profile && profile.status === 'running') {
        await handleClose(id);
      }
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  const groups = [...new Set(profiles.map(p => p.group_name).filter(Boolean))];

  const filtered = profiles.filter(p => {
    const matchSearch = !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.group_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchGroup = groupFilter === 'all' || p.group_name === groupFilter;
    return matchSearch && matchGroup;
  });

  const runningCount = profiles.filter(p => p.status === 'running').length;

  if (loading) {
    return <div className="pl-loading">加载中...</div>;
  }

  return (
    <div className="profile-list">
      {/* Top toolbar */}
      <div className="pl-toolbar">
        <div className="pl-toolbar-left">
          <button className="pl-btn pl-btn-primary" onClick={onNew}>
            <span className="pl-btn-icon">+</span> 新建浏览器
          </button>
          <button className="pl-btn" onClick={handleBatchLaunch} disabled={selected.size === 0}>
            批量打开
          </button>
          <button className="pl-btn" onClick={handleBatchClose} disabled={selected.size === 0}>
            批量关闭
          </button>
        </div>
        <div className="pl-toolbar-right">
          <div className="pl-stats">
            <span className="pl-stat">共 <b>{profiles.length}</b> 个</span>
            <span className="pl-stat running">运行 <b>{runningCount}</b></span>
          </div>
          <div className="pl-filter-group">
            <select
              className="pl-select"
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
            >
              <option value="all">全部分组</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <input
            className="pl-search"
            type="text"
            placeholder="搜索名称 / 备注..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty-icon">📂</div>
          <p>暂无浏览器配置</p>
          <p className="pl-empty-sub">点击「新建浏览器」创建第一个指纹浏览器</p>
        </div>
      ) : (
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="col-id">序号</th>
                <th className="col-group">分组</th>
                <th className="col-name">窗口名称</th>
                <th className="col-proxy">代理IP</th>
                <th className="col-notes">备注</th>
                <th className="col-time">创建时间</th>
                <th className="col-os">配置</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile, idx) => {
                const cc = getCountryFromTimezone(profile.fingerprint?.timezone);
                const flag = PROXY_FLAGS[cc] || '🌐';
                const isRunning = profile.status === 'running';
                const isLaunching = launching === profile.id;

                return (
                  <tr key={profile.id} className={isRunning ? 'row-running' : ''}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(profile.id)}
                        onChange={() => toggleSelect(profile.id)}
                      />
                    </td>
                    <td className="col-id">{idx + 1}</td>
                    <td className="col-group">
                      <span className="group-tag">{profile.group_name || '未分组'}</span>
                    </td>
                    <td className="col-name">
                      <div className="name-cell">
                        <span className={`status-indicator ${isRunning ? 'active' : ''}`} />
                        <span className="profile-name">{profile.name}</span>
                      </div>
                    </td>
                    <td className="col-proxy">
                      {profile.proxy_host ? (
                        <div className="proxy-cell">
                          <span className="proxy-flag">{flag}</span>
                          <div className="proxy-info">
                            <span className="proxy-addr">{profile.proxy_host}:{profile.proxy_port}</span>
                            <span className="proxy-type">{profile.proxy_type?.toUpperCase()}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="no-proxy">直连</span>
                      )}
                    </td>
                    <td className="col-notes">
                      <span className="notes-text">{profile.notes || '-'}</span>
                    </td>
                    <td className="col-time">{formatDate(profile.created_at)}</td>
                    <td className="col-os">
                      <span className="os-icon" title={profile.fingerprint?.platform}>
                        {getOSIcon(profile.fingerprint)}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="action-group">
                        {isRunning ? (
                          <>
                            <button className="act-btn act-view" onClick={() => handleView(profile)}>
                              查看
                            </button>
                            <button className="act-btn act-close" onClick={() => handleClose(profile.id)}>
                              关闭
                            </button>
                          </>
                        ) : (
                          <button
                            className="act-btn act-open"
                            disabled={isLaunching}
                            onClick={() => handleLaunch(profile)}
                          >
                            {isLaunching ? '启动中...' : '打开'}
                          </button>
                        )}
                        <button className="act-btn act-edit" onClick={() => onEdit(profile)}>
                          编辑
                        </button>
                        <div className="act-more">
                          <button
                            className="act-btn act-dots"
                            title="更多"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu === profile.id ? null : profile.id);
                            }}
                          >⋮</button>
                          {openMenu === profile.id && (
                            <div className="act-dropdown show" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { navigator.clipboard.writeText(profile.id); setOpenMenu(null); }}>
                                复制ID
                              </button>
                              <button className="danger" onClick={() => { setOpenMenu(null); handleDelete(profile.id); }}>
                                删除配置
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
