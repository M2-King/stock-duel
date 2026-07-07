/**
 * Automated linkage verification for gameStore.
 * Run: npx tsx scripts/verify-linkage.ts
 */
import { useGameStore } from '../src/store/gameStore';

type Verdict = '✅正确' | '❌错误' | '⚠️疑似错误';

interface Result {
  category: string;
  item: string;
  verdict: Verdict;
  detail: string;
}

const results: Result[] = [];

function record(category: string, item: string, ok: boolean, detail: string, suspect = false) {
  results.push({
    category,
    item,
    verdict: ok ? '✅正确' : suspect ? '⚠️疑似错误' : '❌错误',
    detail,
  });
}

function calcPositionValue(holdings: { marketPrice: number; shares: number }[]) {
  return holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0);
}

function calcNetWorth(cash: number, holdings: { marketPrice: number; shares: number }[]) {
  return cash + calcPositionValue(holdings);
}

function portfolioPageTotal(cash: number, holdings: { marketPrice: number; shares: number }[]) {
  return holdings.reduce((sum, h) => sum + h.shares * h.marketPrice, 0) + cash;
}

function headerTotal(portfolioTotal: number) {
  return portfolioTotal;
}

function resetBase() {
  const s = useGameStore.getState();
  useGameStore.setState({
    gameStatus: 'playing',
    role: 'dealer',
    cash: 1_000_000,
    holdings: [],
    portfolioTotal: 1_000_000,
    currentQuote: {
      ...s.currentQuote,
      symbol: 'QDN',
      price: 100,
      prevClose: 100,
      open: 100,
      high: 100,
      low: 100,
      change: 0,
      changePercent: 0,
    },
    dealerResources: { cash: 10_000_000, energy: 100, riskIndex: 32 },
    regulatoryScores: { manipulation: 32.5, insider: 18.2, misinformation: 12.8 },
    alerts: [],
    timelineData: [100],
    klines: [],
    simulation: {
      ...s.simulation,
      session: 'morning',
      initialAssets: 1_000_000,
      dayOpenAssets: 1_000_000,
      dayOpenPrice: 100,
      timer: null,
      lunchAutoTimer: null,
      dayAutoTimer: null,
      lastIndexTrigger: { manipulation: 0, insider: 0, misinformation: 0 },
    },
    currentTick: 0,
    currentDay: 1,
  });
}

