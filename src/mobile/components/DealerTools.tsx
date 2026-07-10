/**
 * 移动端庄家工具面板（6 工具）
 *  - cost/effect 随 power / symbol 更新（不随每 tick 价格刷新，避免整页闪烁）
 *  - 工具卡 React.memo，仅数字区重绘
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { useGameStore, usesBackendGameState } from '../../store/gameStore';
import { useDealerResources, useCashBalance } from '../../hooks/useCashBalance';
import { get } from '../../services/apiService';
import { useTheme } from '../hooks/useTheme';
import CashBalance from './CashBalance';
import { formatMobileCash } from '../utils/formatCash';
import {
  previewDealerAction,
  formatDealerCost,
  formatDealerEffectLabel,
} from '../../shared/dealerFormulas';

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

const DEFAULT_POWER: Record<ToolType, number> = {
  pump: 50, press: 50, accumulate: 50, distribute: 50, wash: 50, fake: 50,
};

interface Preview {
  cost: number;
  effectLabel: string;
}

function buildLocalPreview(id: ToolType, symbol: string, power: number): Preview {
  const p = previewDealerAction(id, symbol, power);
  return { cost: p.cost, effectLabel: p.effectLabel };
}

/** 资金拆解 — 操盘只扣「可用现金」，与 Trade / 持仓页同一数据源 */
const DealerResourceBar = memo(function DealerResourceBar() {
  const { riskIndex: risk } = useDealerResources();
  const { cash, positionValue, totalAssets } = useCashBalance();
  return (
    <section className="m-card" style={{ margin: '0 16px 12px', padding: '12px 14px' }}>
      <div className="m-card-row" style={{ borderTop: 'none', padding: '4px 0' }}>
        <span className="label">可用现金</span>
        <CashBalance />
      </div>
      <div className="m-card-row" style={{ padding: '4px 0' }}>
        <span className="label">持仓市值</span>
        <span className="value m-mono">¥{formatMobileCash(positionValue)}</span>
      </div>
      <div className="m-card-row" style={{ padding: '4px 0' }}>
        <span className="label">总资产</span>
        <span className="value m-mono">¥{formatMobileCash(totalAssets)}</span>
      </div>
      <div className="m-card-row" style={{ padding: '4px 0' }}>
        <span className="label">风险</span>
        <span className={`value m-mono ${risk > 70 ? 'm-up' : ''}`}>{risk.toFixed(1)}%</span>
      </div>
      {cash < 1_000_000 && totalAssets > cash + 1_000_000 && (
        <p style={{ fontSize: 10, color: 'var(--m-text-3)', margin: '6px 0 0', lineHeight: 1.45 }}>
          交易与操盘共用同一笔现金。卖出股票后回款会立即计入可用现金，可直接用于拉升等工具。
        </p>
      )}
    </section>
  );
});

/** 现价条 — 只有价格变时重渲 */
const DealerQuoteBar = memo(function DealerQuoteBar({ symbol }: { symbol: string }) {
  const price = useGameStore((s) => s.currentQuote.price);
  const change = useGameStore((s) => s.currentQuote.change);
  return (
    <div style={{ padding: '0 16px', marginBottom: 8 }}>
      <p style={{ fontSize: 11, color: 'var(--m-text-3)', margin: 0 }}>
        操作标的：<span style={{ color: 'var(--m-text)' }} className="m-mono">{symbol}</span>
        <span style={{ marginLeft: 8 }}>
          现价 <span className={`m-mono ${change >= 0 ? 'm-up' : 'm-down'}`}>{price.toFixed(2)}</span>
        </span>
      </p>
    </div>
  );
});

interface ToolCardProps {
  tool: Tool;
  power: number;
  preview: Preview;
  backendMode: boolean;
  blockedByLimit: boolean;
  theme: 'light' | 'dark';
  onPowerChange: (id: ToolType, v: number) => void;
  onPowerCommit: (id: ToolType) => void;
  onUse: (tool: Tool) => void;
}

