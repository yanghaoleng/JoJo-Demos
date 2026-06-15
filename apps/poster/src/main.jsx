import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import './styles.css';

const posterW = 736;
const posterH = 944;
const assetPath = (path) => `${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, '/');

const templates = [
  {
    id: 'focus',
    tab: '模板一',
    title: '专注力\n终于回来了',
    subtitle: '持续阅读334天',
    badge: '15分钟',
    note: '今日阅读 · 绘本陪伴',
    color: '#FFE36D',
    bg: assetPath('templates/figma-template-01.webp'),
    fallback: assetPath('templates/figma-template-01.webp'),
    sample: assetPath('templates/source-01.webp'),
    style: 'soft',
  },
  {
    id: 'still',
    tab: '模板二',
    title: '谁叫也不动',
    subtitle: '前3分钟东张西望，\n后12分钟谁叫也不动',
    badge: '第7天',
    note: '阅读打卡 · 专注时刻',
    color: '#FF6E6E',
    bg: assetPath('templates/figma-template-02.webp'),
    fallback: assetPath('templates/figma-template-02.webp'),
    sample: assetPath('templates/source-02.webp'),
    style: 'card',
  },
  {
    id: 'days',
    tab: '模板三',
    title: '阅读4234字',
    subtitle: '2026·06·24',
    badge: '24天',
    note: '今日阅读习惯切片',
    color: '#72D5F3',
    bg: assetPath('templates/figma-template-03.webp'),
    fallback: assetPath('templates/figma-template-03.webp'),
    sample: assetPath('templates/source-03.webp'),
    style: 'paper',
  },
  {
    id: 'reading-minutes',
    tab: '模板四',
    title: '故事\n读进眼睛里',
    subtitle: '今日阅读28分钟',
    badge: '理解力+1',
    note: '阅读分钟 · 专注成长',
    color: '#FFE25C',
    bg: assetPath('templates/reading-template-04.webp'),
    fallback: assetPath('templates/reading-template-04.webp'),
    sample: assetPath('templates/source-01.webp'),
    style: 'focus',
  },
  {
    id: 'word-lab',
    tab: '模板五',
    title: '阅读4234字',
    subtitle: '生字18 · 金句3 · 表达9',
    badge: '字数实验室',
    note: '阅读数据 · 词汇积累',
    color: '#73E3FE',
    bg: assetPath('templates/reading-template-05.webp'),
    fallback: assetPath('templates/reading-template-05.webp'),
    sample: assetPath('templates/source-02.webp'),
    style: 'metrics',
  },
  {
    id: 'streak-100',
    tab: '模板六',
    title: '连续\n阅读100天',
    subtitle: '本周完成5本绘本',
    badge: '阅读成就',
    note: '连续打卡 · 习惯成就',
    color: '#FF7C61',
    bg: assetPath('templates/reading-template-06.webp'),
    fallback: assetPath('templates/reading-template-06.webp'),
    sample: assetPath('templates/source-03.webp'),
    style: 'streak',
  },
  {
    id: 'story-route',
    tab: '模板七',
    title: '故事路线图',
    subtitle: '我在故事里走了8站',
    badge: '5本',
    note: '阅读轨迹 · 想象力地图',
    color: '#2FD68F',
    bg: assetPath('templates/reading-template-07.webp'),
    fallback: assetPath('templates/reading-template-07.webp'),
    sample: assetPath('templates/source-01.webp'),
    style: 'route',
  },
  {
    id: 'quiet-reading',
    tab: '模板八',
    title: '安静阅读\n21分钟',
    subtitle: '月亮也在听故事',
    badge: '专注值96',
    note: '安静阅读 · 金句记录',
    color: '#8456FF',
    bg: assetPath('templates/reading-template-08.webp'),
    fallback: assetPath('templates/reading-template-08.webp'),
    sample: assetPath('templates/source-02.webp'),
    style: 'quiet',
  },
];

const campaign = {
  title: '小红书打卡',
  heroTitle: '晒小红书\n集成长值',
  heroText: '晒到小红书，累计14天赢荣誉奖牌。',
  date: '2026.07.10',
  posterBrand: '叫叫夏日成长记录',
  publishCopy: '今天和孩子一起完成叫叫学习，把一点点坚持记录下来，也把夏天的成长留下来。',
  hashtags: '#叫叫夏日成长记录官 #叫叫app',
};

const activityStateConfig = {
  default: {
    progress: 0,
    total: 14,
    dayLabel: '第 1 天',
    taskTitle: '今日打卡：第 1 天',
    taskStatus: '待完成',
    primaryText: '去分享小红书',
    reward7Status: '待解锁',
    reward14Status: '待解锁',
    reward7Desc: '解锁第 1 份成长奖励',
    reward14Desc: '得成长荣誉奖牌',
    remaining: 432,
  },
  upload: {
    progress: 0,
    total: 14,
    dayLabel: '第 1 天',
    taskTitle: '今日打卡：第 1 天',
    taskStatus: '待上传',
    primaryText: '提交审核',
    reward7Status: '待解锁',
    reward14Status: '待解锁',
    reward7Desc: '解锁第 1 份成长奖励',
    reward14Desc: '得成长荣誉奖牌',
    remaining: 432,
  },
  reviewing: {
    progress: 0,
    total: 14,
    dayLabel: '第 1 天',
    taskTitle: '今日打卡：第 1 天',
    taskStatus: '审核中',
    reward7Status: '待解锁',
    reward14Status: '待解锁',
    reward7Desc: '解锁第 1 份成长奖励',
    reward14Desc: '得成长荣誉奖牌',
    remaining: 432,
  },
  approved7: {
    progress: 7,
    total: 14,
    dayLabel: '第 7 天',
    taskTitle: '今日打卡：第 7 天',
    taskStatus: '审核通过',
    reward7Status: '去领取',
    reward14Status: '待解锁',
    reward7Desc: '第 1 份成长奖励已解锁',
    reward14Desc: '得成长荣誉奖牌',
    remaining: 318,
  },
  complete14: {
    progress: 14,
    total: 14,
    dayLabel: '第 14 天',
    taskTitle: '打卡任务',
    taskStatus: '已完成',
    reward7Status: '已领取',
    reward14Status: '去领取',
    reward7Desc: '第 1 份成长奖励已领取',
    reward14Desc: '成长荣誉奖牌已解锁',
    remaining: 128,
  },
};

const prototypeStates = [
  { id: 'default', label: '默认' },
  { id: 'upload', label: '待上传' },
  { id: 'reviewing', label: '审核中' },
  { id: 'approved7', label: '7天可领' },
  { id: 'complete14', label: '14天完成' },
];

const taskSteps = ['制作海报', '发布小红书', '上传截图'];

const rules = [
  '活动期间内每日最多提交 1 次小红书打卡。',
  '首图需为叫叫活动海报页面，日期清晰可见。',
  '笔记需公开可见，并带 #叫叫夏日成长记录官 #叫叫app。',
  '累计审核通过 7 天领伴读权益，14 天领成长荣誉奖牌。',
  '奖牌限量先到先得，删除或私密笔记可能取消资格。',
];

const historyRecords = [
  { time: '07.10 21:30 上传', status: '审核成功', tone: 'success', desc: '已计入第 7 天打卡。' },
  { time: '07.09 20:12 上传', status: '审核中', tone: 'pending', desc: '结果将在审核完成后更新。' },
  { time: '07.08 22:01 上传', status: '审核失败', tone: 'danger', desc: '失败原因：打卡页面日期模糊不清，请重新上传清晰截图。' },
  { time: '07.07 19:45 上传', status: '审核失败', tone: 'danger', desc: '失败原因：首图非叫叫活动海报页面。' },
  { time: '07.06 18:18 上传', status: '审核成功', tone: 'success', desc: '已计入第 6 天打卡。' },
];

function cx(...items) {
  return items.filter(Boolean).join(' ');
}

function Icon({ name, className = 'inline-icon' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
  };

  const paths = {
    back: <path d="M15 5 8 12l7 7" />,
    calendar: (
      <>
        <path d="M7 3.8v3M17 3.8v3M5.2 8.5h13.6" />
        <path d="M6.8 5.4h10.4c1.1 0 2 .9 2 2v10.3c0 1.1-.9 2-2 2H6.8c-1.1 0-2-.9-2-2V7.4c0-1.1.9-2 2-2Z" />
        <path d="m8.8 13.2 2.1 2.1 4.5-4.8" />
      </>
    ),
    camera: (
      <>
        <path d="M7.2 8.2h2l1.1-1.7h3.4l1.1 1.7h2c1.1 0 2 .9 2 2v5.8c0 1.1-.9 2-2 2H7.2c-1.1 0-2-.9-2-2v-5.8c0-1.1.9-2 2-2Z" />
        <path d="M9.2 13.1a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0Z" />
      </>
    ),
    check: <path d="m6.2 12.2 3.5 3.4 8-8.3" />,
    clock: (
      <>
        <path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z" />
        <path d="M12 8v4.5l3 1.8" />
      </>
    ),
    gift: (
      <>
        <path d="M4.8 10h14.4v9H4.8zM4.2 7h15.6v3H4.2zM12 7v12" />
        <path d="M12 7s-3.6.2-4.1-1.6c-.4-1.5 1.2-2.2 2.3-1.4C11.2 4.8 12 7 12 7Zm0 0s3.6.2 4.1-1.6c.4-1.5-1.2-2.2-2.3-1.4C12.8 4.8 12 7 12 7Z" />
      </>
    ),
    poster: (
      <>
        <path d="M6.5 4.2h11c.8 0 1.4.6 1.4 1.4v12.8c0 .8-.6 1.4-1.4 1.4h-11c-.8 0-1.4-.6-1.4-1.4V5.6c0-.8.6-1.4 1.4-1.4Z" />
        <path d="M8 8h8M8 12h5.5M8 16h7" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    link: (
      <>
        <path d="M9.5 14.5 14.5 9.5" />
        <path d="M10.5 7.2 12 5.7a3.2 3.2 0 0 1 4.5 4.5L15 11.7" />
        <path d="M13.5 16.8 12 18.3a3.2 3.2 0 0 1-4.5-4.5L9 12.3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V5" />
        <path d="m8.4 8.6 3.6-3.6 3.6 3.6" />
        <path d="M5 15v3.2c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6V15" />
      </>
    ),
    image: (
      <>
        <path d="M5.5 5h13c.8 0 1.5.7 1.5 1.5v11c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-11C4 5.7 4.7 5 5.5 5Z" />
        <path d="m7 16 3.4-3.5 2.4 2.4 1.8-2 2.4 3.1" />
        <path d="M8.5 8.5h.1" />
      </>
    ),
    share: (
      <>
        <path d="M12 4v10" />
        <path d="m8.4 7.6 3.6-3.6 3.6 3.6" />
        <path d="M6 12.5v5.1c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2v-5.1" />
      </>
    ),
  };

  return (
    <svg {...common}>
      {paths[name]}
    </svg>
  );
}

function ChevronIcon({ direction }) {
  const path = direction === 'left' ? 'M14.5 6.5 9 12l5.5 5.5' : 'M9.5 6.5 15 12l-5.5 5.5';
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function FlipCameraIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 8.5h2.1l1.2-1.7h2.4l1.2 1.7h2.1c1 0 1.8.8 1.8 1.8v5.1c0 1-.8 1.8-1.8 1.8h-9c-1 0-1.8-.8-1.8-1.8v-5.1c0-1 .8-1.8 1.8-1.8Z" />
      <path d="M9.8 12.8a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0Z" />
      <path d="M5.4 6.5a7.7 7.7 0 0 1 12.1-1.2" />
      <path d="M17.4 3.6v1.9h-1.9" />
      <path d="M18.6 17.5a7.7 7.7 0 0 1-12.1 1.2" />
      <path d="M6.6 20.4v-1.9h1.9" />
    </svg>
  );
}

function cleanId(id) {
  return id.replace(/:/g, '');
}

function clampStage(stage) {
  return Math.min(14, Math.max(1, Number(stage) || 1));
}

function RewardIllustration({ type, className = '' }) {
  const rawId = cleanId(useId());
  const isCompanion = type === 'companion';

  if (isCompanion) {
    const glass = `${rawId}-companion-glass`;
    const gold = `${rawId}-companion-gold`;
    const page = `${rawId}-companion-page`;
    const leaf = `${rawId}-companion-leaf`;
    return (
      <svg className={cx('reward-illustration companion-illustration', className)} viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <radialGradient id={glass} cx="34%" cy="24%" r="72%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="48%" stopColor="#cde4e0" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#6aa5b7" stopOpacity="0.78" />
          </radialGradient>
          <linearGradient id={gold} x1="18" y1="16" x2="80" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff2b4" />
            <stop offset="45%" stopColor="#d8a84a" />
            <stop offset="100%" stopColor="#7f5a1a" />
          </linearGradient>
          <linearGradient id={page} x1="30" y1="42" x2="68" y2="68" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff9de" />
            <stop offset="100%" stopColor="#ead7a1" />
          </linearGradient>
          <linearGradient id={leaf} x1="13" y1="58" x2="84" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d9f4c6" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#5aa372" stopOpacity="0.76" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="38" fill={`url(#${glass})`} stroke={`url(#${gold})`} strokeWidth="3.8" />
        <circle cx="48" cy="48" r="43" fill="none" stroke="#f7df94" strokeWidth="2" opacity="0.52" />
        <path d="M17 61c12-8 20-9 29-2-11 3-18 7-26 14-4-2-5-7-3-12Z" fill={`url(#${leaf})`} stroke="#8fb083" strokeWidth="1.5" />
        <path d="M79 61c-12-8-20-9-29-2 11 3 18 7 26 14 4-2 5-7 3-12Z" fill={`url(#${leaf})`} stroke="#8fb083" strokeWidth="1.5" />
        <path d="M30 42c7-5 13-6 18-1v31c-6-5-12-6-18-3V42Z" fill={`url(#${page})`} stroke="#9f7425" strokeWidth="1.6" />
        <path d="M66 42c-7-5-13-6-18-1v31c6-5 12-6 18-3V42Z" fill={`url(#${page})`} stroke="#9f7425" strokeWidth="1.6" />
        <path d="M48 41v31" stroke="#b98624" strokeWidth="1.4" />
        <path d="M33 50c4-1 8-.6 12 1M52 51c4-1.5 8-1.8 12-.9M34 57c3.6-.8 7-.5 10 .9M53 58c3.2-1 6.8-1.2 10.4-.2" stroke="#d8bc73" strokeWidth="1" strokeLinecap="round" opacity="0.9" />
        <circle cx="58" cy="26" r="8" fill="#fff5c7" opacity="0.9" />
        <path d="M25 29h5M27.5 26.5v5M72 28h4M74 26v4" stroke="#fff1a8" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const gold = `${rawId}-medal-gold`;
  const enamel = `${rawId}-medal-enamel`;
  const ribbon = `${rawId}-medal-ribbon`;
  const leaf = `${rawId}-medal-leaf`;
  return (
    <svg className={cx('reward-illustration medal-illustration', className)} viewBox="0 0 96 112" aria-hidden="true">
      <defs>
        <linearGradient id={gold} x1="18" y1="16" x2="82" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff4bb" />
          <stop offset="38%" stopColor="#e9b95f" />
          <stop offset="74%" stopColor="#b17924" />
          <stop offset="100%" stopColor="#ffefae" />
        </linearGradient>
        <linearGradient id={enamel} x1="29" y1="34" x2="68" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff0d4" />
          <stop offset="55%" stopColor="#ef866c" />
          <stop offset="100%" stopColor="#b85a46" />
        </linearGradient>
        <linearGradient id={ribbon} x1="23" y1="4" x2="73" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe6a1" />
          <stop offset="28%" stopColor="#dc846b" />
          <stop offset="74%" stopColor="#f1b578" />
          <stop offset="100%" stopColor="#7e4a35" />
        </linearGradient>
        <linearGradient id={leaf} x1="37" y1="54" x2="62" y2="79" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ddf8bf" />
          <stop offset="64%" stopColor="#6aa767" />
          <stop offset="100%" stopColor="#2f6532" />
        </linearGradient>
      </defs>
      <path d="M24 8h48l-5 31H29L24 8Z" fill={`url(#${ribbon})`} stroke="#8c5b23" strokeWidth="2.3" />
      <path d="M43 8h10l2 31H41l2-31Z" fill="#fff0bf" opacity="0.75" />
      <rect x="19" y="4" width="58" height="10" rx="4" fill={`url(#${gold})`} stroke="#8c5b23" strokeWidth="2" />
      <circle cx="48" cy="70" r="33" fill={`url(#${gold})`} stroke="#8c5b23" strokeWidth="2.6" />
      <circle cx="48" cy="70" r="25" fill={`url(#${enamel})`} stroke="#f7dc8c" strokeWidth="2.4" />
      <circle cx="48" cy="70" r="16" fill="#fff7d7" opacity="0.56" />
      <path d="M48 81V61" stroke="#376d35" strokeWidth="3.1" strokeLinecap="round" />
      <path d="M48 69c-9-9-15-6-17 3 8 3 13 1 17-3Zm0-1c8-10 15-8 18 1-8 4-14 3-18-1Zm0-7c-2-9 2-14 9-16 2 8-1 13-9 16Z" fill={`url(#${leaf})`} stroke="#2e6530" strokeWidth="1.4" />
      <path d="M26 77c4 8 10 13 18 16M70 77c-4 8-10 13-18 16" fill="none" stroke="#fff3b4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M48 41l2.8 6 6.2 2.5-6.2 2.5L48 59l-2.8-6-6.2-2.5 6.2-2.5L48 41Z" fill="#fff6bf" stroke="#a87019" strokeWidth="1.4" />
    </svg>
  );
}