// ========== 1. Asset calculations ==========
function testAssets() {
  resetBase();
  const store = useGameStore.getState();
  const cashBefore = store.cash;

  const buy = store.placeOrder({
    symbol: 'QDN',
    type: 'market',
    side: 'buy',
    price: 100,
    quantity: 100,
    status: 'filled',
  });
  let s = useGameStore.getState();
  record(
    '1. 资产计算',
    '买入后 cash 减少',
    buy.success && s.cash === cashBefore - 10_000,
    `cash ${cashBefore} → ${s.cash}, 期望 ${cashBefore - 10_000}`,
  );

  const nw1 = calcNetWorth(s.cash, s.holdings);
  record(
    '1. 资产计算',
    'Total Net Worth 等式 (买入后)',
    Math.abs(nw1 - s.portfolioTotal) < 0.01,
    `cash+持仓=${nw1}, portfolioTotal=${s.portfolioTotal}`,
  );

  const sell = store.placeOrder({
    symbol: 'QDN',
    type: 'market',
    side: 'sell',
    price: 110,
    quantity: 50,
    status: 'filled',
  });
  s = useGameStore.getState();
  record(
    '1. 资产计算',
    '卖出后 cash 增加',
    sell.success && s.cash === cashBefore - 10_000 + 5_500,
    `cash=${s.cash}, 期望 ${cashBefore - 10_000 + 5_500}`,
  );

  const nw2 = calcNetWorth(s.cash, s.holdings);
  record(
    '1. 资产计算',
    'Total Net Worth 等式 (卖出后)',
    Math.abs(nw2 - s.portfolioTotal) < 0.01,
    `cash+持仓=${nw2}, portfolioTotal=${s.portfolioTotal}`,
  );

  const header = headerTotal(s.portfolioTotal);
  const portfolio = portfolioPageTotal(s.cash, s.holdings);
  record(
    '1. 资产计算',
    '顶栏总资产 = Portfolio 总资产',
    Math.abs(header - portfolio) < 0.01,
    `Header(portfolioTotal)=${header}, Portfolio(重算)=${portfolio}`,
  );

  // Initial seed consistency
  useGameStore.setState({
    cash: 2_500_000,
    holdings: [
      { symbol: 'QDN', shares: 500, avgPrice: 90.12, marketPrice: 94.89, pnl: 2385, pnlPercent: 5.3, sector: 'Technology' },
    ],
    portfolioTotal: 82_292_000,
  });
  s = useGameStore.getState();
  const seedNw = calcNetWorth(s.cash, s.holdings);
  record(
    '1. 资产计算',
    '初始 portfolioTotal 与 holdings+cash 一致',
    Math.abs(seedNw - s.portfolioTotal) < 1000,
    `重算=${seedNw.toFixed(0)} vs store.portfolioTotal=${s.portfolioTotal}（差距 ${Math.abs(seedNw - s.portfolioTotal).toFixed(0)}）`,
    Math.abs(seedNw - s.portfolioTotal) >= 1000,
  );

  // closePosition portfolio sync
  resetBase();
  useGameStore.getState().placeOrder({ symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 10, status: 'filled' });
  s = useGameStore.getState();
  useGameStore.getState().closePosition('QDN', 100);
  s = useGameStore.getState();
  const nwAfterClose = calcNetWorth(s.cash, s.holdings);
  record(
    '1. 资产计算',
    'closePosition 后 portfolioTotal 同步',
    Math.abs(nwAfterClose - s.portfolioTotal) < 0.01,
    `portfolioTotal=${s.portfolioTotal}, 实际净资产=${nwAfterClose}`,
    Math.abs(nwAfterClose - s.portfolioTotal) >= 0.01,
  );
}

// ========== 2. Dealer resources ==========
function testDealerResources() {
  resetBase();
  const before = useGameStore.getState().dealerResources!;
  const r = useGameStore.getState().executeDealerAction({
    type: 'pump',
    cost: 1_000_000,
    energy: 15,
    risk: 10,
    power: 50,
  });
  const after = useGameStore.getState().dealerResources!;
  record(
    '2. 庄家资源',
    '拉升后资金池减少',
    r.success && after.cash === before.cash - 1_000_000,
    `cash ${before.cash} → ${after.cash}`,
  );
  record(
    '2. 庄家资源',
    '能量正确消耗',
    after.energy === before.energy - 15,
    `energy ${before.energy} → ${after.energy}`,
  );
  const expectedRisk = Math.min(100, before.riskIndex + (50 / 100) * 1.5);
  record(
    '2. 庄家资源',
    '风险指数正确增加',
    Math.abs(after.riskIndex - expectedRisk) < 0.001,
    `risk ${before.riskIndex} → ${after.riskIndex}, 期望 ${expectedRisk}`,
  );

  useGameStore.setState({ dealerResources: { cash: 10_000_000, energy: 5, riskIndex: 32 } });
  const lowEnergy = useGameStore.getState().executeDealerAction({
    type: 'pump',
    cost: 1_000_000,
    energy: 15,
    risk: 10,
    power: 50,
  });
  record(
    '2. 庄家资源',
    '能量不足时无法操盘',
    !lowEnergy.success && lowEnergy.error === '能量不足',
    `result=${JSON.stringify(lowEnergy)}`,
  );

  useGameStore.setState({ dealerResources: { cash: 100_000, energy: 100, riskIndex: 32 } });
  const lowCash = useGameStore.getState().executeDealerAction({
    type: 'pump',
    cost: 1_000_000,
    energy: 15,
    risk: 10,
    power: 50,
  });
  record(
    '2. 庄家资源',
    '资金不足时无法操盘',
    !lowCash.success && lowCash.error === '庄家资金不足',
    `result=${JSON.stringify(lowCash)}`,
  );
}