const DealerToolCard = memo(function DealerToolCard({
  tool,
  power,
  preview,
  blockedByLimit,
  theme,
  onPowerChange,
  onPowerCommit,
  onUse,
}: Omit<ToolCardProps, 'backendMode'>) {
  const { cash } = useDealerResources();
  const cost = preview.cost;
  const tooExpensive = cash < cost && cost > 0;
  const disabled = blockedByLimit || tooExpensive;

  return (
    <div
      className="m-tool-card"
      style={{ '--accent': tool.accent, '--icon-bg': tool.iconBg } as React.CSSProperties}
    >
      <div className="m-tool-icon" style={{ background: tool.iconBg }}>
        {tool.icon}
      </div>
      <div className="m-tool-name">
        <span style={{ fontSize: 14, fontWeight: 600 }}>{tool.label}</span>
        <span style={{ fontSize: 11, color: 'var(--m-text-3)', marginLeft: 6 }}>{tool.cn}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--m-text-3)', marginBottom: 6 }}>{tool.desc}</div>
      <div className="m-tool-cost">
        <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>成本</span>
        <span className={`m-mono ${tooExpensive ? 'm-up' : ''}`} style={{ fontSize: 13, fontWeight: 700 }}>
          {formatDealerCost(cost)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: tool.accent, marginBottom: 8 }}>
        {preview.effectLabel}
      </div>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={power}
        onChange={(e) => onPowerChange(tool.id, Number(e.target.value))}
        onMouseUp={() => onPowerCommit(tool.id)}
        onTouchEnd={() => onPowerCommit(tool.id)}
        disabled={disabled}
        className="m-tool-slider"
        style={{ accentColor: tool.accent }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--m-text-3)' }}>
        <span>强度</span>
        <span className="m-mono">{power}%</span>
      </div>
      <button
        type="button"
        className="m-tool-use"
        onClick={() => onUse(tool)}
        disabled={disabled}
        style={{
          marginTop: 8,
          background: disabled ? 'var(--m-surface-2)' : tool.accent,
          color: disabled ? 'var(--m-text-3)' : (theme === 'light' ? '#fff' : '#0a0a0a'),
        }}
      >
        {blockedByLimit ? (tool.id === 'pump' ? '已涨停' : '已跌停') : tooExpensive ? '资金不足' : 'Use'}
      </button>
    </div>
  );
});

interface Props {
  symbol: string;
}

