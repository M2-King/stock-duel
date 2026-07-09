/**
 * 我的页：
 *  - 头像 + 角色 + 资产负债栏
 *  - 信息面板（财富/对局/设置）
 *  - 主题切换（深色 / 浅色）
 *  - 排行榜
 *  - 退出对局 / 设置入口
 */

import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import MobileRolePill from '../components/RolePill';
import { useTheme } from '../hooks/useTheme';

export default function MobileProfile() {
  const userName = useGameStore((s) => s.userName);
  const role = useGameStore((s) => s.role);
  const totalAssets = useGameStore((s) => s.totalAssets);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const matchId = useGameStore((s) => s.matchId);
  const leverage = useGameStore((s) => s.leverage);
  const speed = useGameStore((s) => s.simulation.speed ?? 1);
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

  const { theme, setTheme } = useTheme();

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="m-profile">
      <header className="m-page-header">
        <h1 className="m-page-title">我的</h1>
      </header>

      {/* 顶部身份卡 */}
      <section
        className="m-card"
        style={{ margin: '0 16px', padding: '22px 16px 18px', textAlign: 'center' }}
      >
        <div
          style={{
            width: 76, height: 76, margin: '0 auto', borderRadius: 38,
            background: 'var(--m-text)', color: 'var(--m-bg)',
            display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 700,
            boxShadow: 'var(--m-shadow)',
          }}
        >
          {userName?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: 'var(--m-text)' }}>
          {userName}
        </div>
        <div style={{ marginTop: 8 }}>
          <MobileRolePill role={role} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--m-text-3)', fontFamily: 'var(--font-mono)' }}>
          总资产 ¥{totalAssets.toLocaleString()} · Lv.18
        </div>
      </section>

      {/* 对局概况 */}
      <section className="m-card" style={{ margin: '12px 16px', padding: '4px 16px' }}>
        <div
          style={{
            fontSize: 11, color: 'var(--m-text-3)',
            padding: '8px 0', textTransform: 'uppercase',
            letterSpacing: '0.06em', fontWeight: 600,
          }}
        >
          当前对局
        </div>
        <div className="m-card-row" style={{ borderTop: 'none' }}>
          <span className="label">状态</span>
          <span className="value">
            <span className={`m-tag ${gameStatus === 'playing' ? 'm-tag-up' : 'm-tag-down'}`}>
              {gameStatus}
            </span>
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

      {/* ====== 外观：主题 ====== */}
      <h3 className="m-section-title">外观</h3>
      <div style={{ padding: '0 16px' }}>
        <div
          style={{
            fontSize: 11, color: 'var(--m-text-3)', marginBottom: 8,
            paddingLeft: 4, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}
        >
          主题
        </div>
        <div className="m-theme-switch" role="group" aria-label="主题">
          <button
            type="button"
            className={theme === 'dark' ? 'active' : ''}
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            深色
          </button>
          <button
            type="button"
            className={theme === 'light' ? 'active' : ''}
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            浅色
          </button>
        </div>
      </div>

      {/* ====== 设置 ====== */}
      <h3 className="m-section-title">设置</h3>
      <div className="m-list">
        <SettingRow label="消息通知">
          <ToggleSwitch
            checked={settings.notifications}
            onChange={(v) => updateSettings({ notifications: v })}
          />
        </SettingRow>
        <SettingRow label="音效">
          <ToggleSwitch
            checked={settings.soundEffects}
            onChange={(v) => updateSettings({ soundEffects: v })}
          />
        </SettingRow>
        <SettingRow label="风险提示">
          <ToggleSwitch
            checked={settings.riskWarnings}
            onChange={(v) => updateSettings({ riskWarnings: v })}
          />
        </SettingRow>
        <SettingRow label="游戏速度">
          <select
            value={speed}
            onChange={(e) => setSpeed?.(Number(e.target.value))}
            className="m-select"
            style={{ width: 110, minHeight: 36, padding: '0 10px', fontSize: 13 }}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </SettingRow>
      </div>

      {/* 对局操作 */}
      <h3 className="m-section-title">对局</h3>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              cursor: 'pointer',
              width: '100%',
            }}
            onClick={() => {
              setOpen(open === m.id ? null : m.id);
              readMessage(m.id);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: m.read ? 400 : 600, color: 'var(--m-text)' }}>
                {!m.read && (
                  <span
                    style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                      background: 'var(--m-up)', marginRight: 6,
                    }}
                  />
                )}
                {m.subject}
              </span>
              <span style={{ fontSize: 11, color: 'var(--m-text-3)', fontFamily: 'var(--font-mono)' }}>
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
          <div
            key={p.id}
            className="m-card-row"
            style={{
              gridTemplateColumns: 'auto 1fr auto',
              display: 'grid',
              alignItems: 'center',
              padding: '10px 0',
              gap: 10,
            }}
          >
            <span
              style={{
                width: 26, height: 26, borderRadius: 13,
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700,
                background:
                  p.rank === 1 ? 'var(--m-warning)' :
                  p.rank === 2 ? 'var(--m-text-3)' :
                  p.rank === 3 ? 'rgba(205,127,50,0.6)' :
                  'var(--m-surface-2)',
                color:
                  p.rank <= 2 ? '#000' :
                  p.rank === 3 ? '#000' : 'var(--m-text)',
              }}
            >
              {p.rank}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--m-text)' }}>{p.name}</div>
              <div
                className={`m-tag ${p.role === 'dealer' ? 'm-tag-dealer' : p.role === 'regulator' ? 'm-tag-reg' : 'm-tag-retail'}`}
                style={{ marginTop: 2 }}
              >
                {p.role}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="m-mono" style={{ fontSize: 13, color: 'var(--m-text)' }}>
                ¥{(p.totalAssets / 1e6).toFixed(0)}M
              </div>
              <div
                className={`m-mono ${p.weeklyReturn >= 0 ? 'm-up' : 'm-down'}`}
                style={{ fontSize: 10 }}
              >
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

/* ----------------------------- helpers ----------------------------- */

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="m-card-row"
      style={{ gridTemplateColumns: '1fr auto', display: 'grid', alignItems: 'center' }}
    >
      <span style={{ color: 'var(--m-text)' }}>{label}</span>
      {children}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`m-switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}