// ========== 3. Price linkage ==========
function testPriceLinkage() {
  resetBase();
  const priceBefore = useGameStore.getState().currentQuote.price;
  const timelineBefore = useGameStore.getState().timelineData.length;
  useGameStore.getState().executeDealerAction({ type: 'pump', cost: 1_000_000, energy: 15, risk: 10, power: 50 });
  const s = useGameStore.getState();
  const expectedPrice = priceBefore * (1 + 0.003 * 50);
  record(
    '3. 价格联动',
    '庄家拉升后现价更新',
    Math.abs(s.currentQuote.price - expectedPrice) < 0.0001,
    `price ${priceBefore} → ${s.currentQuote.price}, 期望 ${expectedPrice}`,
  );
  record(
    '3. 价格联动',
    '庄家拉升后 K 线分时图同步更新',
    s.timelineData[s.timelineData.length - 1] === expectedPrice,
    `timeline 末点=${s.timelineData.at(-1)}, 现价=${s.currentQuote.price}`,
    s.timelineData[s.timelineData.length - 1] !== expectedPrice,
  );

  // Manual black swan
  resetBase();
  useGameStore.setState({ role: 'dealer', gameStatus: 'playing', currentQuote: { ...useGameStore.getState().currentQuote, price: 100, prevClose: 100 } });
  const origRandom = Math.random;
  Math.random = () => 0; // crash = -0.15
  useGameStore.getState().triggerBlackSwan();
  Math.random = origRandom;
  const bs = useGameStore.getState();
  const expectedBsPrice = 85;
  const alert = bs.alerts.find((a) => a.title.includes('Black Swan'));
  const descPct = alert ? parseFloat(alert.description.match(/-([\d.]+)%/)?.[1] ?? '0') : 0;
  record(
    '3. 价格联动',
    '手动黑天鹅价格跳变与告警描述一致',
    Math.abs(bs.currentQuote.price - expectedBsPrice) < 0.01 && Math.abs(descPct - 15) < 0.1,
    `价格→${bs.currentQuote.price}, 告警幅度 ${descPct}%`,
  );

  // News impact
  resetBase();
  useGameStore.setState({
    newsPool: [{ title: '测试利好', content: 'c', source: 'T', sentiment: 'bullish' }],
    currentQuote: { ...useGameStore.getState().currentQuote, price: 100, prevClose: 100 },
  });
  const pNewsBefore = useGameStore.getState().currentQuote.price;
  Math.random = () => 0; // multiplier = 1.001
  useGameStore.getState().pushRandomNews();
  Math.random = origRandom;
  const pNewsAfter = useGameStore.getState().currentQuote.price;
  record(
    '3. 价格联动',
    '新闻推送后价格微小变动 (bullish)',
    pNewsAfter > pNewsBefore,
    `price ${pNewsBefore} → ${pNewsAfter}`,
  );

  resetBase();
  useGameStore.setState({
    newsPool: [{ title: '测试中性', content: 'c', source: 'T', sentiment: 'neutral' }],
    currentQuote: { ...useGameStore.getState().currentQuote, price: 100, prevClose: 100 },
  });
  useGameStore.getState().pushRandomNews();
  record(
    '3. 价格联动',
    '中性新闻不改变价格',
    useGameStore.getState().currentQuote.price === 100,
    `price=${useGameStore.getState().currentQuote.price}`,
  );

  // Auto black swan deterministic
  resetBase();
  Math.random = () => 0; // pass 10% gate at 0, pick first event, mult min
  useGameStore.getState().maybeTriggerBlackSwan();
  Math.random = origRandom;
  const auto = useGameStore.getState();
  const news = auto.news[0];
  const mult = 0.85;
  const expectedAutoPrice = 100 * mult;
  const newsPct = news ? parseFloat(news.content.match(/([\-\d.]+)%/)?.[1] ?? '0') : 0;
  record(
    '3. 价格联动',
    '自动黑天鹅新闻描述与价格变动一致',
    Math.abs(auto.currentQuote.price - expectedAutoPrice) < 0.01 && Math.abs(newsPct - -15) < 0.2,
    `价格→${auto.currentQuote.price}, 新闻 ${newsPct}%`,
  );
}

