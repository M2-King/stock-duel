import { useState } from 'react';
import { useGameStore, NewsItem } from '../store/gameStore';
import './News.css';

type NewsFilter = 'all' | 'verified' | 'unverified' | 'warning';

export default function News() {
  const { news, role, markNewsRead, purchaseInsiderInfo, cash, bookmarkedNews = [], setBookmarkedNews = () => {} } = useGameStore() as any;
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [selected, setSelected] = useState<NewsItem | null>(news[0] || null);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const flashFeedback = (kind: 'success' | 'error', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleBuyInsider = () => {
    if (!selected) return;
    const cost = 2000;
    if (cash < cost) {
      flashFeedback('error', `现金不足：需要 ¥${cost.toLocaleString()}，可用 ¥${cash.toLocaleString()}`);
      return;
    }
    const success = purchaseInsiderInfo(selected.id, cost);
    if (success) {
      flashFeedback('success', `已购买「${selected.title}」，内幕消息将进入你的交易面板`);
    } else {
      flashFeedback('error', '购买失败，请稍后再试');
    }
  };

  const handleShare = () => {
    if (!selected) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`[${selected.title}] ${selected.content || ''}`);
      flashFeedback('success', '已复制到剪贴板');
    } else {
      flashFeedback('success', `分享：${selected.title}`);
    }
  };

  const handleBookmark = () => {
    if (!selected) return;
    flashFeedback('success', `已收藏：${selected.title}`);
  };

  const handleFlag = () => {
    if (!selected) return;
    markNewsRead(selected.id);
    flashFeedback('success', `已标记为审查：${selected.title}`);
  };
  
  // Different content visible to different roles
  const filteredNews = news
    .filter(n => filter === 'all' ? true : n.type === filter)
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()));
  
  // For dealer/regulator, show extra hidden info
  const visibleToDealer = role === 'dealer';
  const visibleToRegulator = role === 'regulator';
  
  const handleSelect = (n: NewsItem) => {
    setSelected(n);
    markNewsRead(n.id);
  };
  
  const counts = {
    all: news.length,
    verified: news.filter(n => n.type === 'verified').length,
    unverified: news.filter(n => n.type === 'unverified').length,
    warning: news.filter(n => n.type === 'warning').length,
  };
  
  return (
    <div className="news-page">
      {/* Filters */}
      <div className="news-toolbar">
        <div className="news-filters">
          {([
            ['all', 'All'],
            ['verified', 'Verified'],
            ['unverified', 'Unverified'],
            ['warning', 'Warning'],
          ] as [NewsFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`filter-btn ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="filter-count">{counts[key]}</span>
            </button>
          ))}
        </div>
        
        <input
          type="text"
          placeholder="Search news..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="news-search"
        />
      </div>
      
      {/* Layout */}
      <div className="news-layout">
        {/* List */}
        <div className="news-list-panel">
          {filteredNews.length === 0 ? (
            <div className="empty-news">
              <p>No news items found</p>
            </div>
          ) : filteredNews.map(n => (
            <button
              key={n.id}
              className={`news-item-card ${selected?.id === n.id ? 'selected' : ''}`}
              onClick={() => handleSelect(n)}
            >
              <div className="news-card-meta">
                <span className={`type-badge ${n.type}`}>
                  {n.type === 'verified' ? '✓ Verified' : 
                   n.type === 'warning' ? '⚠ Warning' : 
                   '? Unverified'}
                </span>
                <span className="news-card-tick mono">Tick {n.tick}</span>
                <span className="news-card-time">{n.time}</span>
              </div>
              <h4 className="news-card-title">{n.title}</h4>
              <div className="news-card-source">
                <span className="source-label">Source:</span>
                <span className="source-name">{n.source}</span>
              </div>
              {n.tags && (
                <div className="news-card-tags">
                  {n.tags.map(t => (
                    <span key={t} className="news-tag">{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
        
        {/* Detail */}
        <div className="news-detail-panel">
          {selected ? (
            <>
              <div className="detail-header">
                <div className="detail-badges">
                  <span className={`type-badge ${selected.type}`}>
                    {selected.type === 'verified' ? '✓ Verified' : 
                     selected.type === 'warning' ? '⚠ Warning' : 
                     '? Unverified'}
                  </span>
                  {selected.tags?.map(t => (
                    <span key={t} className="news-tag">{t}</span>
                  ))}
                </div>
                <span className="detail-time mono">{formatTime(selected.timestamp)}</span>
              </div>
              
              <h2 className="detail-title">{selected.title}</h2>
              
              <div className="detail-source">
                <span className="source-label">Source</span>
                <span className="source-name">{selected.source}</span>
                <span className="source-dot">·</span>
                <span className="mono">{selected.time}</span>
              </div>
              
              <div className="detail-content">
                {selected.content ? (
                  <p>{selected.content}</p>
                ) : (
                  <p className="empty-content">
                    This is a brief news flash. Click to read more details.
                  </p>
                )}
              </div>
              
              {/* Role-specific insights */}
              {visibleToDealer && (
                <div className="role-insight dealer-insight">
                  <div className="insight-header">
                    <span className="insight-icon">🏦</span>
                    <span>Dealer Insight</span>
                  </div>
                  <p>Estimated impact on price: ±5.2%</p>
                  <p>Recommended action: <span className="up">BUY</span> opportunity</p>
                </div>
              )}
              
              {visibleToRegulator && (
                <div className="role-insight regulator-insight">
                  <div className="insight-header">
                    <span className="insight-icon">⚖️</span>
                    <span>Regulator Insight</span>
                  </div>
                  <p>Source reliability score: 8/10</p>
                  <p>No anomalies detected in trading pattern.</p>
                </div>
              )}
              
              {/* Actions */}
              <div className="detail-actions">
                {selected.type === 'unverified' && (
                  <button
                    type="button"
                    className="detail-btn primary"
                    onClick={handleBuyInsider}
                  >
                    Buy Insider Info · $2,000
                  </button>
                )}
                <button type="button" className="detail-btn" onClick={handleShare}>Share</button>
                <button type="button" className="detail-btn" onClick={handleBookmark}>Bookmark</button>
                {role === 'regulator' && (
                  <button type="button" className="detail-btn warning" onClick={handleFlag}>Flag for Review</button>
                )}
                {feedback && (
                  <div className={`order-feedback ${feedback.kind}`} style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    marginTop: 8,
                    width: '100%',
                    background: feedback.kind === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                    color: feedback.kind === 'success' ? '#22c55e' : '#ef4444',
                  }}>{feedback.msg}</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <div className="empty-icon">📰</div>
              <p>Select a news item to read</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