function GrowthMiniStage({ stage }) {
  const safeStage = clampStage(stage);
  const leaves = Math.min(8, Math.max(0, safeStage - 2));
  if (safeStage === 1) {
    return (
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <ellipse cx="14" cy="22" rx="8" ry="3.8" fill="currentColor" opacity="0.3" />
        <ellipse cx="14" cy="16" rx="4.5" ry="6" fill="currentColor" transform="rotate(-24 14 16)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      {safeStage >= 13 && <circle cx="14" cy="13" r="11" fill="currentColor" opacity="0.15" />}
      <ellipse cx="14" cy="23" rx="8" ry="3" fill="currentColor" opacity="0.25" />
      <path d="M14 22c.4-5 .5-9-.2-14" stroke="currentColor" strokeWidth={safeStage >= 7 ? 2.2 : 1.7} strokeLinecap="round" />
      {Array.from({ length: leaves }).map((_, index) => {
        const side = index % 2 ? 1 : -1;
        const y = 17 - Math.floor(index / 2) * 3.1;
        const x = 14 + side * (4.8 + Math.floor(index / 2) * 0.8);
        return <ellipse key={`${stage}-${index}`} cx={x} cy={y} rx="3.2" ry="5.1" fill="currentColor" opacity="0.82" transform={`rotate(${side * 38} ${x} ${y})`} />;
      })}
      {safeStage >= 11 && <circle cx="17" cy="8.5" r="1.8" fill="currentColor" opacity="0.88" />}
      {safeStage >= 14 && <path d="M14 2.2 15.5 5.4 19 6.7l-3.5 1.4L14 11.3l-1.5-3.2L9 6.7l3.5-1.3L14 2.2Z" fill="currentColor" />}
    </svg>
  );
}

function GrowthStageStrip({ stage }) {
  const activeStage = clampStage(stage);
  return (
    <div className="growth-stage-strip" aria-label={`成长值第 ${activeStage} 阶段，共 14 阶段`}>
      {Array.from({ length: 14 }).map((_, index) => {
        const itemStage = index + 1;
        return (
          <span
            key={itemStage}
            className={cx(
              'growth-stage-step',
              itemStage <= activeStage && 'active',
              [1, 7, 14].includes(itemStage) && 'major',
              itemStage === activeStage && 'current'
            )}
            style={{ '--breath-delay': `${itemStage * 80}ms` }}
            title={`第 ${itemStage} 阶`}
          >
            <GrowthMiniStage stage={itemStage} />
          </span>
        );
      })}
    </div>
  );
}

function GrowthTreeIcon({ stage = 1, className = '' }) {
  const rawId = cleanId(useId());
  const safeStage = clampStage(stage);
  const leafGradient = `${rawId}-tree-leaf`;
  const trunkGradient = `${rawId}-tree-trunk`;
  const glassGradient = `${rawId}-tree-glass`;
  const soilGradient = `${rawId}-tree-soil`;
  const leaves = [
    { min: 2, x: 59, y: 66, rx: 8, ry: 13, rotate: -12 },
    { min: 3, x: 47, y: 71, rx: 7, ry: 11, rotate: -48 },
    { min: 4, x: 70, y: 70, rx: 7, ry: 11, rotate: 42 },
    { min: 5, x: 42, y: 58, rx: 8, ry: 12, rotate: -64 },
    { min: 6, x: 76, y: 57, rx: 8, ry: 12, rotate: 58 },
    { min: 7, x: 58, y: 47, rx: 8, ry: 13, rotate: 4 },
    { min: 8, x: 35, y: 74, rx: 8, ry: 12, rotate: -78 },
    { min: 9, x: 84, y: 73, rx: 8, ry: 12, rotate: 74 },
    { min: 10, x: 39, y: 45, rx: 9, ry: 13, rotate: -54 },
    { min: 11, x: 80, y: 44, rx: 9, ry: 13, rotate: 50 },
    { min: 12, x: 59, y: 33, rx: 9, ry: 14, rotate: 8 },
    { min: 13, x: 30, y: 59, rx: 8, ry: 12, rotate: -88 },
    { min: 14, x: 90, y: 58, rx: 8, ry: 12, rotate: 84 },
  ];

  if (safeStage === 1) {
    return (
      <svg className={cx('growth-tree-icon', 'seed-stage', className)} viewBox="0 0 120 132" aria-hidden="true">
        <defs>
          <linearGradient id={soilGradient} x1="23" y1="96" x2="96" y2="121" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffe8a8" />
            <stop offset="100%" stopColor="#8f6127" />
          </linearGradient>
          <linearGradient id={leafGradient} x1="44" y1="56" x2="72" y2="91" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f5e796" />
            <stop offset="100%" stopColor="#79a957" />
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="108" rx="44" ry="13" fill={`url(#${soilGradient})`} opacity="0.55" />
        <ellipse cx="60" cy="104" rx="32" ry="8" fill="#6d4a2a" opacity="0.38" />
        <ellipse cx="60" cy="82" rx="15" ry="21" fill={`url(#${leafGradient})`} stroke="#8a7826" strokeWidth="2" transform="rotate(-26 60 82)" />
        <path d="M45 93c10 6 21 5 31-3" fill="none" stroke="#fff3b2" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      </svg>
    );
  }

  return (
    <svg className={cx('growth-tree-icon', `tree-stage-${safeStage}`, className)} viewBox="0 0 120 132" aria-hidden="true">
      <defs>
        <linearGradient id={leafGradient} x1="24" y1="28" x2="96" y2="93" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f1f5a9" />
          <stop offset="44%" stopColor="#98c677" />
          <stop offset="100%" stopColor="#3f8c68" />
        </linearGradient>
        <linearGradient id={trunkGradient} x1="48" y1="46" x2="69" y2="113" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d6a35a" />
          <stop offset="52%" stopColor="#8f5c2f" />
          <stop offset="100%" stopColor="#51331f" />
        </linearGradient>
        <radialGradient id={glassGradient} cx="34%" cy="18%" r="82%">
          <stop stopColor="#fff7d4" stopOpacity="0.86" />
          <stop offset="56%" stopColor="#b9e6d8" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#78a8b4" stopOpacity="0.26" />
        </radialGradient>
        <linearGradient id={soilGradient} x1="20" y1="97" x2="102" y2="121" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6dc82" />
          <stop offset="54%" stopColor="#7ba56b" />
          <stop offset="100%" stopColor="#7a5225" />
        </linearGradient>
      </defs>
      {safeStage >= 7 && <circle cx="60" cy="61" r={safeStage >= 14 ? 47 : 39} fill={`url(#${glassGradient})`} stroke="#f2d98c" strokeWidth="2" opacity="0.72" />}
      {safeStage >= 14 && <path d="M60 14 63 20.5 70 23 63 25.5 60 32 57 25.5 50 23 57 20.5 60 14Z" fill="#fff1a5" stroke="#b77b20" strokeWidth="1.5" />}
      <ellipse cx="60" cy="108" rx="43" ry="12" fill={`url(#${soilGradient})`} opacity="0.62" />
      <path
        d={safeStage < 7 ? 'M60 106C60 91 59 77 56 62' : 'M58 106c4-22 3-41-1-58 7 16 10 35 5 58Z'}
        fill={safeStage < 7 ? 'none' : `url(#${trunkGradient})`}
        stroke={`url(#${trunkGradient})`}
        strokeWidth={safeStage < 7 ? 5 : 2}
        strokeLinecap="round"
      />
      {safeStage >= 4 && <path d="M58 76c-10-7-16-10-26-10" fill="none" stroke={`url(#${trunkGradient})`} strokeWidth="3.3" strokeLinecap="round" />}
      {safeStage >= 5 && <path d="M61 77c9-8 16-11 27-10" fill="none" stroke={`url(#${trunkGradient})`} strokeWidth="3.3" strokeLinecap="round" />}
      {safeStage >= 8 && <path d="M58 61c-11-7-15-12-23-20" fill="none" stroke={`url(#${trunkGradient})`} strokeWidth="2.5" strokeLinecap="round" />}
      {safeStage >= 9 && <path d="M62 61c10-7 16-12 25-20" fill="none" stroke={`url(#${trunkGradient})`} strokeWidth="2.5" strokeLinecap="round" />}
      {leaves.filter((leaf) => leaf.min <= safeStage).map((leaf) => (
        <ellipse
          key={`${leaf.x}-${leaf.y}`}
          cx={leaf.x}
          cy={leaf.y}
          rx={leaf.rx}
          ry={leaf.ry}
          fill={`url(#${leafGradient})`}
          stroke="#447b45"
          strokeWidth="1.25"
          opacity={leaf.min > safeStage - 1 ? 0.82 : 0.96}
          transform={`rotate(${leaf.rotate} ${leaf.x} ${leaf.y})`}
        />
      ))}
      {safeStage >= 11 && [34, 52, 73, 88].map((x, index) => (
        <circle key={x} cx={x} cy={index % 2 ? 40 : 51} r="3.2" fill="#fff2a2" stroke="#d6b84f" strokeWidth="0.9" />
      ))}
    </svg>
  );
}

function drawCoverImage(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  const sourceRatio = sw / sh;
  const targetRatio = dw / dh;
  let cropW = sw;
  let cropH = sh;
  let cropX = sx;
  let cropY = sy;

  if (sourceRatio > targetRatio) {
    cropW = sh * targetRatio;
    cropX = sx + (sw - cropW) / 2;
  } else {
    cropH = sw / targetRatio;
    cropY = sy + (sh - cropH) / 2;
  }

  ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
}

function usePosterAnimation(activeIndex, screen) {
  const cardRef = useRef(null);
  const chromeRef = useRef(null);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { x: activeIndex % 2 ? 58 : -58, scale: 0.97, opacity: 0 },
      { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, duration: 0.56, ease: 'back.out(1.15)' }
    );
  }, [activeIndex]);

  useEffect(() => {
    if (!chromeRef.current) return;
    gsap.fromTo(
      chromeRef.current.children,
      { y: -10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.42, stagger: 0.055, ease: 'power2.out' }
    );
  }, []);

  useEffect(() => {
    gsap.fromTo(
      '[data-screen]',
      { opacity: 0, y: screen === 'camera' ? 32 : 18 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    );
  }, [screen]);

  return { cardRef, chromeRef };
}

