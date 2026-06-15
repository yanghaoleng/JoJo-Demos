# 交接记录

## 当前目标

完成手机 H5 阅读打卡活动前端；默认仍保留拍照生成分享海报 Demo，并从相机模板页补齐活动首页入口。

## 重要目录约定

- 后续新任务仍可从本目录 `/Users/jojo/VibeCoding/🎈小红书打卡分享` 发起，先读本文件续接上下文。
- POSTER 正式源码已整理到 `/Users/jojo/VibeCoding/📍JUDS/apps/poster`，以后实际改页面优先改这个目录。
- POSTER 线上静态目录是 `/Users/jojo/VibeCoding/📍JUDS/POSTER`，由正式源码运行 `npm run sync:host` 生成。
- `📍JUDS` 是 `jojodemos.mikeywa.icu` 宿主站，黑客松等旧页面属于宿主站，不要为改 POSTER 误改旧页面。

## 已完成

- 已读取 Figma 节点 `22:2638`，确认 `分享图模板` 下有 3 个模板实例。
- 已导出 3 张 Figma 模板预览图到 `public/templates/`，并将首页预览、拍照蒙层、最终合成统一改为使用 `figma-template-*.webp`。
- 已搭建 Vite + React + GSAP 项目。
- 已实现首页、拍照页、结果页三段流程。
- 已按最新要求改为仅保留左右箭头切换模板，已移除顶部切换标签、滑动缩略图和叠卡入口。
- 已实现摄像头获取、取消、拍照 Canvas 合成、保存图片、返回首页；合成逻辑为“摄像头/场景底图 + Figma 透明 WebP 模板”。
- 已补充 README、DESIGN、MAPPING 文档。
- 已通过 `npm run build`。
- 已用 Chrome DevTools 390×844 手机视口自动化验证：首页、叠卡、拍照页、结果页均可截图，生成图片为 PNG dataURL，未发现横向溢出。
- 已按最新要求复验首页：旧的标签/缩略图/叠卡入口数量为 0，仅保留 2 个左右箭头，点击右箭头可切到第二张模板。
- 已为 `/POSTER/` 子路径部署修正 Vite 资源路径，模板、场景图和 JS/CSS 资源会跟随 `BASE_URL`。
- 已部署到 Vercel 生产环境：https://jojodemos.mikeywa.icu/POSTER
- 部署版本：`dpl_CSfm1mcytct5hf88tXPYc3rka1Zu`，显式 alias 到 `jojodemos.mikeywa.icu`。
- 线上验证：`/POSTER`、JS、WebP 模板、根首页 `/`、`/Hackathon` 均返回 200；手机视口自动化跑通切模板、拍照、生成结果页，生成 PNG dataURL 长度约 74 万。
- 已将模板和 fallback 场景图转为 WebP，并在前端预加载 3 个模板和 3 个场景图；发布模板资源从约 12MB 降到约 448KB。
- 已确认线上资源请求中没有 `/templates/*.png`，所有模板/场景图请求均为 `image/webp`。
- 已将 H5 外层高度收紧到 9:16 安全区内，使用 `svh` 避免底部按钮被移动浏览器控件遮挡。
- 已新增相机预热逻辑：已授权时选模板页自动准备摄像头，未授权时主按钮提示用户点一下授权。
- 已新增拍照页前后摄像头翻转按钮，前置摄像头预览和合成图保持镜像一致。
- 已用 390×694 手机安全视口自动化验证：首页按钮底部约 54px、快门约 21px、保存按钮约 20px，流程可生成 PNG。
- 已重新部署紧凑布局和摄像头翻转版本；线上验证：首页按钮底部约 54px、快门约 21px、翻转约 33px、保存按钮约 20px，流程可生成 PNG。
- 已将 Favicon 改为生成式 WebP 图片：3D 简洁相机、背景上深蓝下浅蓝、镜头内圈黄色；`index.html` 使用 `%BASE_URL%favicon-32.webp`、`%BASE_URL%favicon.webp` 和 `%BASE_URL%apple-touch-icon.webp` 引用；512px 图标从约 275KB 压到约 11KB。
- 已将网页浏览器标题改为“小红书打卡相机”，并同步 README、DESIGN、MAPPING 文档。
- 已按要求只保留 `/POSTER` 标题修改，并将宿主站黑客松入口恢复为静态文件直出。
- 已部署最终修正版到 Vercel 生产环境：`dpl_3EE8ztjSPYqe9iQCPjPjmC5MaLjS`，并显式绑定 `jojodemos.mikeywa.icu`。
- 已复验线上 `/POSTER` 标题、JS/CSS/WebP 资源、`/`、`/DEMO/`、`/Hackathon`、`/hackathon`、`/DEMO/hackathon.html` 及黑客松关键资源均返回 200。
- 已部署 WebP Favicon 压缩版到 Vercel 生产环境：`dpl_CSfm1mcytct5hf88tXPYc3rka1Zu`，并显式绑定 `jojodemos.mikeywa.icu`。
- 已复验线上 `/POSTER/favicon.webp`、`/POSTER/favicon-32.webp`、`/POSTER/apple-touch-icon.webp` 均为 `image/webp` 200；旧 `/POSTER/favicon.png` 和 `/POSTER/favicon.svg` 返回 404。
- 已按原模板尺寸 `736×944` 新增 5 套阅读主题透明模板：阅读分钟、字数实验室、连读成就、故事路线、安静阅读。
- 已生成模板源稿和预览：`design/figma-import/reading-template-pack.svg`、`design/previews/reading-template-pack-preview.png`。
- 已将新增 5 套模板通过 Figma 桌面 App 粘贴导入到原 Figma 文件“市场-打卡分享活动”，并移动到原设计下方区域；Figma 中可见 `reading-template-04` 到 `reading-template-08` 图层。
- 已将首页预览改为“场景图 + 透明模板”叠合，拍照页和合成逻辑仍使用透明模板覆盖摄像头画面。
- 已将 Demo 模板列表扩展到 8 张，新增模板资源位于 `public/templates/reading-template-04.webp` 到 `reading-template-08.webp`，单张约 23-41KB。
- 已重新构建并部署到 Vercel 生产环境：`dpl_AfjJYx4fep6kP3h7EabktXV5byzk`，并显式绑定 `jojodemos.mikeywa.icu`。
- 已复验线上 `/POSTER` 200，新增 5 张 WebP 模板均为 `image/webp` 200，线上 JS 包含 `reading-template-04.webp` 到 `reading-template-08.webp`。
- 已复验宿主 `/` 与 `/Hackathon` 入口仍返回 200。
- 已把 POSTER 正式源码复制整理到 `📍JUDS/apps/poster`，并把当前构建产物同步到 `📍JUDS/POSTER`。
- 已在 `📍JUDS/apps/poster/package.json` 新增 `build:poster` 和 `sync:host`，后续从源码同步宿主静态目录更明确。
- 已新增完整活动首页 `ActivityHomeScreen`：阅读挑战 hero、连续打卡进度、今日任务、今日海报、打卡里程碑、继续打卡按钮。
- 已保持默认主页为当前相机模板页，并在右上角新增“回到首页”按钮进入活动首页。
- 已在活动首页顶部和“今日海报”卡片右下角新增小相机入口，均可返回当前相机模板页。
- 已将活动页底部“继续打卡”按钮接回当前相机模板页。
- 已新增活动页样式：暖米色背景、白色任务卡、黄色/橙色阅读强调、黑色胶囊按钮、圆形小相机按钮和内部滚动。
- 已通过 `npm run build`。
- 已用 Browser 390×844 移动视口验证：默认仍为相机模板页；“回到首页”进入活动首页；今日海报小相机、顶部小相机、“继续打卡”均可回相机模板页；滚动后里程碑和底部按钮可见。
- 本轮生成的视觉概念和 QA 截图保留在 `.codex-tmp/activity-home-concept.png`、`.codex-tmp/qa-activity-home-final.png`、`.codex-tmp/qa-activity-home-lower-final.png`。
- 已新增 `双击启动内网部署.command`，双击后自动构建并启动 `0.0.0.0` 的 Vite preview，打印本机和内网访问地址。
- 已验证启动文件：当 `5173` 被占用时自动改用 `5174`；`http://localhost:5174/` 和 `http://10.131.48.68:5174/` 均返回 200。
- 已新增 `REQUIREMENTS.MD`，按用户提供的 12 张原型屏梳理页面、字段、状态和验收点。
- 已按原型补齐前端状态流：制作海报、分享海报、发布小红书、上传截图/链接、审核中、7 天可领、14 天完成、历史、规则、截图示例和奖励弹窗。
- 已恢复默认入口为“制作海报”页，右上角“活动首页”可进入活动主页。
- 已用 imagegen 生成奖励/成长树方向图，保存到 `public/assets/reward-growth-icon-direction.png`。
- 已新增 SVG 图标系统：`RewardIllustration` 覆盖伴读权益和荣誉奖牌，`GrowthTreeIcon` + `GrowthStageStrip` 覆盖 14 阶成长树。
- 已将进度节点、奖励卡、奖励弹窗中的文字占位块替换为精致卡通图标，风格为轻金属、珐琅、半透明磨砂塑料。
- 已优化进度条与徽章层级：轨道线退到徽章后方，徽章增加白色托底，避免进度条盖住 7 天/14 天图标。
- 已为成长树主图和 14 个阶段小树苗增加呼吸帧动画；14 个阶段均有错峰动画，当前阶段更明显。
- 已补上“发文要求”点击打开活动规则弹窗。
- 已通过 `npm run build`；正式源码目录 `/Users/jojo/VibeCoding/📍JUDS/apps/poster` 同步后也已通过 `npm run build`。
- 已用 430px 手机宽度 headless 截图验证默认制作海报页、活动首页首屏图标布局；用浏览器 DOM 交互验证 7 天/14 天状态、奖励弹窗、规则弹窗和制作海报入口。
- 已同步本轮源码、文档、需求文档和图标方向图到 `/Users/jojo/VibeCoding/📍JUDS/apps/poster`。
- 已按部署流程执行 `git pull --ff-only`，结果为 Already up to date。
- 已提交并推送 poster 相关变更到 `main`：`cc9c5fc Deploy poster activity to lowercase route`。
- 已提交并推送部署文档记录到 `main`：`a7840bd Document poster production deployment`。
- 已提交并推送尾斜杠路由修复到 `main`：`0430407 Support poster trailing slash route`。
- 已部署到 Vercel 生产环境：`dpl_H1p8Lurc3MxgCWK4y3oxQkhPSjdw`，并手动 alias 到 `jojodemos.mikeywa.icu`。
- 已验证线上 `https://jojodemos.mikeywa.icu/poster` 与 `/poster/` 均返回 200；`/poster/assets/index-Bb15EQ3h.js`、`/poster/favicon-32.webp`、`/POSTER`、`/POSTER/` 均返回 200。
- 已复验宿主 `/`、`/Hackathon`、`/ququ` 均返回 200。

## 进行中

- 暂无。

## 待验证 / 注意

- 本地 `localhost` 下摄像头权限是否正常弹出。
- 真机保存图片入口在不同浏览器里可能表现不同，当前使用 `<a download>` 作为 Demo 保存方式。
- 启动文件只负责本机内网预览，不执行 git 拉取、推送或线上部署。
- `📍JUDS` 工作区仍有大量既有脏改和未跟踪文件；本次提交/推送/部署只限定 poster 相关文件，未清理或回滚其它改动。
