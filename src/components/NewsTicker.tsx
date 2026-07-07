import { useGameStore } from '../store/gameStore';
import type { NewsItem } from '../store/gameStore';
import './NewsTicker.css';

export default function NewsTicker() {
  const { news } = useGameStore();

  // NewsItem.type encodes sentiment: verified = 利好, warning = 利空, unverified = 中性.
  const getNewsIcon = (type: NewsItem['type']) => {
    switch (type) {
      case 'verified': return '📈';
      case 'warning': return '📉';
      default: return '📋';
    }
  };

  const getNewsColor = (type: NewsItem['type']) => {
    switch (type) {
      case 'verified': return 'var(--color-success)';
      case 'warning': return 'var(--color-danger)';
      default: return 'var(--color-info)';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="news-ticker">
      <div className="news-header">
        <h3 className="news-title">
          <span className="title-icon">📰</span>
          实时新闻
        </h3>
      </div>

      <div className="news-list">
        {news.length === 0 ? (
          <div className="no-news">
            <span>暂无新闻</span>
          </div>
        ) : (
          news.map((item, index) => (
            <div 
              key={item.id} 
              className="news-item"
              style={{ 
                '--delay': `${index * 0.05}s`,
                '--news-color': getNewsColor(item.type)
              } as React.CSSProperties}
            >
              <div className="news-icon">
                {getNewsIcon(item.type)}
              </div>
              <div className="news-content">
                <div className="news-meta">
                  <span 
                    className="news-type"
                    style={{ color: getNewsColor(item.type) }}
                  >
                    {item.type === 'verified' ? '利好' : item.type === 'warning' ? '利空' : '中性'}
                  </span>
                  <span className="news-time">{formatTime(item.timestamp)}</span>
                </div>
                <p className="news-text">{item.title}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