function TemplatePreview({ template, isActive, style }) {
  return (
    <article className={cx('poster-card', isActive && 'active')} style={style}>
      <img
        className="poster-card-photo"
        src={template.sample}
        alt=""
        loading="eager"
        decoding="async"
      />
      <img
        className="poster-card-template"
        src={template.bg}
        onError={(event) => { event.currentTarget.src = template.fallback; }}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
      <div className="poster-card-shine" />
    </article>
  );
}

function AppHeader({ title, onBack, onRules, rightLabel }) {
  return (
    <header className="activity-nav">
      {onBack ? (
        <button className="nav-icon-button" type="button" onClick={onBack} aria-label="返回">
          <Icon name="back" />
        </button>
      ) : <span />}
      <h1>{title}</h1>
      {onRules ? (
        <button className="rules-button" type="button" onClick={onRules}>{rightLabel || '规则'}</button>
      ) : <span />}
    </header>
  );
}

function StatusBadge({ children, tone = 'default' }) {
  return <span className={cx('status-badge', tone)}>{children}</span>;
}

function CampaignHero({ progress }) {
  const stage = clampStage(progress || 1);
  return (
    <section className="campaign-hero">
      <div>
        <h2>{campaign.heroTitle}</h2>
        <p>{campaign.heroText}</p>
      </div>
      <div className="growth-art" aria-label={`成长值第 ${stage} 阶段`}>
        <GrowthTreeIcon stage={stage} />
        <strong>成长值 · 第 {stage}/14 阶</strong>
        <GrowthStageStrip stage={stage} />
      </div>
    </section>
  );
}