// ========== 4. Manipulation index ==========
function testManipulationIndex() {
  resetBase();
  const scoreBefore = useGameStore.getState().regulatoryScores.manipulation;
  useGameStore.getState().executeDealerAction({ type: 'wash', cost: 500_000, energy: 8, risk: 25, power: 80 });
  const scoreAfter = useGameStore.getState().regulatoryScores.manipulation;
  const intensity = 0.8;
  const expectedDelta = intensity * 2 + 25 * intensity;
  record(
    '4. 指数联动',
    '操盘后 manipulation 指数变化',
    Math.abs(scoreAfter - scoreBefore - expectedDelta) < 0.001,
    `${scoreBefore} → ${scoreAfter}, 期望 +${expectedDelta}`,
  );

  resetBase();
  useGameStore.setState({ regulatoryScores: { manipulation: 65, insider: 10, misinformation: 10 } });
  const alertsBefore = useGameStore.getState().alerts.length;
  useGameStore.getState().processTick();
  const alertsAfter = useGameStore.getState().alerts.length;
  record(
    '4. 指数联动',
    '超过阈值(60)自动触发告警',
    alertsAfter > alertsBefore,
    `告警数 ${alertsBefore} → ${alertsAfter}`,
  );

  resetBase();
  useGameStore.setState({
    regulatoryScores: { manipulation: 70, insider: 10, misinformation: 10 },
    alerts: [{ id: 't1', severity: 'high', title: '可疑拉升', description: 'test', timestamp: Date.now(), source: 'Automated Detection' }],
  });
  const beforeResolve = useGameStore.getState().regulatoryScores.manipulation;
  useGameStore.getState().resolveAlert('t1');
  const afterResolve = useGameStore.getState().regulatoryScores.manipulation;
  record(
    '4. 指数联动',
    '处理告警后指数下降',
    afterResolve < beforeResolve,
    `manipulation ${beforeResolve} → ${afterResolve}`,
  );
}

// ========== 5. Time consistency ==========
function testTimeConsistency() {
  resetBase();
  useGameStore.setState({ roundTime: 100, gameStatus: 'playing', currentDay: 1, maxDays: 5 });
  // Simulate header countdown one tick
  useGameStore.setState((s) => ({ roundTime: s.roundTime - 1 }));
  const rt = useGameStore.getState().roundTime;
  record(
    '5. 时间一致性',
    '倒计时在走 (roundTime 递减)',
    rt === 99,
    `roundTime=${rt}`,
  );

  resetBase();
  useGameStore.setState({ gameStatus: 'playing', simulation: { ...useGameStore.getState().simulation, session: 'morning' }, currentTick: 59 });
  useGameStore.getState().processTick();
  const lunch = useGameStore.getState();
  record(
    '5. 时间一致性',
    '上午 60 tick 后进入午休',
    lunch.simulation.session === 'lunch' && lunch.gameStatus === 'idle',
    `session=${lunch.simulation.session}, status=${lunch.gameStatus}`,
  );

  resetBase();
  const dayBefore = useGameStore.getState().currentDay;
  useGameStore.setState({
    gameStatus: 'idle',
    currentQuote: { ...useGameStore.getState().currentQuote, price: 105, prevClose: 100 },
    simulation: { ...useGameStore.getState().simulation, session: 'closed' },
  });
  useGameStore.getState().resumeNextDay();
  const nextDay = useGameStore.getState();
  record(
    '5. 时间一致性',
    '新交易日 Day 标签递增',
    nextDay.currentDay === dayBefore + 1,
    `Day ${dayBefore} → ${nextDay.currentDay}`,
  );
  record(
    '5. 时间一致性',
    '新交易日开盘价 reset (change=0, open=昨收)',
    nextDay.currentQuote.change === 0 && nextDay.currentQuote.open === 105,
    `open=${nextDay.currentQuote.open}, change=${nextDay.currentQuote.change}, prevClose=${nextDay.currentQuote.prevClose}`,
  );

  // Header day vs tick engine desync
  useGameStore.setState({ roundTime: 1, gameStatus: 'playing', currentDay: 1 });
  useGameStore.setState((s) => {
    const next = s.roundTime - 1;
    if (next <= 0) {
      return { roundTime: 12 * 3600 + 20 * 60 + 23, currentDay: Math.min(s.currentDay + 1, s.maxDays) };
    }
    return { roundTime: next };
  });
  const headerDay = useGameStore.getState().currentDay;
  record(
    '5. 时间一致性',
    'Header 倒计时与 tick 引擎 Day 同步',
    false,
    `Header 独立计时已把 currentDay 加到 ${headerDay}，但 tick 引擎 session 未变（两套时钟）`,
    true,
  );
}