export default function MobileDealerTools({ symbol }: Props) {
  const { cash } = useDealerResources();
  const executeDealerAction = useGameStore((s) => s.executeDealerAction);
  const backendGame = useGameStore((s) => usesBackendGameState(s));
  const price = useGameStore((s) => s.currentQuote.price);
  const prevClose = useGameStore((s) => s.currentQuote.prevClose || s.currentQuote.price);
  const { theme } = useTheme();

  const upper = prevClose * 1.10;
  const lower = prevClose * 0.90;
  const isUpper = price >= upper - 0.001;
  const isLower = price <= lower + 0.001;

  const [powerMap, setPowerMap] = useState<Record<ToolType, number>>({ ...DEFAULT_POWER });
  const [previewMap, setPreviewMap] = useState<Record<ToolType, Preview>>(() => {
    const m = {} as Record<ToolType, Preview>;
    (Object.keys(DEFAULT_POWER) as ToolType[]).forEach((id) => {
      m[id] = buildLocalPreview(id, symbol, DEFAULT_POWER[id]);
    });
    return m;
  });
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  // 打开操盘面板时从后端拉真值 cash，避免与 Tools 显示脱节
  useEffect(() => {
    if (!backendGame) return;
    const { matchId, refreshPortfolioFromServer } = useGameStore.getState();
    if (matchId) void refreshPortfolioFromServer();
  }, [backendGame, symbol]);

  const refreshPreview = useCallback(async (id: ToolType, power: number) => {
    if (backendGame) {
      try {
        const res: any = await get(`/api/dealer/preview-cost?type=${id}&power=${power}&symbol=${symbol}`);
        if (res?.code === 0 && typeof res.data?.cost === 'number') {
          const effectPct = res.data.effectPct ?? 0;
          setPreviewMap((m) => ({
            ...m,
            [id]: {
              cost: res.data.cost,
              effectLabel: formatDealerEffectLabel(id, effectPct),
            },
          }));
          return;
        }
      } catch {
        /* fall through to local */
      }
    }
    setPreviewMap((m) => ({ ...m, [id]: buildLocalPreview(id, symbol, power) }));
  }, [symbol, backendGame]);

  // symbol / 在线对局变化时刷新全部（桌面端同样不在 price tick 上刷新）
  useEffect(() => {
    (Object.keys(powerMap) as ToolType[]).forEach((id) => {
      refreshPreview(id, powerMap[id]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, backendGame]);

  const onPowerChange = useCallback((id: ToolType, v: number) => {
    setPowerMap((m) => ({ ...m, [id]: v }));
    // 本地即时更新 cost/effect，无需 loading
    setPreviewMap((m) => ({ ...m, [id]: buildLocalPreview(id, symbol, v) }));
  }, [symbol]);

  const onPowerCommit = useCallback((id: ToolType) => {
    refreshPreview(id, powerMap[id]);
  }, [powerMap, refreshPreview]);

  const onUse = useCallback(async (tool: Tool) => {
    const power = powerMap[tool.id];
    const cost = previewMap[tool.id]?.cost ?? 0;
    if ((tool.id === 'pump' && isUpper) || (tool.id === 'press' && isLower)) {
      setFeedback({ kind: 'error', msg: `${tool.id === 'pump' ? '已涨停' : '已跌停'}，无法操作` });
      setTimeout(() => setFeedback(null), 1500);
      return;
    }
    let spendable = cash;
    if (backendGame) {
      const { refreshPortfolioFromServer } = useGameStore.getState();
      const synced = await refreshPortfolioFromServer();
      if (!synced) {
        setFeedback({ kind: 'error', msg: '无法同步服务器资金，请稍后重试' });
        setTimeout(() => setFeedback(null), 1800);
        return;
      }
      spendable = useGameStore.getState().cash;
    }
    if (spendable < cost) {
      setFeedback({ kind: 'error', msg: `资金不足：需要 ${formatDealerCost(cost)}，可用 ${formatDealerCost(spendable)}` });
      setTimeout(() => setFeedback(null), 1500);
      return;
    }
    const r = await Promise.resolve(executeDealerAction({ type: tool.id, power, cost }));
    if (r?.success) {
      if (!backendGame) {
        setFeedback({ kind: 'success', msg: `${tool.cn} 成功 — ${formatDealerCost(cost)}` });
        refreshPreview(tool.id, power);
      }
    } else {
      setFeedback({ kind: 'error', msg: r?.error || '执行失败' });
    }
    setTimeout(() => setFeedback(null), 1800);
  }, [powerMap, previewMap, isUpper, isLower, cash, backendGame, executeDealerAction, refreshPreview]);

  return (
    <div className="m-dealer-tools">
      <h3 className="m-section-title">庄家工具</h3>
      <DealerQuoteBar symbol={symbol} />
      <DealerResourceBar />

      <div className="m-tools-grid">
        {TOOLS.map((t) => (
          <DealerToolCard
            key={t.id}
            tool={t}
            power={powerMap[t.id]}
            preview={previewMap[t.id]}
            blockedByLimit={(t.id === 'pump' && isUpper) || (t.id === 'press' && isLower)}
            theme={theme}
            onPowerChange={onPowerChange}
            onPowerCommit={onPowerCommit}
            onUse={onUse}
          />
        ))}
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
