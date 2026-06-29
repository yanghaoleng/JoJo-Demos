# 元素映射

| 俗称 | 所属页面 | 变量 / 类名 | 说明 |
| --- | --- | --- | --- |
| 索引页弹窗 | `/DEMO/index.html` | `.note-layer`, `.note-stage`, `.note-paper` | 点击首页项目文件夹后打开的便签式模态弹窗 |
| 弹窗关闭按钮 | `/DEMO/index.html` | `.note-close`, `closeNote()` | 弹窗右上角关闭按钮，叉号由 CSS 伪元素绘制，不依赖图标字体 |
| 蛐蛐模拟器入口 | `/DEMO/index.html` | `PROJECTS.ququ.files[0].href`, `data-project="ququ"` | 索引页“蛐蛐模拟器”弹窗里的打开项目链接，当前指向 `https://ququ.mikeywa.icu/ding` |
| 黑客松活动页 | `/DEMO/hackathon.html` | `/Hackathon`, `/hackathon`, `vercel.json` rewrites | 叫叫线下 AI 黑客松活动页，线上短链由 Vercel rewrite 指向 HTML |
| 黑客松首页卡片 | `/DEMO/index.html` | `data-project="hackathon"` | 索引页中打开黑客松活动页的列表项 |
