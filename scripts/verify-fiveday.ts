// Headless verification of the full 5-day match → settlement flow.
// Drives the store's tick engine manually (no real timers waited on) to confirm:
//  - morning 60 ticks -> lunch, afternoon 60 ticks -> day close
//  - days advance 1..5
//  - final day close -> gameStatus 'settlement'
//  - restartMatch + startMatch returns to matchmaking with fresh assets
import { useGameStore } from '../src/store/gameStore';

const store = useGameStore;
const log: string[] = [];
const ok = (label: string, pass: boolean, extra = '') =>
  log.push(`${pass ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);

function runHalfSession() {
  // processTick auto-triggers endLunchBreak / endTradingDay at 60 ticks.
  for (let i = 0; i < 60; i++) {
    if (store.getState().gameStatus !== 'playing') break;
    store.getState().processTick();
  }
}

// Start a fresh match straight into playing.
store.getState().restartMatch();
store.setState({ gameStatus: 'playing' });
store.setState({ simulation: { ...store.getState().simulation, session: 'morning' } });

ok('初始 totalAssets = 1亿', store.getState().totalAssets === 100000000, `${store.getState().totalAssets}`);
ok('初始 holdings 为空', store.getState().holdings.length === 0);

let settlementReached = false;
for (let day = 1; day <= 5; day++) {
  // Morning
  store.setState({ gameStatus: 'playing', simulation: { ...store.getState().simulation, session: 'morning' } });
  runHalfSession();
  const afterMorning = store.getState();
  ok(`Day${day} 上午后进入午休`, afterMorning.simulation.session === 'lunch', afterMorning.simulation.session);

  // Afternoon
  store.getState().resumeAfternoon();
  ok(`Day${day} 下午开盘`, store.getState().simulation.session === 'afternoon' && store.getState().gameStatus === 'playing');
  runHalfSession();

  const afterClose = store.getState();
  if (day < 5) {
    ok(`Day${day} 收盘后 session=closed`, afterClose.simulation.session === 'closed', afterClose.simulation.session);
    store.getState().resumeNextDay();
    ok(`进入 Day${day + 1}`, store.getState().currentDay === day + 1, `currentDay=${store.getState().currentDay}`);
  } else {
    ok('Day5 收盘触发结算', afterClose.gameStatus === 'settlement', `gameStatus=${afterClose.gameStatus}`);
    settlementReached = afterClose.gameStatus === 'settlement';
    ok('结算已计算 finalAssets', typeof afterClose.simulation.finalAssets === 'number', `${afterClose.simulation.finalAssets}`);
  }
}

// "再来一局" -> restart + startMatch => matching, fresh assets
store.getState().restartMatch();
store.getState().startMatch();
const restarted = store.getState();
ok('再来一局回到匹配 (matching)', restarted.gameStatus === 'matching', restarted.gameStatus);
ok('再来一局资产重置为 1亿', restarted.totalAssets === 100000000, `${restarted.totalAssets}`);
ok('再来一局持仓清空', restarted.holdings.length === 0);

console.log('\n=== 5 天对局 + 结算流程验证 ===\n');
console.log(log.join('\n'));
const failed = log.filter((l) => l.startsWith('❌')).length;
console.log(`\n--- 汇总: ${log.length - failed} 通过 / ${failed} 失败 / 共 ${log.length} 项 ---`);
console.log(`结算弹窗可达: ${settlementReached ? '是' : '否'}`);
process.exit(failed > 0 ? 1 : 0);
