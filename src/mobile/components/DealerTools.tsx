/**
 * 移动端庄家工具面板（6 工具）
 *  - 2 列网格
 *  - 每个卡：图标 + 名称 + power 滑块 + Use 按钮
 *  - cost 实时从后端 /api/dealer/preview-cost 拉
 */

import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { get } from '../../services/apiService';
import { useTheme } from '../hooks/useTheme';

type ToolType = 'pump' | 'press' | 'accumulate' | 'distribute' | 'wash' | 'fake';

interface Tool {
  id: ToolType;
  label: string;
  cn: string;
  icon: string;
  accent: string;
  iconBg: string;
  desc: string;
}

const TOOLS: Tool[] = [
  { id: 'pump',       label: 'Pump',       cn: '拉升',  icon: '📈', accent: '#22c55e', iconBg: 'rgba(34,197,94,0.18)',  desc: '推高股价' },
  { id: 'press',      label: 'Press',      cn: '压价',  icon: '📉', accent: '#ef4444', iconBg: 'rgba(239,68,68,0.18)',  desc: '砸盘压价' },
  { id: 'accumulate', label: 'Accumulate', cn: '吸筹',  icon: '🛒', accent: '#a78bfa', iconBg: 'rgba(167,139,250,0.18)', desc: '低位建仓' },
  { id: 'distribute', label: 'Distribute', cn: '出货',  icon: '📤', accent: '#f97316', iconBg: 'rgba(249,115,22,0.18)', desc: '高位派发' },
  { id: 'wash',       label: 'Wash',       cn: '对敲',  icon: '🔄', accent: '#eab308', iconBg: 'rgba(234,179,8,0.18)',  desc: '对敲虚增量' },
  { id: 'fake',       label: 'Spoof',      cn: '假挂单', icon: '🎭', accent: '#06b6d4', iconBg: 'rgba(6,182,212,0.18)',  desc: '挂大单诱盘' },
];

interface Props {
  symbol: string;
}

