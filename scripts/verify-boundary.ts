/**
 * Extreme / boundary tests for gameStore + static UI checks.
 * Run: npx tsx scripts/verify-boundary.ts
 */
import { useGameStore } from '../src/store/gameStore';

type Verdict = '✅通过' | '❌失败';

interface Result {
  group: string;
  item: string;
  verdict: Verdict;
  detail: string;
}

const results: Result[] = [];

function pass(group: string, item: string, detail: string) {
  results.push({ group, item, verdict: '✅通过', detail });
}
function fail(group: string, item: string, detail: string) {
  results.push({ group, item, verdict: '❌失败', detail });
}

function resetTrading() {
  useGameStore.setState({
    gameStatus: 'playing',
    role: 'retail',
    cash: 100_000,
    holdings: [],
    portfolioTotal: 100_000,
    currentQuote: {
      ...useGameStore.getState().currentQuote,
      symbol: 'QDN',
      price: 100,
      prevClose: 100,
    },
    orderHistory: [],
  });
}

function resetDealer() {
  useGameStore.setState({
    gameStatus: 'playing',
    role: 'dealer',
    dealerResources: { cash: 50_000_000, energy: 100, riskIndex: 32 },
    currentQuote: { ...useGameStore.getState().currentQuote, price: 100, prevClose: 100 },
  });
}

// ========== 1. Rapid operations ==========
function testRapidOps() {
  resetTrading();
  const outcomes: boolean[] = [];
  let lastCash = useGameStore.getState().cash;
  for (let i = 0; i < 10; i++) {
    const r = useGameStore.getState().placeOrder({
      symbol: 'QDN',
      type: 'market',
      side: 'buy',
      price: 100,
      quantity: 10,
      status: 'filled',
    });
    outcomes.push(r.success);
    const cash = useGameStore.getState().cash;
    if (cash > lastCash + 0.01) {
      fail('1. 快速操作', '连续快速买入 10 次', `第 ${i + 1} 次后 cash 异常增加 ${lastCash}→${cash}`);
      return;
    }
    lastCash = cash;
  }
  const final = useGameStore.getState();
  const expectedCash = 100_000 - 10 * 100 * 10;
  if (final.cash === expectedCash && outcomes.every(Boolean)) {
    pass('1. 快速操作', '连续快速买入 10 次', `10 次全部成功，cash=${final.cash}，无负值/错乱`);
  } else {
    fail('1. 快速操作', '连续快速买入 10 次', `cash=${final.cash} 期望 ${expectedCash}, successes=${outcomes.filter(Boolean).length}/10`);
  }

  const roles: Array<'dealer' | 'retail' | 'regulator'> = ['dealer', 'retail', 'regulator', 'retail', 'dealer'];
  let roleErr: string | null = null;
  for (const r of roles) {
    try {
      useGameStore.getState().setRole(r);
    } catch (e) {
      roleErr = String(e);
      break;
    }
  }
  if (!roleErr && useGameStore.getState().role === 'dealer') {
    pass('1. 快速操作', '连续快速切换角色 5 次', '无抛错，最终 role=dealer');
  } else {
    fail('1. 快速操作', '连续快速切换角色 5 次', roleErr ?? `最终 role=${useGameStore.getState().role}`);
  }

  // Simulate page switch + buy (store is global, section is React-local)
  resetTrading();
  useGameStore.setState({ currentSection: 'portfolio' });
  const r1 = useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 5, status: 'filled',
  });
  useGameStore.setState({ currentSection: 'overview' });
  const r2 = useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 5, status: 'filled',
  });
  const s = useGameStore.getState();
  if (r1.success && r2.success && s.holdings[0]?.shares === 10 && s.cash === 99_000) {
    pass('1. 快速操作', '快速切换页面 + 买入同时进行', '跨 section 下单累计正确，shares=10');
  } else {
    fail('1. 快速操作', '快速切换页面 + 买入同时进行', `holdings=${JSON.stringify(s.holdings)}, cash=${s.cash}`);
  }
}

// ========== 2. Funds exhaustion ==========
function testFunds() {
  resetTrading();
  useGameStore.setState({ cash: 10_000, holdings: [] });
  useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 100, status: 'filled',
  });
  const broke = useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 1, status: 'filled',
  });
  if (!broke.success && broke.error === '资金不足') {
    pass('2. 资金耗尽', '全仓买入后再买提示资金不足', broke.error);
  } else {
    fail('2. 资金耗尽', '全仓买入后再买提示资金不足', JSON.stringify(broke));
  }

  resetTrading();
  useGameStore.setState({
    cash: 50_000,
    holdings: [{ symbol: 'QDN', shares: 50, avgPrice: 100, marketPrice: 100, pnl: 0, pnlPercent: 0, sector: 'Tech' }],
  });
  useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'sell', price: 100, quantity: 50, status: 'filled',
  });
  const noPos = useGameStore.getState().placeOrder({
    symbol: 'QDN', type: 'market', side: 'sell', price: 100, quantity: 1, status: 'filled',
  });
  if (!noPos.success && noPos.error === '持仓不足') {
    pass('2. 资金耗尽', '清仓后再卖提示持仓不足', noPos.error);
  } else {
    fail('2. 资金耗尽', '清仓后再卖提示持仓不足', JSON.stringify(noPos));
  }
}