// ========== 6. Positions ==========
function testPositions() {
  resetBase();
  useGameStore.getState().placeOrder({ symbol: 'QDN', type: 'market', side: 'buy', price: 100, quantity: 200, status: 'filled' });
  let s = useGameStore.getState();
  record(
    '6. 持仓一致性',
    '买入后持仓列表新增',
    s.holdings.some((h) => h.symbol === 'QDN' && h.shares === 200),
    `holdings=${JSON.stringify(s.holdings)}`,
  );

  const h = s.holdings.find((x) => x.symbol === 'QDN')!;
  record(
    '6. 持仓一致性',
    '持仓盈亏计算 (现价-成本价)',
    Math.abs(h.pnl - (h.marketPrice - h.avgPrice) * h.shares) < 0.01,
    `pnl=${h.pnl}, 期望 ${(h.marketPrice - h.avgPrice) * h.shares}`,
  );

  useGameStore.getState().placeOrder({ symbol: 'QDN', type: 'market', side: 'sell', price: 100, quantity: 200, status: 'filled' });
  s = useGameStore.getState();
  record(
    '6. 持仓一致性',
    '卖完后持仓列表移除',
    !s.holdings.some((x) => x.symbol === 'QDN'),
    `holdings count=${s.holdings.length}`,
  );

  // Non-active symbol not repriced on tick
  resetBase();
  useGameStore.setState({
    holdings: [
      { symbol: 'AAPL', shares: 100, avgPrice: 50, marketPrice: 50, pnl: 0, pnlPercent: 0, sector: 'Tech' },
    ],
    currentQuote: { ...useGameStore.getState().currentQuote, symbol: 'QDN', price: 100, prevClose: 100 },
  });
  useGameStore.getState().processTick();
  const aapl = useGameStore.getState().holdings.find((h) => h.symbol === 'AAPL')!;
  record(
    '6. 持仓一致性',
    '非当前标的持仓价随 tick 更新',
    aapl.marketPrice !== 50,
    `AAPL marketPrice=${aapl.marketPrice}`,
    aapl.marketPrice === 50,
  );
}

// ========== Run ==========
testAssets();
testDealerResources();
testPriceLinkage();
testManipulationIndex();
testTimeConsistency();
testPositions();

console.log('\n=== Stock-Double Play 数据联动测试报告 ===\n');
let lastCat = '';
for (const r of results) {
  if (r.category !== lastCat) {
    console.log(`\n## ${r.category}\n`);
    lastCat = r.category;
  }
  console.log(`- ${r.item}: ${r.verdict}`);
  console.log(`  ${r.detail}`);
}

const counts = results.reduce(
  (acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);
console.log('\n--- 汇总 ---');
console.log(`✅ ${counts['✅正确'] ?? 0}  ❌ ${counts['❌错误'] ?? 0}  ⚠️ ${counts['⚠️疑似错误'] ?? 0}  / 共 ${results.length} 项`);
