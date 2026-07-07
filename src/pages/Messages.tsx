import { useState } from 'react';
import { useGameStore, Message, Role } from '../store/gameStore';
import './Messages.css';

export default function Messages() {
  const { messages, readMessage, sendMessage } = useGameStore();
  const [selected, setSelected] = useState<Message | null>(messages[0] || null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState<Role>('retail');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'system' | 'player' | 'regulator'>('all');
  
  const unreadCount = messages.filter(m => !m.read).length;
  
  const filtered = messages.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !m.read;
    return m.type === filter;
  });
  
  const handleSelect = (m: Message) => {
    setSelected(m);
    readMessage(m.id);
  };
  
  const handleSend = () => {
    if (composeSubject && composeContent) {
      sendMessage(composeTo, composeSubject, composeContent);
      setShowCompose(false);
      setComposeSubject('');
      setComposeContent('');
    }
  };
  
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    
    if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / 60000)}m ago`;
    }
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    }
    return date.toLocaleDateString();
  };
  
  const getRoleIcon = (r: Role) => {
    return r === 'dealer' ? '🏦' : r === 'retail' ? '📈' : '⚖️';
  };
  
  return (
    <div className="messages-page">
      {/* Header */}
      <div className="messages-header">
        <div className="messages-title-area">
          <h2 className="messages-title">Messages</h2>
          <span className="unread-count">{unreadCount} unread</span>
        </div>
        
        <div className="messages-actions">
          <button 
            className="compose-btn"
            onClick={() => setShowCompose(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Compose
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="messages-filters">
        {(['all', 'unread', 'system', 'player', 'regulator'] as const).map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'unread' && unreadCount > 0 && (
              <span className="filter-badge">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>
      
      {/* Layout */}
      <div className="messages-layout">
        {/* List */}
        <div className="messages-list">
          {filtered.length === 0 ? (
            <div className="empty-messages">
              <p>No messages</p>
            </div>
          ) : filtered.map(m => (
            <button
              key={m.id}
              className={`message-item ${selected?.id === m.id ? 'selected' : ''} ${!m.read ? 'unread' : ''}`}
              onClick={() => handleSelect(m)}
            >
              <div className="message-avatar">
                <span className="avatar-icon">{getRoleIcon(m.fromRole)}</span>
                {!m.read && <span className="unread-dot"></span>}
              </div>
              
              <div className="message-info">
                <div className="message-top">
                  <span className="sender-name">{m.from}</span>
                  <span className="message-time">{formatTime(m.timestamp)}</span>
                </div>
                <div className="message-subject">{m.subject}</div>
                <div className="message-preview">{m.preview}</div>
              </div>
              
              <div className="message-type-badge">
                {m.type === 'system' && <span className="type-tag system">SYSTEM</span>}
                {m.type === 'player' && <span className="type-tag player">PLAYER</span>}
                {m.type === 'regulator' && <span className="type-tag regulator">SEC</span>}
              </div>
            </button>
          ))}
        </div>
        
        {/* Detail */}
        <div className="messages-detail">
          {selected ? (
            <>
              <div className="detail-header">
                <div className="detail-sender">
                  <div className="sender-avatar large">
                    <span>{getRoleIcon(selected.fromRole)}</span>
                  </div>
                  <div>
                    <div className="detail-sender-name">{selected.from}</div>
                    <div className="detail-meta">
                      <span>to me</span>
                      <span>·</span>
                      <span className="mono">{formatTime(selected.timestamp)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="detail-actions">
                  <button type="button" className="detail-icon-btn" title="Reply" onClick={() => {
                    if (!selected) return;
                    setComposeTo(selected.fromRole);
                    setComposeSubject(`Re: ${selected.subject}`);
                    setShowCompose(true);
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 17 4 12 9 7"/>
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                    </svg>
                  </button>
                  <button type="button" className="detail-icon-btn" title="Forward" onClick={() => {
                    if (!selected) return;
                    setComposeSubject(`Fwd: ${selected.subject}`);
                    setComposeContent(`\n\n--- Forwarded ---\n${selected.content}`);
                    setShowCompose(true);
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 17 20 12 15 7"/>
                      <path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
                    </svg>
                  </button>
                  <button type="button" className="detail-icon-btn" title="Delete" onClick={() => {
                    if (!selected) return;
                    if (window.confirm(`Delete message: ${selected.subject}?`)) {
                      useGameStore.setState((s: any) => ({ messages: s.messages.filter((m: Message) => m.id !== selected.id) }));
                      setSelected(null);
                    }
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <h3 className="detail-subject">{selected.subject}</h3>
              
              <div className="detail-content">
                {selected.content.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <div className="empty-icon-large">✉️</div>
              <h3>Select a message</h3>
              <p>Choose a message from the list to read</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Compose Modal */}
      {showCompose && (
        <div className="modal-overlay" onClick={() => setShowCompose(false)}>
          <div className="compose-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New Message</h3>
              <button className="modal-close" onClick={() => setShowCompose(false)}>×</button>
            </div>
            
            <div className="compose-form">
              <div className="form-row-modal">
                <label>To</label>
                <select value={composeTo} onChange={e => setComposeTo(e.target.value as Role)}>
                  <option value="dealer">Market Maker</option>
                  <option value="retail">Retail Trader</option>
                  <option value="regulator">SEC Agent</option>
                </select>
              </div>
              
              <div className="form-row-modal">
                <label>Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Subject..."
                />
              </div>
              
              <div className="form-row-modal">
                <label>Message</label>
                <textarea
                  value={composeContent}
                  onChange={e => setComposeContent(e.target.value)}
                  placeholder="Write your message..."
                  rows={6}
                />
              </div>
              
              <div className="compose-actions">
                <button className="btn-secondary" onClick={() => setShowCompose(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleSend}>Send</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