function ProgressCard({ state }) {
  const percent = state.progress / state.total;
  return (
    <section className="progress-card" aria-label="累计进度">
      <div className="section-title-row">
        <h3>累计进度</h3>
        <strong>{state.progress}/{state.total} 天</strong>
      </div>
      <div className="progress-track" style={{ '--progress': percent }}>
        <span className="marker start"><span className="marker-dot" /><i>开始</i></span>
        <span className="marker day7">
          <span className="marker-token companion"><RewardIllustration type="companion" /></span>
          <b>7天礼</b>
          <i>伴读权益</i>
        </span>
        <span className="marker day14">
          <span className="marker-token medal"><RewardIllustration type="medal" /></span>
          <b>14天牌</b>
          <i>荣誉奖牌</i>
        </span>
      </div>
    </section>
  );
}

function RewardCard({ type, status, desc, remaining, onReward }) {
  const isSeven = type === 'seven';
  const canClaim = status === '去领取';
  return (
    <article className={cx('reward-card', isSeven ? 'companion' : 'medal-reward')}>
      <div className="reward-icon" aria-hidden="true">
        <RewardIllustration type={isSeven ? 'companion' : 'medal'} />
      </div>
      <div>
        <h3>{isSeven ? '累计打卡 7 天' : '累计打卡 14 天'}</h3>
        <p>{desc}</p>
        {!isSeven && <em>限量 600，还剩 {remaining}</em>}
      </div>
      <button
        type="button"
        className={cx('reward-action', canClaim && 'claimable', status === '已领取' && 'claimed')}
        onClick={() => canClaim && onReward(isSeven ? 'seven' : 'fourteen')}
        disabled={!canClaim}
      >
        {status}
      </button>
    </article>
  );
}

