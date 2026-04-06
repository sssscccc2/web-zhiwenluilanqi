import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FileManager.css';

const API = '/api/files';

function formatSize(bytes) {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getIcon(item) {
  if (item.type === 'folder') return '📁';
  const ext = item.ext;
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) return '🖼️';
  if (['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv'].includes(ext)) return '🎬';
  if (['.mp3', '.wav', '.ogg', '.flac', '.aac'].includes(ext)) return '🎵';
  if (['.pdf'].includes(ext)) return '📄';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦';
  if (['.txt', '.md', '.log', '.json', '.xml', '.csv'].includes(ext)) return '📝';
  if (['.js', '.ts', '.py', '.html', '.css', '.jsx', '.tsx'].includes(ext)) return '💻';
  return '📎';
}

export default function FileManager() {
  const [currentDir, setCurrentDir] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const loadDir = useCallback(async (dir) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/list?dir=${encodeURIComponent(dir || '/')}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setCurrentDir(data.data.path);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDir('/'); }, [loadDir]);

  const navigateTo = (dir) => loadDir(dir);

  const navigateUp = () => {
    if (currentDir === '/') return;
    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
    loadDir(parent);
  };

  const openItem = (item) => {
    if (item.type === 'folder') {
      const newDir = currentDir === '/' ? '/' + item.name : currentDir + '/' + item.name;
      loadDir(newDir);
    } else {
      const filePath = currentDir === '/' ? item.name : currentDir.slice(1) + '/' + item.name;
      const ext = item.ext;
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
        setPreviewFile({ ...item, url: `/uploads/${filePath}`, type: 'image' });
      } else if (['.mp4', '.webm'].includes(ext)) {
        setPreviewFile({ ...item, url: `/uploads/${filePath}`, type: 'video' });
      } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
        setPreviewFile({ ...item, url: `/uploads/${filePath}`, type: 'audio' });
      } else if (['.txt', '.md', '.log', '.json', '.xml', '.csv', '.js', '.ts', '.py', '.html', '.css'].includes(ext)) {
        setPreviewFile({ ...item, url: `/uploads/${filePath}`, type: 'text' });
        fetch(`/uploads/${filePath}`).then(r => r.text()).then(text => {
          setPreviewFile(prev => prev ? { ...prev, content: text } : null);
        });
      } else {
        window.open(`${API}/download?path=${encodeURIComponent(currentDir === '/' ? item.name : currentDir.slice(1) + '/' + item.name)}`);
      }
    }
  };

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    for (const f of files) formData.append('files', f);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100));
      };
      await new Promise((resolve, reject) => {
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', `${API}/upload?dir=${encodeURIComponent(currentDir === '/' ? '' : currentDir.slice(1))}`);
        xhr.send(formData);
      });
      await loadDir(currentDir);
    } catch (e) {
      alert('上传失败: ' + e.message);
    }
    setUploading(false);
    setUploadProgress(0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await fetch(`${API}/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir === '/' ? '' : currentDir.slice(1), name: newFolderName.trim() }),
      });
      setNewFolderName('');
      setShowNewFolder(false);
      await loadDir(currentDir);
    } catch (e) {
      alert('创建失败: ' + e.message);
    }
  };

  const deleteItem = async (item) => {
    const label = item.type === 'folder' ? `文件夹 "${item.name}" 及其所有内容` : `文件 "${item.name}"`;
    if (!confirm(`确定删除 ${label}？`)) return;
    try {
      await fetch(`${API}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir === '/' ? '' : currentDir.slice(1), name: item.name }),
      });
      await loadDir(currentDir);
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const downloadItem = (item) => {
    const filePath = currentDir === '/' ? item.name : currentDir.slice(1) + '/' + item.name;
    window.open(`${API}/download?path=${encodeURIComponent(filePath)}`);
  };

  const breadcrumbs = currentDir === '/' ? ['/'] : ['/', ...currentDir.slice(1).split('/')];

  return (
    <div
      className={`file-manager ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="fm-toolbar">
        <div className="fm-breadcrumb">
          {breadcrumbs.map((seg, i) => {
            const path = i === 0 ? '/' : '/' + breadcrumbs.slice(1, i + 1).join('/');
            return (
              <span key={i}>
                {i > 0 && <span className="fm-sep">/</span>}
                <button className="fm-crumb" onClick={() => navigateTo(path)}>
                  {i === 0 ? '根目录' : seg}
                </button>
              </span>
            );
          })}
        </div>
        <div className="fm-actions">
          {currentDir !== '/' && (
            <button className="fm-btn" onClick={navigateUp} title="返回上级">⬆ 上级</button>
          )}
          <button className="fm-btn fm-btn-primary" onClick={() => fileInputRef.current?.click()}>
            ⬆ 上传文件
          </button>
          <button className="fm-btn" onClick={() => setShowNewFolder(true)}>
            📁 新建文件夹
          </button>
          <button className="fm-btn" onClick={() => loadDir(currentDir)} title="刷新">
            🔄
          </button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="fm-new-folder">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            placeholder="文件夹名称"
            autoFocus
          />
          <button className="fm-btn fm-btn-primary" onClick={createFolder}>创建</button>
          <button className="fm-btn" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>取消</button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="fm-upload-bar">
          <div className="fm-upload-progress" style={{ width: uploadProgress + '%' }} />
          <span className="fm-upload-text">上传中 {uploadProgress}%</span>
        </div>
      )}

      {/* Drag hint */}
      {dragOver && (
        <div className="fm-drag-hint">
          <div className="fm-drag-icon">📤</div>
          <div>松开鼠标上传文件</div>
        </div>
      )}

      {/* File list */}
      <div className="fm-table-wrap">
        <table className="fm-table">
          <thead>
            <tr>
              <th className="fm-col-icon"></th>
              <th className="fm-col-name">名称</th>
              <th className="fm-col-size">大小</th>
              <th className="fm-col-time">修改时间</th>
              <th className="fm-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="fm-empty">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="5" className="fm-empty">空文件夹 — 拖拽文件到此处上传</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.name} className="fm-row" onDoubleClick={() => openItem(item)}>
                  <td className="fm-col-icon">{getIcon(item)}</td>
                  <td className="fm-col-name">
                    <button className="fm-name-btn" onClick={() => openItem(item)}>
                      {item.name}
                    </button>
                  </td>
                  <td className="fm-col-size">{item.type === 'folder' ? '—' : formatSize(item.size)}</td>
                  <td className="fm-col-time">{formatDate(item.mtime)}</td>
                  <td className="fm-col-actions">
                    <div className="fm-item-actions">
                      {item.type === 'file' && (
                        <button className="fm-act" onClick={() => downloadItem(item)} title="下载">⬇</button>
                      )}
                      <button className="fm-act fm-act-del" onClick={(e) => { e.stopPropagation(); deleteItem(item); }} title="删除">✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Preview modal */}
      {previewFile && (
        <div className="fm-preview-overlay" onClick={() => setPreviewFile(null)}>
          <div className="fm-preview-box" onClick={(e) => e.stopPropagation()}>
            <div className="fm-preview-header">
              <span>{previewFile.name}</span>
              <button className="fm-preview-close" onClick={() => setPreviewFile(null)}>✕</button>
            </div>
            <div className="fm-preview-content">
              {previewFile.type === 'image' && <img src={previewFile.url} alt={previewFile.name} />}
              {previewFile.type === 'video' && <video src={previewFile.url} controls autoPlay />}
              {previewFile.type === 'audio' && <audio src={previewFile.url} controls autoPlay />}
              {previewFile.type === 'text' && (
                <pre className="fm-preview-text">{previewFile.content || '加载中...'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
