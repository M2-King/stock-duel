import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import MarketChart from '../components/MarketChart';
import './RegulatorPanel.css';

type SignalType = 'price_spike' | 'volume_surge' | 'rsi_extreme';

interface DetectedSignal {
  id: string;
  signalType: SignalType;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  symbol: string;
  timestamp: number;
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  price_spike: '价格异常波动',
  volume_surge: '成交量异常放大',
  rsi_extreme: 'RSI 极端偏离',
};

export default function RegulatorPanelPage() {
  const {
    alerts,
    indicators,
    allStocks,
    currentQuote,
    selectSymbol,
    timelineBySymbol,
    klinesBySymbol,
    applyRegulatoryAction,
    justiceScore,
  } = useGameStore();
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [detectedSignals, setDetectedSignals] = useState<DetectedSignal[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

  const symbol = currentQuote.symbol;
  const timeline = timelineBySymbol[symbol] ?? [];
  const klines = klinesBySymbol[symbol] ?? [];

  const handleSelectSymbol = (sym: string) => {
    if (sym === symbol) return;
    selectSymbol(sym);
  };

  // Real-time anomaly detection
  useEffect(() => {
    const now = Date.now();
    const newSignals: DetectedSignal[] = [];

    // Price change > 3% in ~5 min (last 100 timeline points ≈ 5 min @ 3s/tick)
    if (timeline.length >= 20) {
      const lookback = timeline[Math.max(0, timeline.length - 100)];
      const cur = currentQuote.price;
      if (lookback > 0) {
        const pctChange = Math.abs((cur - lookback) / lookback) * 100;
        if (pctChange > 3) {
          const key = `price_${symbol}_${Math.floor(now / 60000)}`;
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key);
            newSignals.push({
              id: key,
              signalType: 'price_spike',
              severity: pctChange > 6 ? 'high' : 'medium',
              title: SIGNAL_LABELS.price_spike,
              description: `${symbol} 5分钟内价格波动 ${pctChange.toFixed(1)}%`,
              symbol,
              timestamp: now,
            });
          }
        }
      }
    }

    // Volume > 3x average
    if (klines.length >= 5) {
      const avgVol = klines.slice(-20).reduce((s, k) => s + k.volume, 0) / Math.min(20, klines.length);
      if (avgVol > 0 && currentQuote.volume > avgVol * 3) {
        const key = `vol_${symbol}_${Math.floor(now / 60000)}`;
        if (!firedRef.current.has(key)) {
          firedRef.current.add(key);
          newSignals.push({
            id: key,
            signalType: 'volume_surge',
            severity: currentQuote.volume > avgVol * 5 ? 'high' : 'medium',
            title: SIGNAL_LABELS.volume_surge,
            description: `${symbol} 成交量达均量 ${(currentQuote.volume / avgVol).toFixed(1)} 倍`,
            symbol,
            timestamp: now,
          });
        }
      }
    }

    // RSI > 80 or < 20
    if (indicators.rsi > 80 || indicators.rsi < 20) {
      const key = `rsi_${symbol}_${Math.floor(now / 120000)}`;
      if (!firedRef.current.has(key)) {
        firedRef.current.add(key);
        newSignals.push({
          id: key,
          signalType: 'rsi_extreme',
          severity: indicators.rsi > 85 || indicators.rsi < 15 ? 'high' : 'low',
          title: SIGNAL_LABELS.rsi_extreme,
          description: `${symbol} RSI ${indicators.rsi.toFixed(1)} ${indicators.rsi > 80 ? '超买' : '超卖'}`,
          symbol,
          timestamp: now,
        });
      }
    }

    if (newSignals.length > 0) {
      setDetectedSignals((prev) => [...newSignals, ...prev].slice(0, 50));
    }
  }, [symbol, currentQuote.price, currentQuote.volume, indicators.rsi, timeline, klines]);

  // Merge server alerts (no player identity) with local detected signals
  const publicAlerts = useMemo(() => {
    const serverAlerts = alerts
      .filter((a) => !a.resolved)
      .map((a) => ({
        id: a.id,
        signalType: inferSignalType(a.title),
        severity: a.severity,
        title: stripPlayerInfo(a.title),
        description: stripPlayerInfo(a.description),
        symbol: a.symbol ?? symbol,
        timestamp: a.timestamp,
        fromServer: true,
      }));

    const local = detectedSignals.map((s) => ({ ...s, fromServer: false }));
    return [...local, ...serverAlerts].sort((a, b) => b.timestamp - a.timestamp);
  }, [alerts, detectedSignals, symbol]);

  const filteredAlerts = filter === 'all'
    ? publicAlerts
    : publicAlerts.filter((a) => a.severity === filter);

  const justiceClass = justiceScore > 50 ? 'positive' : justiceScore < 0 ? 'negative' : 'neutral';

  const handleRegulatoryAction = async (
    alertId: string,
    action: 'warn' | 'freeze' | 'kick',
    alertSymbol: string,
    fromServer: boolean,
  ) => {
    const key = `${alertId}:${action}`;
    if (pendingAction) return;
    setPendingAction(key);
    try {
      const ok = await applyRegulatoryAction(alertId, action, alertSymbol);
      if (ok && !fromServer) {
        setDetectedSignals((prev) => prev.filter((s) => s.id !== alertId));
      }
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="regulator-page">
      <div className="regulator-top-bar">
        <div className="justice-card">
          <div className="justice-label">正义分 Justice Score</div>
          <div className={`justice-value mono ${justiceClass}`}>{justiceScore}</div>
          <div className="justice-hint">
            {justiceScore > 50 ? '执法有效' : justiceScore < 0 ? '误判过多' : '继续观察'}
          </div>
        </div>
        <div className="stock-selector-card">
          <span className="selector-label">监控标的</span>
          <div className="symbol-chips">
            {allStocks.map((s) => {
              const pct = s.changePercent;
              const isActive = s.symbol === symbol;
              return (
                <button
                  key={s.symbol}
                  type="button"
                  className={`symbol-chip ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectSymbol(s.symbol)}
                >
                  <span>{s.symbol}</span>
                  <span className={pct >= 0 ? 'up' : 'down'}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
          <div className="selector-price mono">
            {symbol} @ ¥{currentQuote.price.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="regulator-layout">
        <div className="regulator-chart">
          <MarketChart compact />
        </div>

        <div className="regulator-side-panels">
          <div className="indicators-panel">
            <h3 className="section-title">技术指标</h3>
            <div className="indicators-grid">
              <div className="indicator-card">
                <div className="indicator-name">MA</div>
                <div className="iv-row"><span>MA5</span><span className="mono">{indicators.ma5.toFixed(2)}</span></div>
                <div className="iv-row"><span>MA10</span><span className="mono">{indicators.ma10.toFixed(2)}</span></div>
                <div className="iv-row"><span>MA20</span><span className="mono">{indicators.ma20.toFixed(2)}</span></div>
              </div>
              <div className="indicator-card">
                <div className="indicator-name">MACD</div>
                <div className="iv-row"><span>DIF</span><span className="mono">{indicators.macd.diff.toFixed(4)}</span></div>
                <div className="iv-row"><span>DEA</span><span className="mono">{indicators.macd.dea.toFixed(4)}</span></div>
                <div className="iv-row"><span>MACD</span><span className="mono">{indicators.macd.bar.toFixed(4)}</span></div>
              </div>
              <div className="indicator-card">
                <div className="indicator-name">RSI</div>
                <div className="iv-row large"><span>Value</span><span className={`mono ${indicators.rsi > 80 || indicators.rsi < 20 ? 'rsi-alert' : ''}`}>{indicators.rsi.toFixed(1)}</span></div>
              </div>
              <div className="indicator-card">
                <div className="indicator-name">BOLL</div>
                <div className="iv-row"><span>Upper</span><span className="mono">{indicators.boll.upper.toFixed(2)}</span></div>
                <div className="iv-row"><span>Middle</span><span className="mono">{indicators.boll.middle.toFixed(2)}</span></div>
                <div className="iv-row"><span>Lower</span><span className="mono">{indicators.boll.lower.toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          <div className="alerts-section">
            <div className="section-header">
              <h3 className="section-title">异常信号</h3>
              <div className="alert-filters">
                {(['all', 'high', 'medium', 'low'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`filter-btn ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? '全部' : f === 'high' ? '高' : f === 'medium' ? '中' : '低'}
                  </button>
                ))}
              </div>
            </div>

            <div className="alerts-list">
              {filteredAlerts.length === 0 ? (
                <div className="empty-alerts">
                  <div className="empty-icon">✅</div>
                  <div>暂无异常信号</div>
                  <div className="empty-sub">市场运行正常</div>
                </div>
              ) : filteredAlerts.map((alert) => (
                <div key={alert.id} className={`alert-card severity-${alert.severity}`}>
                  <div className="alert-header">
                    <span className={`severity-tag ${alert.severity}`}>
                      {alert.severity === 'high' ? '高' : alert.severity === 'medium' ? '中' : '低'}
                    </span>
                    <span className="signal-type-tag">{SIGNAL_LABELS[alert.signalType] ?? alert.title}</span>
                    <span className="alert-symbol">{alert.symbol}</span>
                    <span className="alert-time">{formatTime(alert.timestamp)}</span>
                  </div>
                  <p className="alert-desc">{alert.description}</p>
                  <div className="alert-actions">
                    {(['warn', 'freeze', 'kick'] as const).map((action) => {
                      const key = `${alert.id}:${action}`;
                      const isPending = pendingAction === key;
                      const labels = { warn: '⚠️ 警告', freeze: '🔒 冻结', kick: '🚫 踢出' };
                      return (
                        <button
                          key={action}
                          type="button"
                          className={`alert-action ${action}${isPending ? ' pending' : ''}`}
                          disabled={!!pendingAction}
                          onClick={() => void handleRegulatoryAction(alert.id, action, alert.symbol, alert.fromServer)}
                        >
                          {isPending ? '处理中…' : labels[action]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function inferSignalType(title: string): SignalType {
  if (title.includes('成交量') || title.includes('Volume')) return 'volume_surge';
  if (title.includes('RSI') || title.includes('技术')) return 'rsi_extreme';
  return 'price_spike';
}

function stripPlayerInfo(text: string): string {
  return text
    .replace(/用户\s*\S+/g, '某交易者')
    .replace(/player\s*\S+/gi, '某交易者')
    .replace(/dealer|retail|庄家|散户/gi, '交易者');
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}分${s}秒前` : `${s}秒前`;
}
