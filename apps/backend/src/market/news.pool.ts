import type { NewsItem } from '../common/types';

/**
 * 16 条预设新闻 — bullish / bearish / neutral 三档情感标签。
 * 30-60 秒随机推送一条；监管"操纵指数 + 虚假信息"告警依赖 sentiment 的语义判断。
 */
export interface NewsSeed {
  title: string;
  content: string;
  source: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export const NEWS_POOL: NewsSeed[] = [
  { title: '央行意外加息 25 个基点',           content: '央行宣布将基准利率上调 25 个基点，市场流动性收紧', source: 'Reuters',   sentiment: 'bearish' },
  { title: '科技股领涨大盘',                   content: '受 AI 利好消息推动，科技板块整体上涨 3.2%',          source: 'Bloomberg', sentiment: 'bullish' },
  { title: '央行降准 0.5 个百分点',             content: '中国人民银行下调存款准备金率释放流动性',                source: '新华社',     sentiment: 'bullish' },
  { title: '地缘政治紧张局势升级',             content: '中东局势可能影响原油供应链',                            source: 'CNBC',     sentiment: 'bearish' },
  { title: '芯片巨头财报超预期',               content: 'QDN 季度营收同比增长 38%，超华尔街预期',               source: 'Bloomberg', sentiment: 'bullish' },
  { title: '新能源汽车销量下滑',               content: 'TSLA 4 月销量环比下降 12%，市场担忧产能过剩',          source: 'Reuters',   sentiment: 'bearish' },
  { title: '美联储维持利率不变',               content: '鲍威尔表示将观察通胀数据再决定下一步行动',              source: 'Federal Reserve', sentiment: 'neutral' },
  { title: '互联网监管新规出台',               content: '网信办发布新规，要求平台企业加强合规管理',              source: '网信办',     sentiment: 'bearish' },
  { title: '医疗创新药获批上市',               content: 'JNJ 新一代抗癌药物获 FDA 批准',                       source: 'FDA',       sentiment: 'bullish' },
  { title: '油价创年内新高',                   content: 'OPEC+ 减产协议延长，布伦特原油突破 90 美元',          source: 'Bloomberg', sentiment: 'bullish' },
  { title: '欧盟启动反垄断调查',               content: '针对大型科技公司展开新一轮反垄断调查',                  source: 'FT',        sentiment: 'bearish' },
  { title: '宏观数据稳健',                     content: 'Q1 GDP 同比增长 5.2%，经济复苏势头良好',              source: '国家统计局', sentiment: 'bullish' },
  { title: '国际油价大幅下跌',                 content: '需求担忧导致原油价格单日跌超 5%',                     source: 'Reuters',   sentiment: 'bearish' },
  { title: '巴菲特增持金融股',                 content: '伯克希尔哈撒韦 13F 显示加仓银行板块',                  source: 'SEC',       sentiment: 'bullish' },
  { title: '半导体出口管制升级',               content: '美方宣布新一轮芯片出口限制措施',                       source: 'Reuters',   sentiment: 'bearish' },
  { title: '公司治理结构优化',                 content: '多家上市公司宣布回购计划，金额超 500 亿',              source: '上交所',     sentiment: 'bullish' },
];

/**
 * 4 类黑天鹅事件 — 每交易日 10% 概率触发，最多 ±15%。
 */
export const BLACK_SWAN_EVENTS = [
  { label: '央行加息',       range: [0.85, 0.92] },
  { label: '监管突查',       range: [0.88, 0.95] },
  { label: '重大利好',       range: [1.08, 1.15] },
  { label: '行业丑闻',       range: [0.90, 0.95] },
];

export const makeNewsItem = (seed: NewsSeed, tick: number): NewsItem => ({
  id: `news_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  type: seed.sentiment === 'bullish' ? 'verified' : seed.sentiment === 'bearish' ? 'warning' : 'unverified',
  title: seed.title,
  source: seed.source,
  tick,
  time: '刚刚',
  timestamp: Date.now(),
  content: seed.content,
  tags: [seed.sentiment.toUpperCase()],
});