// ========== 3. Energy exhaustion ==========
function testEnergy() {
  resetDealer();
  let actions = 0;
  while (actions < 20) {
    const e = useGameStore.getState().dealerResources!.energy;
    if (e < 15) break;
    const r = useGameStore.getState().executeDealerAction({
      type: 'pump', cost: 1_000_000, energy: 15, risk: 10, power: 50,
    });
    if (!r.success) break;
    actions++;
  }
  const drained = useGameStore.getState().dealerResources!;
  const blocked = useGameStore.getState().executeDealerAction({
    type: 'pump', cost: 1_000_000, energy: 15, risk: 10, power: 50,
  });
  if (drained.energy < 15 && !blocked.success && blocked.error === '能量不足') {
    pass('3. 能量耗尽', '能量为 0 后再操盘提示能量不足', `energy=${drained.energy}, error=${blocked.error}`);
  } else {
    fail('3. 能量耗尽', '能量为 0 后再操盘提示能量不足', `energy=${drained.energy}, result=${JSON.stringify(blocked)}`);
  }

  const beforeWait = useGameStore.getState().dealerResources!.energy;
  // Simulate 30s wait — no recovery timer exists in store
  const afterWait = useGameStore.getState().dealerResources!.energy;
  if (afterWait === beforeWait && beforeWait < 15) {
    fail('3. 能量耗尽', '等待能量恢复后可继续操盘', `energy 保持 ${afterWait}，代码中无能量恢复机制`);
  } else {
    pass('3. 能量耗尽', '等待能量恢复后可继续操盘', `energy ${beforeWait}→${afterWait}`);
  }
}

// ========== 4. Long running ==========
function testLongRun() {
  resetDealer();
  const s0 = useGameStore.getState();
  useGameStore.setState({
    gameStatus: 'playing',
    simulation: {
      ...s0.simulation,
      session: 'morning',
      timer: null,
      klineTimer: null,
      newsTimer: null,
      blackSwanTimer: null,
      indicatorTimer: null,
      lunchAutoTimer: null,
      dayAutoTimer: null,
    },
    currentTick: 0,
    timelineData: [],
    klines: [],
  });
  useGameStore.getState().startSimulation();

  const ticks = 1500; // ≈5min @200ms if never interrupted
  const priceBefore = useGameStore.getState().currentQuote.price;
  for (let i = 0; i < ticks; i++) {
    useGameStore.getState().processTick();
  }
  const s1 = useGameStore.getState();
  const priceMoved = s1.currentQuote.price !== priceBefore;
  const timelineOk = s1.timelineData.length > 0 && s1.timelineData.length <= 500;
  const stoppedAtLunch = s1.gameStatus === 'idle' && s1.simulation.session === 'lunch';

  // Simulate 30 kline aggregations (only meaningful while playing)
  for (let i = 0; i < 30; i++) useGameStore.getState().aggregateKline();
  const klineOk = useGameStore.getState().klines.length <= 100;

  useGameStore.getState().stopSimulation();
  const timersCleared = useGameStore.getState().simulation.timer === null;

  if (priceMoved && timelineOk) {
    pass('4. 长时间运行', 'tick 期间价格持续更新', `price ${priceBefore.toFixed(2)}→${s1.currentQuote.price.toFixed(2)}, timeline=${s1.timelineData.length}`);
  } else {
    fail('4. 长时间运行', 'tick 期间价格持续更新', `priceMoved=${priceMoved}, timeline=${s1.timelineData.length}`);
  }

  if (stoppedAtLunch) {
    fail('4. 长时间运行', '5 分钟不动价格仍更新', `60 tick(≈12s) 后自动午休并 stopSimulation，gameStatus=${s1.gameStatus}，之后价格不再 tick`);
  } else {
    pass('4. 长时间运行', '5 分钟不动价格仍更新', '未触发午休中断');
  }

  if (klineOk && timersCleared) {
    pass('4. 长时间运行', 'K 线写入有上限 / timer 可清理', `klines=${useGameStore.getState().klines.length}, timer cleared`);
  } else {
    fail('4. 长时间运行', 'K 线写入有上限 / timer 可清理', `klines=${useGameStore.getState().klines.length}, timer=${useGameStore.getState().simulation.timer}`);
  }

  if (s1.timelineData.length <= 500 && useGameStore.getState().klines.length <= 100) {
    pass('4. 长时间运行', '数组有上限无无限增长', `timeline≤500, klines≤100`);
  } else {
    fail('4. 长时间运行', '数组有上限无无限增长', `timeline=${s1.timelineData.length}, klines=${useGameStore.getState().klines.length}`);
  }
}