function TaskSteps() {
  return (
    <div className="task-steps">
      {taskSteps.map((step, index) => (
        <React.Fragment key={step}>
          <div className="step-box">
            <strong>{index + 1}</strong>
            <span>{step}</span>
          </div>
          {index < taskSteps.length - 1 && <span className="step-arrow">›</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function UploadPanel({ linkValue, onLinkChange, onExample, onSubmit, uploaded, setUploaded }) {
  return (
    <div className="upload-panel">
      <div className={cx('upload-zone', uploaded && 'uploaded')}>
        <button type="button" onClick={() => setUploaded(true)}>
          <Icon name={uploaded ? 'check' : 'upload'} />
          {uploaded ? '已上传截图' : '+ 上传截图 小红书发布页'}
        </button>
      </div>
      <button className="example-tile" type="button" onClick={onExample}>
        <span>截图示例</span>
        <strong>点击查看</strong>
      </button>
      <label className="link-field">
        <span>小红书链接</span>
        <input value={linkValue} onChange={(event) => onLinkChange(event.target.value)} />
      </label>
      <button className="activity-primary compact" type="button" onClick={onSubmit}>
        提交审核
      </button>
    </div>
  );
}

function DailyTaskCard({
  state,
  status,
  onStart,
  onExample,
  onSubmit,
  onShowPoster,
  onRequirement,
  linkValue,
  onLinkChange,
  uploaded,
  setUploaded,
}) {
  const isComplete = status === 'complete14';
  const isApproved = status === 'approved7';
  const isReviewing = status === 'reviewing';
  const isUpload = status === 'upload';

  return (
    <section className="daily-card" aria-label="今日打卡任务">
      <div className="section-title-row">
        <h3>{state.taskTitle}</h3>
        <StatusBadge tone={isApproved || isComplete ? 'success' : isReviewing ? 'pending' : 'info'}>
          {state.taskStatus}
        </StatusBadge>
      </div>

      {!isComplete && <TaskSteps />}

      {!isComplete && (
        <button className="requirement-row" type="button" onClick={onRequirement}>
          <span>发文要求</span>
          <strong>点击查看</strong>
        </button>
      )}

      {status === 'default' && (
        <button className="activity-primary compact" type="button" onClick={onStart}>
          {state.primaryText}
        </button>
      )}

      {isUpload && (
        <UploadPanel
          linkValue={linkValue}
          onLinkChange={onLinkChange}
          onExample={onExample}
          onSubmit={onSubmit}
          uploaded={uploaded}
          setUploaded={setUploaded}
        />
      )}

      {isReviewing && (
        <div className="review-box pending">
          <strong>审核中</strong>
          <span>提交时间 07.10 21:30</span>
          <p>结果会在这里更新</p>
        </div>
      )}

      {isApproved && (
        <div className="review-box success">
          <strong>审核通过</strong>
          <p>今日打卡成功，已累计 +1</p>
        </div>
      )}

      {isComplete && (
        <div className="review-box success complete">
          <strong>你已完成本次打卡挑战</strong>
          <p>后续可继续查看成长记录，不再更新今日打卡任务。</p>
        </div>
      )}

      {(isReviewing || isApproved || isComplete) && (
        <button className="secondary-wide" type="button" onClick={onShowPoster}>
          查看我的海报
        </button>
      )}
    </section>
  );
}

function PrototypeSwitcher({ value, onChange }) {
  return (
    <section className="prototype-switcher" aria-label="状态预览">
      <p>状态预览</p>
      <div>
        {prototypeStates.map((item) => (
          <button
            key={item.id}
            type="button"
            className={value === item.id ? 'selected' : ''}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ActivityHomeScreen({
  status,
  setStatus,
  openPosterHome,
  openRules,
  openHistory,
  openExample,
  openReward,
  openSharePoster,
  submitReview,
  linkValue,
  onLinkChange,
  uploaded,
  setUploaded,
}) {
  const state = activityStateConfig[status];

  return (
    <main className="app-screen activity-screen" data-screen>
      <AppHeader title={campaign.title} onRules={openRules} />
      <CampaignHero progress={state.progress} />
      <ProgressCard state={state} />
      <div className="reward-list">
        <RewardCard type="seven" status={state.reward7Status} desc={state.reward7Desc} remaining={state.remaining} onReward={openReward} />
        <RewardCard type="fourteen" status={state.reward14Status} desc={state.reward14Desc} remaining={state.remaining} onReward={openReward} />
      </div>
      <DailyTaskCard
        state={state}
        status={status}
        onStart={openPosterHome}
        onExample={openExample}
        onSubmit={submitReview}
        onShowPoster={openSharePoster}
        onRequirement={openRules}
        linkValue={linkValue}
        onLinkChange={onLinkChange}
        uploaded={uploaded}
        setUploaded={setUploaded}
      />
      <button className="history-link" type="button" onClick={openHistory}>查看历史记录</button>
      <PrototypeSwitcher value={status} onChange={setStatus} />
    </main>
  );
}

function PosterBuilderScreen({ activeIndex, go, startCamera, openActivityHome, cardRef, chromeRef }) {
  const active = templates[activeIndex];

  return (
    <main className="app-screen builder-screen" data-screen>
      <AppHeader title="制作海报" onRules={openActivityHome} rightLabel="活动首页" />
      <div className="builder-meta" ref={chromeRef}>
        <strong>{campaign.date}</strong>
        <span>今日打卡海报</span>
      </div>

      <section
        className="builder-stage"
        aria-label="海报模板"
      >
        <div className="builder-stage-head">
          <strong>海报模板 {activeIndex + 1}/{Math.min(templates.length, 4)}</strong>
          <span>夏日成长</span>
        </div>
        <button className="add-photo-button" type="button">
          <Icon name="plus" />
          添加照片
        </button>
        <div ref={cardRef} className="poster-card-wrap builder-card-wrap">
          <TemplatePreview template={active} isActive />
          <div className="builder-preview-copy">
            <strong>默认海报预览</strong>
            <span>可左右切换模板</span>
          </div>
        </div>

        <div className="arrow-row">
          <button className="round-control" type="button" onClick={() => go(-1)} aria-label="上一个模板">
            <ChevronIcon direction="left" />
          </button>
          <button className="round-control" type="button" onClick={() => go(1)} aria-label="下一个模板">
            <ChevronIcon direction="right" />
          </button>
        </div>
        <div className="template-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => <span key={item} className={item === activeIndex % 4 ? 'active' : ''} />)}
        </div>
      </section>

      <ol className="builder-tips">
        <li>选择喜欢的海报模板。</li>
        <li>拍照或从相册选择孩子学习照片。</li>
        <li>制作完成后可保存并分享到小红书。</li>
      </ol>

      <button className="activity-primary compact" type="button" onClick={startCamera}>
        拍照制作
      </button>
    </main>
  );
}

function CameraOverlay({ template }) {
  return (
    <div className="camera-template">
      <img src={template.bg} alt="" loading="eager" decoding="async" />
    </div>
  );
}

function CameraScreen({
  template,
  videoRef,
  cancelCamera,
  capturePoster,
  switchCamera,
  cameraReady,
  cameraError,
  cameraFacing,
  cameraStatus,
}) {
  const cameraLabel = cameraFacing === 'user' ? '前置' : '后置';

  return (
    <main className="app-screen camera-screen" data-screen>
      <section className="camera-shell">
        <div className="camera-frame">
          <video
            ref={videoRef}
            className={cx('camera-video', cameraFacing === 'user' && 'mirrored')}
            autoPlay
            playsInline
            muted
          />
          {!cameraReady && (
            <div className="camera-placeholder" style={{ '--camera-fallback': `url(${template.sample})` }}>
              <span>{cameraError || `正在打开${cameraLabel}摄像头`}</span>
            </div>
          )}
          <CameraOverlay template={template} />
        </div>
      </section>
      <footer className="camera-controls">
        <button className="ghost-action" type="button" onClick={cancelCamera}>取消</button>
        <button className="shutter" type="button" onClick={capturePoster} aria-label="拍照">
          <span />
        </button>
        <button
          className="icon-action"
          type="button"
          onClick={switchCamera}
          disabled={cameraStatus === 'requesting'}
          aria-label={`切换到${cameraFacing === 'user' ? '后置' : '前置'}摄像头`}
        >
          <FlipCameraIcon />
          <span className="visually-hidden">切换摄像头</span>
        </button>
      </footer>
    </main>
  );
}

function GeneratedPosterPreview({ resultUrl, template }) {
  if (resultUrl) {
    return <img className="share-result-image" src={resultUrl} alt="生成的打卡分享海报" />;
  }

  return (
    <div className="share-result-image mock-poster">
      <img src={template.sample} alt="" />
      <img src={template.bg} alt="" />
    </div>
  );
}

function SharePosterScreen({ resultUrl, template, backBuilder, openPublish }) {
  return (
    <main className="app-screen share-screen" data-screen>
      <AppHeader title="分享海报" onBack={backBuilder} />
      <section className="share-card">
        <div className="share-card-head">
          <strong>{campaign.date}</strong>
          <span>{campaign.posterBrand}</span>
        </div>
        <GeneratedPosterPreview resultUrl={resultUrl} template={template} />
        <div className="poster-stats">
          <strong>今日打卡<br />第 1 天</strong>
          <strong>已坚持学习<br />21 天</strong>
        </div>
      </section>
      <a className="activity-primary compact save-link" href={resultUrl || template.sample} download="打卡分享海报.png">
        保存海报到相册
      </a>
      <button className="publish-link-button" type="button" onClick={openPublish}>
        分享到小红书 App
      </button>
      <ol className="builder-tips share-tips">
        <li>发布小红书后，回活动页上传截图和链接。</li>
        <li>截图需能看到已发布的海报笔记页面。</li>
      </ol>
    </main>
  );
}

function PublishScreen({ resultUrl, template, backShare, finishPublish }) {
  return (
    <main className="app-screen publish-screen" data-screen>
      <AppHeader title="发布小红书笔记" onBack={backShare} />
      <section className="publish-card">
        <div className="publish-cover">
          <GeneratedPosterPreview resultUrl={resultUrl} template={template} />
          <strong>首图<br />制作完成的海报</strong>
        </div>
        <div className="publish-copy">
          <p>{campaign.publishCopy}</p>
          <p>{campaign.hashtags}</p>
        </div>
      </section>
      <button className="publish-final-button" type="button" onClick={finishPublish}>
        发布
      </button>
    </main>
  );
}

function HistoryScreen({ backActivity }) {
  return (
    <main className="app-screen history-screen" data-screen>
      <AppHeader title="打卡历史" onBack={backActivity} />
      <section className="history-summary">
        <span>累计有效打卡</span>
        <strong>7 天</strong>
        <p>展示每次提交和审核结果</p>
      </section>
      <div className="history-list">
        {historyRecords.map((record) => (
          <article className="history-item" key={record.time}>
            <div>
              <strong>{record.time}</strong>
              <p>{record.desc}</p>
            </div>
            <StatusBadge tone={record.tone}>{record.status}</StatusBadge>
          </article>
        ))}
      </div>
      <button className="secondary-wide return-main" type="button" onClick={backActivity}>
        返回活动主页
      </button>
    </main>
  );
}

function ModalLayer({ modal, closeModal, openReward }) {
  if (!modal) return null;

  if (modal === 'rules') {
    return (
      <div className="modal-layer" role="dialog" aria-modal="true">
        <section className="modal-card">
          <h2>活动规则</h2>
          <ol>
            {rules.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <button className="activity-primary compact" type="button" onClick={closeModal}>我知道了</button>
        </section>
      </div>
    );
  }

  if (modal === 'example') {
    return (
      <div className="modal-layer" role="dialog" aria-modal="true">
        <section className="modal-card">
          <h2>上传截图示例</h2>
          <div className="example-visual">
            <strong>示例图<br />小红书发布页截图</strong>
            <p>需露出首图、笔记内容、话题、公开状态</p>
          </div>
          <ol>
            <li>不要上传手机相册里的单张海报图。</li>
            <li>截图需能看出这是已发布的小红书笔记页面。</li>
          </ol>
          <button className="activity-primary compact" type="button" onClick={closeModal}>我知道了</button>
        </section>
      </div>
    );
  }

  const isSeven = modal === 'reward7';
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="modal-card reward-modal">
        <h2>{isSeven ? '恭喜你累计打卡 7 天' : '恭喜完成 14 天打卡'}</h2>
        <div className={cx('reward-icon large', isSeven ? 'companion' : 'medal-reward')}>
          <RewardIllustration type={isSeven ? 'companion' : 'medal'} />
        </div>
        <p>{isSeven ? '第 1 份成长奖励已解锁，继续坚持可冲刺 14 天荣誉奖牌。' : '成长荣誉奖牌已解锁，限量先到先得。'}</p>
        <button className="activity-primary compact" type="button" onClick={() => openReward(isSeven ? 'sevenClaimed' : 'fourteenClaimed')}>去领取</button>
        <button className="secondary-wide" type="button" onClick={closeModal}>下次再说</button>
      </section>
    </div>
  );
}

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [screen, setScreen] = useState('builder');
  const [activityStatus, setActivityStatus] = useState('default');
  const [modal, setModal] = useState('');
  const [submissionLink, setSubmissionLink] = useState('https://www.xiaohongshu.com/...');
  const [screenshotUploaded, setScreenshotUploaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraFacing, setCameraFacing] = useState('environment');
  const [cameraError, setCameraError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const active = templates[activeIndex];
  const { cardRef, chromeRef } = usePosterAnimation(activeIndex, screen);

  useEffect(() => {
    templates.forEach((template) => {
      [template.bg, template.sample].forEach((src) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
      });
    });
  }, []);

  const go = (step) => {
    setActiveIndex((current) => (current + step + templates.length) % templates.length);
  };

  const attachStream = async (stream) => {
    if (!videoRef.current || !stream) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
    try {
      await videoRef.current.play();
    } catch {
      // Safari may require a tick after the video element mounts.
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraStatus('idle');
  };

  const requestCamera = async (nextFacing = cameraFacing, options = {}) => {
    const { silent = false } = options;

    if (!navigator.mediaDevices?.getUserMedia) {
      if (!silent) {
        setCameraError('当前浏览器不支持摄像头');
        setCameraStatus('blocked');
      }
      setCameraReady(false);
      return false;
    }

    if (streamRef.current && cameraReady && nextFacing === cameraFacing) {
      setCameraStatus('ready');
      await attachStream(streamRef.current);
      return true;
    }

    setCameraStatus('requesting');
    if (!silent) setCameraError('');
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1080 },
          height: { ideal: 1350 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraFacing(nextFacing);
      setCameraReady(true);
      setCameraStatus('ready');
      setCameraError('');
      await attachStream(stream);
      return true;
    } catch (error) {
      if (!silent) {
        setCameraError('无法访问摄像头，可先查看合成效果');
        setCameraStatus('blocked');
      } else {
        setCameraStatus('idle');
      }
      setCameraReady(false);
      return false;
    }
  };

  const startCamera = async () => {
    setScreen('camera');
    await requestCamera(cameraFacing);
  };

  const switchCamera = async () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    await requestCamera(nextFacing);
  };

  const openActivityHome = () => {
    stopCamera();
    setScreen('activity');
  };

  const openPosterHome = () => {
    setScreen('builder');
  };

  const openSharePoster = () => {
    stopCamera();
    setScreen('share');
  };

  const openPublish = () => {
    setScreen('publish');
  };

  const finishPublish = () => {
    setActivityStatus('upload');
    setScreenshotUploaded(false);
    setScreen('activity');
  };

  const submitReview = () => {
    setActivityStatus('reviewing');
    setScreen('activity');
  };

  const handleReward = (kind) => {
    if (kind === 'seven') {
      setModal('reward7');
      return;
    }
    if (kind === 'fourteen') {
      setModal('reward14');
      return;
    }
    if (kind === 'sevenClaimed') {
      setModal('');
      setActivityStatus('complete14');
      return;
    }
    if (kind === 'fourteenClaimed') {
      setModal('');
      return;
    }
  };

  const cancelCamera = () => {
    stopCamera();
    setScreen('builder');
  };

  const capturePoster = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = posterW;
    canvas.height = posterH;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    ctx.fillStyle = '#f7f1df';
    ctx.fillRect(0, 0, posterW, posterH);

    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      if (cameraFacing === 'user') {
        ctx.save();
        ctx.translate(posterW, 0);
        ctx.scale(-1, 1);
        drawCoverImage(ctx, video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, posterW, posterH);
        ctx.restore();
      } else {
        drawCoverImage(ctx, video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, posterW, posterH);
      }
    } else {
      const fallback = await loadImage(active.sample);
      drawCoverImage(ctx, fallback, 0, 0, fallback.width, fallback.height, 0, 0, posterW, posterH);
    }

    const templateImage = await loadImage(active.bg);
    ctx.drawImage(templateImage, 0, 0, posterW, posterH);

    const url = canvas.toDataURL('image/png');
    stopCamera();
    setResultUrl(url);
    setScreen('share');
  };

  const backHome = () => {
    setScreen('builder');
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (screen === 'camera' && streamRef.current) {
      attachStream(streamRef.current);
    }
  }, [screen, cameraReady, cameraFacing]);

  useEffect(() => {
    if (screen !== 'builder' || cameraReady || cameraStatus === 'requesting') return;
    let cancelled = false;

    const warmGrantedCamera = async () => {
      if (!navigator.permissions?.query || !navigator.mediaDevices?.getUserMedia) return;
      try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        if (!cancelled && permission.state === 'granted') {
          await requestCamera(cameraFacing, { silent: true });
        }
      } catch {
        // Not every mobile browser exposes camera permission status.
      }
    };

    warmGrantedCamera();
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const content = useMemo(() => {
    if (screen === 'activity') {
      return (
        <ActivityHomeScreen
          status={activityStatus}
          setStatus={setActivityStatus}
          openPosterHome={openPosterHome}
          openRules={() => setModal('rules')}
          openHistory={() => setScreen('history')}
          openExample={() => setModal('example')}
          openReward={handleReward}
          openSharePoster={openSharePoster}
          submitReview={submitReview}
          linkValue={submissionLink}
          onLinkChange={setSubmissionLink}
          uploaded={screenshotUploaded}
          setUploaded={setScreenshotUploaded}
        />
      );
    }

    if (screen === 'history') {
      return <HistoryScreen backActivity={openActivityHome} />;
    }

    if (screen === 'camera') {
      return (
        <CameraScreen
          template={active}
          videoRef={videoRef}
          cancelCamera={cancelCamera}
          capturePoster={capturePoster}
          switchCamera={switchCamera}
          cameraReady={cameraReady}
          cameraError={cameraError}
          cameraFacing={cameraFacing}
          cameraStatus={cameraStatus}
        />
      );
    }

    if (screen === 'share') {
      return (
        <SharePosterScreen
          resultUrl={resultUrl}
          template={active}
          backBuilder={backHome}
          openPublish={openPublish}
        />
      );
    }

    if (screen === 'publish') {
      return (
        <PublishScreen
          resultUrl={resultUrl}
          template={active}
          backShare={() => setScreen('share')}
          finishPublish={finishPublish}
        />
      );
    }

    return (
      <PosterBuilderScreen
        activeIndex={activeIndex}
        go={go}
        startCamera={startCamera}
        openActivityHome={openActivityHome}
        cardRef={cardRef}
        chromeRef={chromeRef}
      />
    );
  }, [screen, activityStatus, activeIndex, cameraReady, cameraError, resultUrl, cameraFacing, cameraStatus, submissionLink, screenshotUploaded]);

  return (
    <div className="phone-viewport">
      {content}
      <ModalLayer modal={modal} closeModal={() => setModal('')} openReward={handleReward} />
    </div>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

createRoot(document.getElementById('root')).render(<App />);
