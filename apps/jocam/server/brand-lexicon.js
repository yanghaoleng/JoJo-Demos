const CORE_BRAND_TERMS = [
  "叫叫",
  "绿豆",
  "粉豆",
  "猪小弟",
  "铃铛",
  "思维",
  "阅读",
  "萌萌星球",
  "豆荚号",
];

// Selected stable proper nouns from the maintained "叫叫-IP设定资料" document.
// Generic personality traits and plot vocabulary are deliberately excluded.
export const IP_DOCUMENT_TERMS = Object.freeze([
  "叫叫小分队",
  "萌萌星",
  "萌萌大陆",
  "皮皮镇",
  "奇妙屋",
  "铁皮广场",
  "奇幻森林",
  "拼拼大王",
  "拼音村",
  "乌拉拉",
  "妮妮",
  "小毛球",
  "小鹿老师",
  "喵老板",
  "猪小玉",
  "豆豆家族",
  "豆芽",
  "蓝豆",
  "大红豆",
  "董高分",
  "秦练习",
  "艾改错",
  "UP研究社",
  "米粒",
  "圆宝",
  "杜子腾",
  "包仔",
  "蛋仔",
  "帽哥",
  "如生",
  "烂笔头哥",
  "灯灯",
  "咕噜",
  "恶作剧博士",
  "叽里咕噜",
  "艾丽",
  "赛奇",
  "Domi",
  "Hatty",
  "Elfie",
  "Hackett",
  "Allie",
  "Sage",
  "阿祖拉星球",
  "啵克星球",
  "帽子国",
  "精灵城",
  "糖果星球",
  "三角形星球",
  "童话星球",
  "恐龙星球",
  "豆豆星球",
]);

export const DEFAULT_BRAND_TERMS = Object.freeze([
  ...new Set([...CORE_BRAND_TERMS, ...IP_DOCUMENT_TERMS]),
]);

const HIGH_CONFIDENCE_CORRECTIONS = Object.freeze([
  ["笑笑", "叫叫"],
  ["驴豆", "绿豆"],
  ["粉痘", "粉豆"],
  ["朱小弟", "猪小弟"],
  ["铃当", "铃铛"],
  ["萌萌星求", "萌萌星球"],
  ["豆夹号", "豆荚号"],
]);

function uniqueTerms(terms) {
  return [...new Set(terms.map((term) => String(term).trim()).filter(Boolean))];
}

export function getBrandTerms(env = process.env) {
  const additions = String(env.JOCAM_ASR_HOTWORDS || "").split(",");
  return uniqueTerms([...DEFAULT_BRAND_TERMS, ...additions]);
}

export function buildHotwordContext(terms = DEFAULT_BRAND_TERMS) {
  const hotwords = uniqueTerms(terms).map((word) => ({ word }));
  return hotwords.length ? JSON.stringify({ hotwords }) : "";
}

export function correctBrandTranscript(input) {
  let text = String(input || "");
  const corrections = [];
  for (const [heard, brandTerm] of HIGH_CONFIDENCE_CORRECTIONS) {
    if (!text.includes(heard)) continue;
    const occurrences = text.split(heard).length - 1;
    text = text.replaceAll(heard, brandTerm);
    corrections.push({ heard, brandTerm, occurrences });
  }
  return { text, corrections };
}