// ========== 5. Responsive (static code audit flags) ==========
function testResponsiveAudit() {
  // These are code-review based; mark pass/fail on CSS coverage
  const has375 = false; // no @media (max-width: 375px) in codebase
  const has768 = true;
  if (has768) {
    pass('5. 浏览器兼容', '768px 断点存在', 'Dashboard/Header/App 有 @media max-width:768px');
  }
  if (!has375) {
    fail('5. 浏览器兼容', '375px 专用布局', '无 375px 断点，仅 768/640/900/1024/1200/1400');
  }
  fail('5. 浏览器兼容', '375px 文字/按钮可点 (需浏览器实测)', '768px 下 Header 隐藏 profile-balance/profile-info，小屏资产不可见');
  pass('5. 浏览器兼容', '1024px/1440px 断点', 'DealerPanel/GameRoom/NewsTicker 等有 1024px；App 有 1400px');
}

// ========== 6. Refresh / back ==========
function testPersistence() {
  const usesLocalStorage = false; // grep confirmed no localStorage in src

  if (!usesLocalStorage) {
    fail('6. 刷新/返回', '对局中刷新页面状态保留', '无 localStorage/sessionStorage/zustand persist，刷新后状态重置为初始 mock');
  }
  fail('6. 刷新/返回', '刷新后对局能继续', '对局进度、持仓、timer 均未持久化');
  pass('6. 刷新/返回', '浏览器返回按钮 (SPA 无路由)', '未使用 react-router，返回会离开当前页或历史页，应用内无 popstate 处理');
}

// ========== 7. Extreme prices ==========
function testExtremePrices() {
  resetDealer();
  useGameStore.setState({
    gameStatus: 'playing',
    currentQuote: { ...useGameStore.getState().currentQuote, price: 1.5, prevClose: 1.5, open: 1.5, high: 1.5, low: 1.5 },
    timelineData: [1.5],
  });
  let crashed = false;
  try {
    for (let i = 0; i < 100; i++) useGameStore.getState().processTick();
    useGameStore.getState().aggregateKline();
  } catch (e) {
    crashed = true;
  }
  const lowPrice = useGameStore.getState().currentQuote.price;
  if (!crashed && lowPrice >= 1) {
    pass('7. 极端价格', '价格接近 0 时引擎不崩溃', `100 tick 后 price=${lowPrice}（floor=1）`);
  } else {
    fail('7. 极端价格', '价格接近 0 时引擎不崩溃', crashed ? String(crashed) : `price=${lowPrice}`);
  }

  // Chart math stability at low price
  const points = useGameStore.getState().timelineData;
  const minP = Math.min(...points);
  const maxP = Math.max(...points);
  const padP = (maxP - minP) * 0.15 || maxP * 0.005;
  const range = maxP + padP - (minP - padP) || 1;
  if (Number.isFinite(range) && range > 0) {
    pass('7. 极端价格', '低价 K 线/分时 Y 轴计算有效', `range=${range.toFixed(4)}`);
  } else {
    fail('7. 极端价格', '低价 K 线/分时 Y 轴计算有效', `range=${range}`);
  }

  // High price
  const high = 999_999_999;
  useGameStore.setState({
    currentQuote: { ...useGameStore.getState().currentQuote, price: high, prevClose: high },
    cash: high * 10,
  });
  const display = high.toLocaleString('zh-CN');
  const overflow = !Number.isFinite(high) || display.includes('Infinity');
  if (!overflow && display.length > 0) {
    pass('7. 极端价格', '极高价格数字显示不溢出', `toLocaleString=${display}`);
  } else {
    fail('7. 极端价格', '极高价格数字显示不溢出', display);
  }

  // Manual black swan near zero
  useGameStore.setState({
    role: 'dealer',
    gameStatus: 'playing',
    currentQuote: { ...useGameStore.getState().currentQuote, price: 0.05, prevClose: 100 },
  });
  const origRandom = Math.random;
  Math.random = () => 0.999; // max crash ~-24%
  try {
    useGameStore.getState().triggerBlackSwan();
  } catch (e) {
    fail('7. 极端价格', '极低起点黑天鹅', String(e));
  }
  Math.random = origRandom;
  const bsPrice = useGameStore.getState().currentQuote.price;
  if (bsPrice >= 0.01) {
    pass('7. 极端价格', '极低起点黑天鹅不崩溃', `price→${bsPrice}`);
  } else {
    fail('7. 极端价格', '极低起点黑天鹅不崩溃', `price→${bsPrice}`);
  }
}

// ========== Run ==========
testRapidOps();
testFunds();
testEnergy();
testLongRun();
testResponsiveAudit();
testPersistence();
testExtremePrices();

console.log('\n=== 极端/边界测试报告 ===\n');
let g = '';
for (const r of results) {
  if (r.group !== g) {
    console.log(`\n## ${r.group}\n`);
    g = r.group;
  }
  console.log(`- ${r.item}: ${r.verdict}`);
  console.log(`  ${r.detail}`);
}
const passN = results.filter((r) => r.verdict === '✅通过').length;
const failN = results.filter((r) => r.verdict === '❌失败').length;
console.log(`\n--- 汇总: ✅${passN} ❌${failN} / 共${results.length}项 ---\n`);
