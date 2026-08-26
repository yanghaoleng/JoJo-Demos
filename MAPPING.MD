# 元素映射

| 俗称 | 所属页面 | 变量 / 类名 | 说明 |
| --- | --- | --- | --- |
| 索引页弹窗 | `/DEMO/index.html` | `.note-layer`, `.note-stage`, `.note-paper` | 点击首页项目文件夹后打开的便签式模态弹窗 |
| 弹窗关闭按钮 | `/DEMO/index.html` | `.note-close`, `closeNote()` | 弹窗右上角关闭按钮，叉号由 CSS 伪元素绘制，不依赖图标字体 |
| 蛐蛐模拟器入口 | `/DEMO/index.html` | `PROJECTS.ququ.files[0].href`, `data-project="ququ"` | 索引页“蛐蛐模拟器”弹窗里的打开项目链接，当前指向 `https://ququ.mikeywa.icu/ding` |
| 黑客松活动页 | `/DEMO/hackathon.html` | `/Hackathon`, `/hackathon`, `vercel.json` rewrites | 叫叫线下 AI 黑客松活动页，线上短链由 Vercel rewrite 指向 HTML |
| 黑客松首页卡片 | `/DEMO/index.html` | `data-project="hackathon"` | 索引页中打开黑客松活动页的列表项 |
| 索引页文件夹 | `/DEMO/index.html` | `.folder-visual`, `.folder-back`, `.folder-front` | 一体成形的项目文件夹；后盖为 SVG 轮廓，前盖负责磨砂与展开动效 |
| 文件夹缩略图 | `/DEMO/index.html` | `.folder-paper`, `.folder-shot`, `.folder-preview` | 文件夹内部的 3 张项目截图，hover / focus 时扇形展开 |
| 文件夹内部图标 | `/DEMO/index.html` | `.folder-favicon` | 收在文件夹内部最右侧的项目 favicon，不再放置在文件夹外部 |
| 家长报告时间点 | `/report/` | `.stage-tab` / `stageKey` | 每日、周日夜、每月、阶段四个时间节点 |
| 家长报告触达方式 | `/report/` | `.channel-tabs` / `channelKey` | 产品小程序消息或班主任、指导师班班消息 |
| 阶段报告正文 | `/report/` | `.report-cover` / `.report-scroll` | 点击封面进入可上下浏览的报告正文 |