export default function MobileDealerTools({ symbol }: Props) {
  const currentQuote = useGameStore((s) => s.currentQuote);
  const dealerResources = useGameStore((s) => s.dealerResources);
  const executeDealerAction = useGameStore((s) => s.executeDealerAction);

  const { theme } = useTheme();

  const cash = dealerResources?.cash ?? 0;
  const risk = dealerResources?.riskIndex ?? 0;
  const upper = (currentQuote.prevClose || currentQuote.price) * 1.10;
  const lower = (currentQuote.prevClose || currentQuote.price) * 0.90;
  const isUpper = currentQuote.price >= upper - 0.001;
  const isLower = currentQuote.price <= lower + 0.001;

  // 每张卡 power
  const [powerMap, setPowerMap] = useState<Record<ToolType, number>>({
    pump: 50, press: 50, accumulate: 50, distribute: 50, wash: 50, fake: 50,
  });
  // 后端 cost
  const [costMap, setCostMap] = useState<Record<ToolType, number>>({
    pump: 0, press: 0, accumulate: 0, distribute: 0, wash: 0, fake: 0,
  });
  const [loading, setLoading] = useState<Record<ToolType, boolean>>({
    pump: false, press: false, accumulate: false, distribute: false, wash: false, fake: false,
  });
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  // 取 cost
  const refreshCost = async (id: ToolType) => {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      const res: any = await get(`/api/dealer/preview-cost?type=${id}&power=${powerMap[id]}&symbol=${symbol}`);
      if (res?.code === 0 && typeof res.data?.cost === 'number') {
        setCostMap((m) => ({ ...m, [id]: res.data.cost }));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  };

  // symbol / power 变化时刷新全部
  useEffect(() => {
    (Object.keys(powerMap) as ToolType[]).forEach((id) => refreshCost(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, currentQuote.price]);

  const onUse = async (tool: Tool) => {
    const power = powerMap[tool.id];
    const cost = costMap[tool.id] || 0;
    if ((tool.id === 'pump' && isUpper) || (tool.id === 'press' && isLower)) {
      setFeedback({ kind: 'error', msg: `${tool.id === 'pump' ? '已涨停' : '已跌停'}，无法操作` });
      setTimeout(() => setFeedback(null), 1500);
      return;
    }
    if (cash < cost) {
      setFeedback({ kind: 'error', msg: `资金不足：需要 ${fmtMoney(cost)}` });
      setTimeout(() => setFeedback(null), 1500);
      return;
    }
    const r = await Promise.resolve(executeDealerAction({ type: tool.id, power, cost }));
    if (r?.success) {
      setFeedback({ kind: 'success', msg: `${tool.cn} 成功 — ${fmtMoney(cost)}` });
      refreshCost(tool.id);
    } else {
      setFeedback({ kind: 'error', msg: r?.error || '执行失败' });
    }
    setTimeout(() => setFeedback(null), 1800);
  };

  return (
    <div className="m-dealer-tools">
      <h3 className="m-section-title">庄家工具</h3>

      {/* 操作标的切换栏 */}
      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <p style={{ fontSize: 11, color: 'var(--m-text-3)', margin: 0 }}>
          操作标的：<span style={{ color: 'var(--m-text)' }} className="m-mono">{symbol}</span>
          <span style={{ marginLeft: 8 }}>现价 <span className={`m-mono ${currentQuote.change >= 0 ? 'm-up' : 'm-down'}`}>{currentQuote.price.toFixed(2)}</span></span>
        </p>
      </div>

      {/* 资源条 */}
      <section className="m-card" style={{ margin: '0 16px 12px', padding: '12px 14px' }}>
        <div className="m-card-row" style={{ borderTop: 'none', padding: '4px 0' }}>
          <span className="label">资金池</span>
          <span className="value m-mono">{fmtMoney(cash)}</span>
        </div>
        <div className="m-card-row" style={{ padding: '4px 0' }}>
          <span className="label">风险</span>
          <span className={`value m-mono ${risk > 70 ? 'm-up' : ''}`}>{risk.toFixed(1)}%</span>
        </div>
      </section>

      {/* 工具网格 */}
      <div className="m-tools-grid">
        {TOOLS.map((t) => {
          const power = powerMap[t.id];
          const cost = costMap[t.id] || 0;
          const blockedByLimit = (t.id === 'pump' && isUpper) || (t.id === 'press' && isLower);
          const tooExpensive = cash < cost && cost > 0;
          const disabled = blockedByLimit || tooExpensive;
          return (
            <div
              key={t.id}
              className="m-tool-card"
              style={{ '--accent': t.accent, '--icon-bg': t.iconBg } as React.CSSProperties}
            >
              <div className="m-tool-icon" style={{ background: t.iconBg }}>
                {t.icon}
              </div>
              <div className="m-tool-name">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--m-text-3)', marginLeft: 6 }}>{t.cn}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--m-text-3)', marginBottom: 6 }}>{t.desc}</div>
              {/* 成本 */}
              <div className="m-tool-cost">
                {loading[t.id] ? (
                  <span className="m-skel" style={{ width: 60, height: 14 }} />
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>成本</span>
                    <span className={`m-mono ${tooExpensive ? 'm-up' : ''}`} style={{ fontSize: 13, fontWeight: 700 }}>
                      {fmtMoney(cost)}
                    </span>
                  </>
                )}
              </div>
              {/* 效果 */}
              <div style={{ fontSize: 11, color: t.accent, marginBottom: 8 }}>
                {effectLabel(t.id, power)}
              </div>
              {/* Power slider */}
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={power}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPowerMap((m) => ({ ...m, [t.id]: v }));
                }}
                onMouseUp={() => refreshCost(t.id)}
                onTouchEnd={() => refreshCost(t.id)}
                disabled={disabled}
                className="m-tool-slider"
                style={{ accentColor: t.accent }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--m-text-3)' }}>
                <span>强度</span>
                <span className="m-mono">{power}%</span>
              </div>
              <button
                type="button"
                className="m-tool-use"
                onClick={() => onUse(t)}
                disabled={disabled}
                style={{
                  marginTop: 8,
                  background: disabled ? 'var(--m-surface-2)' : t.accent,
                  color: disabled ? 'var(--m-text-3)' : (theme === 'light' ? '#fff' : '#0a0a0a'),
                }}
              >
                {blockedByLimit ? (t.id === 'pump' ? '已涨停' : '已跌停') : tooExpensive ? '资金不足' : 'Use'}
              </button>
            </div>
          );
        })}
      </div>

      {feedback && (
        <div
          className="m-toast"
          style={{
            top: 14, left: 16, right: 16,
            background: feedback.kind === 'success'
              ? (theme === 'light' ? 'rgba(5,150,105,0.14)' : 'rgba(34,197,94,0.18)')
              : (theme === 'light' ? 'rgba(225,29,72,0.14)' : 'rgba(239,68,68,0.18)'),
            borderColor: feedback.kind === 'success'
              ? (theme === 'light' ? 'rgba(5,150,105,0.32)' : 'rgba(34,197,94,0.4)')
              : (theme === 'light' ? 'rgba(225,29,72,0.32)' : 'rgba(239,68,68,0.4)'),
          }}
        >
          <span
            className="m-toast-dot"
            style={{
              background: feedback.kind === 'success' ? 'var(--m-success)' : 'var(--m-danger)',
            }}
          />
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  if (n >= 1e8) return `¥${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `¥${(n / 1e4).toFixed(1)}万`;
  return `¥${n.toFixed(0)}`;
}

function effectLabel(id: ToolType, power: number): string {
  switch (id) {
    case 'pump':       return `价 +${(0.3 * power).toFixed(1)}%`;
    case 'press':      return `价 −${(0.3 * power).toFixed(1)}%`;
    case 'distribute': return `价 −${(0.1 * power).toFixed(1)}% · 量 +`;
    case 'accumulate': return `量 +${(0.5 * power).toFixed(0)}%`;
    case 'wash':       return `量 +${(1.5 * power).toFixed(0)}%`;
    case 'fake':       return '卖一挂单 ×8';
  }
}
