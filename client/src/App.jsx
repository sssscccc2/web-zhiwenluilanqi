import React, { useState } from 'react';
import ProfileList from './components/ProfileList';
import BrowserView from './components/BrowserView';
import CreateProfile from './components/CreateProfile';
import FileManager from './components/FileManager';
import './App.css';

export default function App() {
  const [view, setView] = useState('profiles');
  const [activeBrowser, setActiveBrowser] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo" onClick={() => { setView('profiles'); setActiveBrowser(null); }}>
            <span className="logo-icon">◈</span>
            <span className="logo-text">FPBrowser</span>
          </div>
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${view === 'profiles' ? 'active' : ''}`}
              onClick={() => { setView('profiles'); setActiveBrowser(null); }}
            >
              浏览器管理
            </button>
            <button
              className={`nav-tab ${view === 'files' ? 'active' : ''}`}
              onClick={() => setView('files')}
            >
              文件管理
            </button>
            {activeBrowser && (
              <button
                className={`nav-tab ${view === 'browser' ? 'active' : ''}`}
                onClick={() => setView('browser')}
              >
                窗口: {activeBrowser.profileName}
              </button>
            )}
            {view === 'create' && (
              <button className="nav-tab active">
                {editingProfile ? '编辑配置' : '新建配置'}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'profiles' && (
          <ProfileList
            onLaunch={(info) => { setActiveBrowser(info); setView('browser'); }}
            onEdit={(profile) => { setEditingProfile(profile); setView('create'); }}
            onNew={() => { setEditingProfile(null); setView('create'); }}
          />
        )}
        {view === 'browser' && activeBrowser && (
          <BrowserView
            browserInfo={activeBrowser}
            onClose={() => { setActiveBrowser(null); setView('profiles'); }}
          />
        )}
        {view === 'files' && <FileManager />}
        {view === 'create' && (
          <CreateProfile
            editProfile={editingProfile}
            onDone={() => { setView('profiles'); setEditingProfile(null); }}
          />
        )}
      </main>
    </div>
  );
}
