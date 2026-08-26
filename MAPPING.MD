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
| 页首叫叫标志旗 | `/report-codex/` | `.brand-logo`, `.brand-name` | 小尺寸公司 Logo，后接“家长成长沟通 Demo” |
| Figma 实图版时间点 | `/report-codex/` | `.time-btn` / `data-stage` | 每周学情预告、日学情反馈、主题月学情反馈、阶段学情反馈四个节点 |
| 时间轴虚线 | `/report-codex/` | `.timeline::before` | 桌面端连接四个圆心并在阶段节点终止，手机端隐藏 |
| Figma 实图版步骤 | `/report-codex/` | `.step` / `data-step` | 触达与报告步骤胶囊，可直接跳转 |
| 双页并排区 | `/report-codex/` | `.paired-pages`, `.page-card` | 日报双图触达、阶段封面与完整报告的并排容器 |
| 手机横向滑动内栏 | `/report-codex/` | `.paired-pages` 移动端样式 | 限定在全窗口背景中滚动，并用滚动层内边距保留卡片投影 |
| 页面底部大字 | `/report-codex/` | `.page-title` | 每张原稿图下方唯一保留的说明标题 |
| 原稿整图热区 | `/report-codex/` | `.shot-button` / `data-next` | 整张原稿图片可点击，点击后进入下一演示步骤 |
| 报告长信息流 | `/report-codex/` | `.report-phone` / `.report-scroll` | 日报、月报、阶段报的手机尺寸纵向滚动容器 |
| 流程图片预加载 | `/report-codex/` | `link[rel="preload"][as="image"]` | 首屏提前加载后续流程使用的全部 WebP 图片 |
| 课程预告窗口 | `/report-codex/` | `.course-frame` | 直接载入 `assets/course-preview.html` 的滚动窗口 |
| 课程预告水印图 | `/report-codex/` | `.hero-art` | 课程插画在首屏右侧以低透明度、无边框方式作为水印纹理 |
| 阶段报告手机框 | `/report-codex/` | `.stage-pair .report-phone` | 与封面比例一致的细黑手机框，封面使用 `object-fit: cover` 铺满 |
