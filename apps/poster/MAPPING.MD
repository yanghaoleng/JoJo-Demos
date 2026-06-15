# 元素映射

| 俗称 | 所属页面 | 变量 / 类名 | 说明 |
| --- | --- | --- | --- |
| 制作海报页 | 默认入口 | `PosterBuilderScreen`, `screen='builder'` | 项目默认首页，右上角进入活动首页 |
| 活动首页按钮 | 制作海报页 | `.rules-button`, `openActivityHome()` | 顶栏“活动首页”，从制作海报页进入活动主页 |
| 活动主页 | 活动页 | `ActivityHomeScreen`, `.activity-screen` | 原型图的活动首页，承载进度、奖励、今日任务、历史入口 |
| 活动状态 | 活动页 | `activityStateConfig`, `activityStatus` | 默认、待上传、审核中、7 天可领、14 天完成 |
| 状态预览 | 活动页 | `PrototypeSwitcher`, `prototypeStates` | 前端验收用状态切换，不接后端 |
| 成长值小树 | 活动页 Hero | `GrowthTreeIcon`, `.growth-tree-icon` | 当前成长阶段主图，支持 1-14 阶 |
| 14 阶成长条 | 活动页 Hero | `GrowthStageStrip`, `.growth-stage-strip` | 展示 14 个成长阶段，1/7/14 为大节点 |
| 伴读权益图标 | 奖励卡 / 进度 / 弹窗 | `RewardIllustration type="companion"` | 打开书 + 磨砂玻璃徽章 |
| 荣誉奖牌图标 | 奖励卡 / 进度 / 弹窗 | `RewardIllustration type="medal"` | 金属奖牌 + 珐琅叶片 |
| 发文要求 | 今日任务 | `.requirement-row`, `openRules()` | 点击打开活动规则弹窗 |
| 上传截图 | 待上传状态 | `UploadPanel`, `.upload-zone` | 点击模拟已上传截图 |
| 截图示例 | 待上传状态 | `.example-tile`, `openExample()` | 点击打开截图示例弹窗 |
| 分享海报页 | 生成后 | `SharePosterScreen` | 保存海报并进入小红书发布模拟 |
| 发布小红书页 | 发布模拟 | `PublishScreen` | 展示首图、文案、话题并发布回活动页 |
| 打卡历史 | 历史页 | `HistoryScreen`, `historyRecords` | 展示提交时间和审核状态 |
| 图标方向图 | 视觉资产 | `public/assets/reward-growth-icon-direction.png` | imagegen 生成的奖励/成长树方向图，作为视觉参考 |
| 箭头切换 | 首页 | `.arrow-row`, `.round-control`, `go()` | 唯一的模板切换方式，用左右圆形箭头切换 |
| 当前模板 | 全局 | `activeIndex`, `active` | 当前选择的模板数据 |
| 模板数据 | 全局 | `templates` | 8 个模板 WebP：3 个原 Figma 模板 + 5 个新增阅读模板 |
| 新增阅读模板 | 全局 / Figma | `reading-template-04.webp` 到 `reading-template-08.webp`, `design/figma-import/reading-template-pack.svg` | 阅读分钟、字数实验室、连读成就、故事路线、安静阅读 |
| 模板预览照片 | 首页 | `.poster-card-photo` | 在首页模板卡片底层展示 fallback 场景图 |
| 模板预览蒙层 | 首页 | `.poster-card-template` | 在首页模板卡片上层展示透明模板 WebP |
| 回到首页 | 制作海报页 | `.rules-button`, `openActivityHome()` | 顶栏“活动首页”，从默认制作海报页进入活动首页 |
| 活动首页 | 活动页 | `ActivityHomeScreen`, `.activity-screen` | 阅读打卡挑战首页，在手机框内滚动 |
| 活动首页顶部相机 | 活动页 | `.mini-camera-button`, `openPosterHome()` | 顶部黑色圆形小相机，返回当前相机模板页 |
| 活动首页进度卡 | 活动页 | `.progress-panel`, `.progress-metric`, `.progress-ring` | 展示连续天数、今日分钟和黄色进度环 |
| 今日任务 | 活动页 | `activityTasks`, `.task-panel`, `.task-row` | 阅读、拍海报、分享小红书三项任务 |
| 今日海报 | 活动页 | `.poster-panel`, `.activity-poster-card` | 活动首页里的海报入口卡 |
| 海报小相机 | 活动页 | `.poster-camera-button`, `openPosterHome()` | 今日海报卡右下角小相机图标，点击回当前相机模板页 |
| 打卡里程碑 | 活动页 | `milestones`, `.milestone-panel`, `.milestone-item` | 连续 3 / 7 / 14 天奖励节点 |
| 继续打卡 | 活动页 | `.activity-primary`, `openPosterHome()` | 活动页底部主按钮，返回当前相机模板页 |
| 开始拍照按钮 | 首页 | `.primary-action`, `startCamera()` | 进入拍照页并请求摄像头 |
| 相机预热 | 首页 / 全局 | `cameraStatus`, `requestCamera()` | 已授权时自动预热，未授权时引导用户点击 |
| 摄像头画面 | 拍照页 | `videoRef`, `.camera-video` | `getUserMedia` 获取的视频流 |
| 翻转摄像头 | 拍照页 | `.icon-action`, `switchCamera()`, `cameraFacing` | 在前置和后置摄像头之间切换 |
| 模板蒙层 | 拍照页 | `CameraOverlay`, `.camera-template` | 覆盖在摄像头前的信息层 |
| 快门键 | 拍照页 | `.shutter`, `capturePoster()` | 拍照并合成 PNG |
| 取消按钮 | 拍照页 | `.ghost-action`, `cancelCamera()` | 关闭摄像头并回首页 |
| 生成海报 | 结果页 | `resultUrl`, `.result-image` | Canvas 合成后的图片 |
| 保存图片按钮 | 结果页 | `.save-link` | 下载生成的 PNG |
| 返回按钮 | 结果页 | `.back-button`, `backHome()` | 清空结果并回首页 |
| 网站图标 | 浏览器标签 | `public/favicon-32.webp`, `public/favicon.webp`, `public/apple-touch-icon.webp`, `index.html` | 3D 蓝色渐变相机 WebP Favicon |
| 网页标题 | 浏览器标签 | `index.html` `<title>` | 当前为“小红书打卡相机” |
| 线上入口 | Vercel | `/poster`, `/POSTER` | 主入口为 `jojodemos.mikeywa.icu/poster`；旧 `/POSTER` 兼容 |
| 小写路由转发 | Vercel | `vercel.json` `/poster`, `/poster/:path*` | 将小写入口和资源转发到 `/POSTER` 静态目录 |
| 宿主旧入口 | Vercel | `/Hackathon`, `/hackathon`, `/DEMO/hackathon.html` | 保持黑客松页面原状，不属于本小相机页面 |
| 任务入口 | 本地控制台 | `/Users/jojo/VibeCoding/🎈小红书打卡分享/HANDOF.MD` | 后续需求仍从这里续接 |
| 正式源码 | 宿主站源码 | `/Users/jojo/VibeCoding/📍JUDS/apps/poster` | 以后实际修改 POSTER 页面优先改这里 |
| 静态发布目录 | 宿主站静态文件 | `/Users/jojo/VibeCoding/📍JUDS/POSTER` | 由正式源码构建同步后随宿主站部署 |
| 双击内网部署 | 本地启动文件 | `双击启动内网部署.command` | 双击后自动构建并用 `0.0.0.0` 启动 Vite preview，打印内网访问地址 |
