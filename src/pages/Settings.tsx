import { useState, CSSProperties } from 'react';
import { useGameStore, Role, UserSettings, SPEED_PRESETS } from '../store/gameStore';
import './Settings.css';

const roleConfig = {
  dealer: {
    label: 'Market Maker',
    icon: '🏦',
    description: '影响股价走势的庄家身份。拥有 6 种操盘工具。',
    color: '#a78bfa',
    abilities: ['Pump/Press 价格', '吸筹/出货', '对敲/假单', '内部信息'],
  },
  retail: {
    label: 'Retail Trader',
    icon: '📈',
    description: '标准散户身份。可使用技术指标和限价单工具。',
    color: '#60a5fa',
    abilities: ['K线/技术指标', '限价/市价单', '购买内幕消息', '杠杆融资'],
  },
  regulator: {
    label: 'SEC Agent',
    icon: '⚖️',
    description: '市场监管者。可查看全视角数据并执行处罚。',
    color: '#fb923c',
    abilities: ['全局观战', '异常告警', '违规评分', '警告/冻结/踢出'],
  },
};

export default function Settings() {
  const { role, setRole, settings, updateSettings, userName, startMatch, simulation, setSpeed } = useGameStore();
  const [activeTab, setActiveTab] = useState<'role' | 'preferences' | 'account' | 'about'>('role');
  
  const handleSettingChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    updateSettings({ [key]: value });
  };
  
  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <p className="settings-subtitle">Manage your account, role, and preferences</p>
      </div>
      
      {/* Tabs */}
      <div className="settings-tabs">
        {([
          ['role', '🎭 Role & Identity'],
          ['preferences', '⚙️ Preferences'],
          ['account', '👤 Account'],
          ['about', 'ℹ️ About'],
        ] as [typeof activeTab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`settings-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="settings-content">
        {activeTab === 'role' && (
          <div className="role-tab">
            <div className="tab-section">
              <h3 className="tab-title">Current Identity</h3>
              <p className="tab-description">
                Switch your role to experience different trading perspectives. Your role affects available tools, visible information, and gameplay mechanics.
              </p>
              
              <div className="current-role-card">
                <div className="current-role-icon">{roleConfig[role].icon}</div>
                <div className="current-role-info">
                  <div className="current-role-label">{roleConfig[role].label}</div>
                  <div className="current-role-name">{userName}</div>
                </div>
                <button 
                  className="quick-match-btn"
                  onClick={() => startMatch()}
                >
                  Quick Match
                </button>
              </div>
            </div>
            
            <div className="tab-section">
              <h3 className="tab-title">Switch Role</h3>
              
              <div className="role-options-grid">
                {(Object.keys(roleConfig) as Role[]).map(r => {
                  const config = roleConfig[r];
                  return (
                    <button
                      key={r}
                      className={`role-option-card ${role === r ? 'active' : ''}`}
                      style={{ '--role-color': config.color } as CSSProperties}
                      onClick={() => setRole(r)}
                    >
                      <div className="role-option-header">
                        <span className="role-option-icon">{config.icon}</span>
                        <span className="role-option-label">{config.label}</span>
                        {role === r && <span className="active-indicator">✓ Active</span>}
                      </div>
                      
                      <p className="role-option-desc">{config.description}</p>
                      
                      <div className="role-abilities">
                        {config.abilities.map(a => (
                          <span key={a} className="ability-chip">• {a}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'preferences' && (
          <div className="preferences-tab">
            <div className="tab-section">
              <h3 className="tab-title">Notifications</h3>
              
              <ToggleItem
                label="Push Notifications"
                description="Get alerts for important market events"
                value={settings.notifications}
                onChange={v => handleSettingChange('notifications', v)}
              />
              
              <ToggleItem
                label="Sound Effects"
                description="Play sounds for orders and alerts"
                value={settings.soundEffects}
                onChange={v => handleSettingChange('soundEffects', v)}
              />
              
              <ToggleItem
                label="Risk Warnings"
                description="Show warnings before risky operations"
                value={settings.riskWarnings}
                onChange={v => handleSettingChange('riskWarnings', v)}
              />
              
              <ToggleItem
                label="Auto-invest Alerts"
                description="Receive AI-driven trade suggestions"
                value={settings.autoInvest}
                onChange={v => handleSettingChange('autoInvest', v)}
              />
            </div>
            
            <div className="tab-section">
              <h3 className="tab-title">Trading Defaults</h3>
              
              <div className="setting-row">
                <div>
                  <div className="setting-label">Default Leverage</div>
                  <div className="setting-desc">Used when placing new orders</div>
                </div>
                <select 
                  className="setting-select"
                  value={settings.defaultLeverage}
                  onChange={e => handleSettingChange('defaultLeverage', Number(e.target.value))}
                >
                  {[1, 2, 3, 5, 10, 20].map(l => (
                    <option key={l} value={l}>{l}x</option>
                  ))}
                </select>
              </div>
              
              <div className="setting-row">
                <div>
                  <div className="setting-label">Language</div>
                  <div className="setting-desc">Interface language</div>
                </div>
                <select 
                  className="setting-select"
                  value={settings.language}
                  onChange={e => handleSettingChange('language', e.target.value as 'zh' | 'en')}
                >
                  <option value="zh">中文 (Chinese)</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            
            <div className="tab-section">
              <h3 className="tab-title">对局节奏 · Match Speed</h3>
              <div className="setting-row">
                <div>
                  <div className="setting-label">一天现实时长</div>
                  <div className="setting-desc">控制每个交易日跑完所需的现实时间（默认 6 分钟/天）</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 320, justifyContent: 'flex-end' }}>
                  {SPEED_PRESETS.map((p) => {
                    const active = Math.abs(simulation.speed - p.speed) < 0.01;
                    return (
                      <button
                        key={p.label}
                        title={p.label}
                        onClick={() => setSpeed(p.speed)}
                        style={{
                          padding: '6px 12px',
                          background: active ? 'var(--accent-blue, #2563eb)' : 'var(--bg-tertiary)',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {p.minutesPerDay ? `${p.minutesPerDay} 分钟/天` : '快进 ⏩'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="tab-section">
              <h3 className="tab-title">Appearance</h3>
              
              <ToggleItem
                label="Dark Mode"
                description="Use dark theme (recommended)"
                value={settings.darkMode}
                onChange={v => handleSettingChange('darkMode', v)}
                disabled
              />
            </div>
          </div>
        )}
        
        {activeTab === 'account' && (
          <div className="account-tab">
            <div className="account-card">
              <div className="account-avatar-large">
                <span>{roleConfig[role].icon}</span>
              </div>
              <div className="account-info">
                <div className="account-name">{userName}</div>
                <div className="account-id">UID: {userName.toLowerCase()}_2026</div>
                <div className="account-role">{roleConfig[role].label}</div>
              </div>
            </div>
            
            <div className="account-stats">
              <div className="account-stat">
                <div className="account-stat-label">Member Since</div>
                <div className="account-stat-value">Jan 2026</div>
              </div>
              <div className="account-stat">
                <div className="account-stat-label">Total Trades</div>
                <div className="account-stat-value">2,847</div>
              </div>
              <div className="account-stat">
                <div className="account-stat-label">Win Rate</div>
                <div className="account-stat-value up">68.4%</div>
              </div>
              <div className="account-stat">
                <div className="account-stat-label">Net P&L</div>
                <div className="account-stat-value up">+$4.2M</div>
              </div>
            </div>
            
            <div className="danger-zone">
              <h3 className="danger-title">Danger Zone</h3>
              <button className="danger-btn">Reset Account</button>
              <button className="danger-btn delete">Delete Account</button>
            </div>
          </div>
        )}
        
        {activeTab === 'about' && (
          <div className="about-tab">
            <div className="about-logo">
              <div className="about-mark">
                <div className="brand-mark-grid">
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                </div>
              </div>
              <h3 className="about-name">BLACKWALL STREET EMPIRE</h3>
              <p className="about-version">Version 2.5.0 · Build 2026.07.06</p>
            </div>
            
            <div className="about-section">
              <h4>About the Game</h4>
              <p>A real-time 1v1 trading battle game where players experience both sides of the market - as Market Makers who manipulate stock prices, Retail Traders who analyze and trade, and SEC Agents who oversee market integrity.</p>
            </div>
            
            <div className="about-section">
              <h4>Game Features</h4>
              <ul className="feature-list">
                <li>5 个交易日，每天约 5–7 分钟（可在 Preferences 中调整）</li>
                <li>实时行情模拟（默认约 3 秒/tick，一天 120 tick）</li>
                <li>Role asymmetry: 6 manipulation tools vs chart analysis</li>
                <li>Information asymmetry creates core gameplay tension</li>
                <li>Regulator mode offers observer perspective with enforcement tools</li>
              </ul>
            </div>
            
            <div className="about-section">
              <h4>Legal</h4>
              <div className="legal-links">
                <a className="legal-link" href="#">Terms of Service</a>
                <a className="legal-link" href="#">Privacy Policy</a>
                <a className="legal-link" href="#">Risk Disclosure</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleItem({ label, description, value, onChange, disabled }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{description}</div>
      </div>
      <button
        className={`toggle ${value ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
      >
        <span className="toggle-knob"></span>
      </button>
    </div>
  );
}
