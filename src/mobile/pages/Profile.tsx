/**
 * 我的页：
 *  - 头像 + 角色 + 资产负债栏
 *  - 信息面板（财富/对局/设置）
 *  - 排行榜
 *  - 退出对局 / 设置入口
 */

import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import MobileRolePill from '../components/RolePill';

export default function MobileProfile() {
  const userName = useGameStore((s) => s.userName);
  const role = useGameStore((s) => s.role);
  const totalAssets = useGameStore((s) => s.totalAssets);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const matchId = useGameStore((s) => s.matchId);
  const leverage = useGameStore((s) => s.leverage);
  const speed = useGameStore((s) => s.speed ?? 1);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const settings = useGameStore((s) => s.settings);
  const restartMatch = useGameStore((s) => s.restartMatch);
  const startMatch = useGameStore((s) => s.startMatch);
  const endMatch = useGameStore((s) => s.endMatch);
  const showToast = useGameStore((s) => s.showToast);
  const leaderboard = useGameStore((s) => s.leaderboard);
  const messages = useGameStore((s) => s.messages);
  const alerts = useGameStore((s) => s.alerts);
  const readMessage = useGameStore((s) => s.readMessage);

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="m-profile">
      <header className="m-page-header">
        <h1 className="m-page-title">我的</h1>
      </header>

      {/* 顶部身份卡 */}
      <section className="m-card" style={{ margin: '0 16px', padding: '18px 16px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto', borderRadius: 36,
          background: 'var(--m-text)', color: 'var(--m-bg)',
          display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700,
        }}>
          {userName?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{userName}</div>
        <div style={{ marginTop: 6 }}>
          <MobileRolePill role={role} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--m-text-3)' }}>
          总资产 ¥{totalAssets.toLocaleString()} · Lv.18
        </div>
      </section>

      {/* 对局概况 */}
      <section className="m-card" style={{ margin: '12px 16px', padding: '14px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--m-text-3)', marginBottom: 8 }}>当前对局</div>
        <div className="m-card-row" style={{ borderTop: 'none' }}>
          <span className="label">状态</span>
          <span className="value">
            <span className={`m-tag ${gameStatus === 'playing' ? 'm-tag-up' : 'm-tag-down'}`}>{gameStatus}</span>
          </span>
        </div>
        <div className="m-card-row">
          <span className="label">匹配 ID</span>
          <span className="value m-mono" style={{ fontSize: 11 }}>{matchId?.slice(0, 16) ?? '—'}</span>
        </div>
        <div className="m-card-row">
          <span className="label">杠杆</span>
          <span className="value">{leverage}x</span>
        </div>
        <div className="m-card-row">
          <span className="label">速度</span>
          <span className="value">{speed}x</span>
        </div>
      </section>

      {/* 设置 */}
      <h3 className="m-section-title">设置</h3>
      <div className="m-list">
        <div className="m-card-row" style={{ gridTemplateColumns: '1fr auto', display: 'grid' }}>
          <span>消息通知</span>
          <Switch
            checked={settings.notifications}
            onChange={(v) => updateSettings({ notifications: v })}
          />
        </div>
        <div className="m-card-row" style={{ gridTemplateColumns: '1fr auto', display: 'grid' }}>
          <span>音效</span>
          <Switch
            checked={settings.soundEffects}
            onChange={(v) => updateSettings({ soundEffects: v })}
          />
        </div>
        <div className="m-card-row" style={{ gridTemplateColumns: '1fr auto', display: 'grid' }}>
          <span>风险提示</span>
          <Switch
            checked={settings.riskWarnings}
            onChange={(v) => updateSettings({ riskWarnings: v })}
          />
        </div>
        <div className="m-card-row" style={{ gridTemplateColumns: '1fr auto', display: 'grid' }}>
          <span>游戏速度</span>
          <select
            value={speed}
            onChange={(e) => setSpeed?.(Number(e.target.value))}
            className="m-select"
            style={{ width: 100, minHeight: 32, padding: '0 8px', fontSize: 13 }}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </div>
      </div>

      {/* 对局操作 */}
      <h3 className="m-section-title">对局</h3>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gameStatus !== 'playing' ? (
          <button
            type="button"
            className="m-btn m-btn-primary m-btn-block"
            onClick={() => {
              startMatch();
              showToast('开始匹配...', 'info');
            }}
          >开始匹配</button>
        ) : (
          <button
            type="button"
            className="m-btn m-btn-danger m-btn-block"
            onClick={() => {
              endMatch();
              showToast('已退出当前对局', 'info');
            }}
          >退出对局</button>
        )}
        <button
          type="button"
          className="m-btn m-btn-ghost m-btn-block"
          onClick={() => {
            restartMatch();
            showToast('已重置对局', 'info');
          }}
        >
          重置对局数据
        </button>
      </div>

      {/* 消息 inbox */}
      <h3 className="m-section-title">消息 ({messages.filter((m) => !m.read).length} 条未读)</h3>
      <div className="m-list">
        {messages.slice(0, 4).map((m) => (
          <button
            type="button"
            key={m.id}
            className="m-card-row"
            style={{
              gridTemplateColumns: '1fr', textAlign: 'left',
              background: 'transparent', border: 'none', padding: '12px 0',
              borderBottom: '1px solid var(--m-border)',
            }}
            onClick={() => {
              setOpen(open === m.id ? null : m.id);
              readMessage(m.id);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: m.read ? 400 : 600 }}>
                {!m.read && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: 'var(--price-up)', marginRight: 6 }} />}
                {m.subject}
              </span>
              <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>
                {new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {open === m.id ? (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--m-text-2)' }}>{m.content}</div>
            ) : (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--m-text-3)' }}>{m.preview}</div>
            )}
          </button>
        ))}
      </div>

      {/* 监管告警（仅 retailer 见） */}
      {role !== 'regulator' && alerts.length > 0 && (
        <>
          <h3 className="m-section-title">市场告警</h3>
          <div className="m-list">
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="m-card-row" style={{ gridTemplateColumns: '1fr' }}>
                <span style={{ fontWeight: 600 }}>
                  <span className={`m-tag ${a.severity === 'high' ? 'm-tag-up' : a.severity === 'medium' ? 'm-tag-down' : ''}`}>
                    {a.severity}
                  </span>{' '}
                  {a.title}
                </span>
                <span style={{ fontSize: 12, color: 'var(--m-text-3)', marginTop: 4 }}>{a.description}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 排行榜 */}
      <h3 className="m-section-title">排行榜 (Top 10)</h3>
      <div className="m-list">
        {leaderboard.slice(0, 10).map((p) => (
          <div key={p.id} className="m-card-row" style={{ gridTemplateColumns: 'auto 1fr auto', display: 'grid', alignItems: 'center', padding: '10px 0', gap: 10 }}>
            <span style={{
              width: 24, height: 24, borderRadius: 12,
              display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 700,
              background: p.rank === 1 ? 'var(--color-warning)' : p.rank === 2 ? 'var(--text-muted)' : p.rank === 3 ? 'rgba(205,127,50,0.6)' : 'var(--m-surface)',
              color: p.rank <= 3 ? '#000' : 'var(--m-text)',
            }}>
              {p.rank}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: 'var(--m-text-3)' }} className={`m-tag ${p.role === 'dealer' ? 'm-tag-dealer' : p.role === 'regulator' ? 'm-tag-reg' : 'm-tag-retail'}`}>{p.role}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="m-mono" style={{ fontSize: 13 }}>¥{(p.totalAssets / 1e6).toFixed(0)}M</div>
              <div className={`m-mono ${p.weeklyReturn >= 0 ? 'm-up' : 'm-down'}`} style={{ fontSize: 10 }}>
                {p.weeklyReturn >= 0 ? '+' : ''}{p.weeklyReturn.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, minHeight: 26, padding: 0,
        borderRadius: 13,
        background: checked ? 'var(--m-text)' : 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 120ms',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2, left: checked ? 20 : 2,
          width: 20, height: 20, borderRadius: 10,
          background: checked ? 'var(--m-bg)' : 'var(--m-text-3)',
          transition: 'left 120ms ease-out',
        }}
      />
    </button>
  );
}
