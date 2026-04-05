import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import './BrowserView.css';

export default function BrowserView({ browserInfo, onClose }) {
  const iframeRef = useRef(null);
  const [scale, setScale] = useState(100);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const info = await api.getBrowserStatus(browserInfo.profileId);
        if (info && info.wsPort) {
          setReady(true);
        } else {
          setError('浏览器未运行');
        }
      } catch (err) {
        setError('浏览器未运行: ' + err.message);
      }
    };
    check();
  }, [browserInfo.profileId]);

  const handleClose = async () => {
    try {
      await api.closeBrowser(browserInfo.profileId);
      onClose();
    } catch (err) {
      alert('关闭失败: ' + err.message);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'clipboard-paste', text }, '*');
      }
    } catch (err) {
      const text = prompt('输入要粘贴到浏览器的文本:');
      if (text && iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'clipboard-paste', text }, '*');
      }
    }
  };

  const vncUrl = `/vnc/${browserInfo.profileId}`;

  if (error) {
    return (
      <div className="browser-error">
        <p>{error}</p>
        <button className="btn btn-ghost" onClick={onClose}>返回列表</button>
      </div>
    );
  }

  if (!ready) return <div className="browser-loading">连接浏览器中...</div>;

  return (
    <div className="browser-view">
      <div className="browser-toolbar">
        <div className="toolbar-left">
          <span className="browser-name">{browserInfo.profileName || '浏览器'}</span>
        </div>
        <div className="toolbar-center">
          <button className="tool-btn" onClick={() => setScale(Math.max(50, scale - 10))}>−</button>
          <span className="scale-value">{scale}%</span>
          <button className="tool-btn" onClick={() => setScale(Math.min(150, scale + 10))}>+</button>
          <button className="tool-btn" onClick={() => setScale(100)}>重置</button>
          <span className="toolbar-sep" />
          <button className="tool-btn tool-clipboard" onClick={handlePaste} title="粘贴本地剪贴板到浏览器">
            📋 粘贴
          </button>
        </div>
        <div className="toolbar-right">
          <button className="tool-btn" onClick={() => window.open(vncUrl, '_blank')}>
            新窗口
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleClose}>关闭浏览器</button>
        </div>
      </div>

      <div className="browser-frame-container">
        <iframe
          ref={iframeRef}
          className="browser-frame"
          src={vncUrl}
          style={{
            transform: `scale(${scale / 100})`,
            transformOrigin: 'top left',
            width: `${10000 / scale}%`,
            height: `${10000 / scale}%`,
          }}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
