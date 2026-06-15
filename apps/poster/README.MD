# 小红书打卡相机

## 产品目标

做一个手机 H5 尺寸的阅读打卡活动前端：默认入口仍是制作海报/相机链路，可切换 8 个模板、拍照生成可保存 PNG；同时补齐活动首页、发布、审核、领奖、历史和规则等完整活动原型流程。

线上地址：https://jojodemos.mikeywa.icu/POSTER

最新本地更新：2026-06-13，已按活动原型补齐前端状态流，并新增成长树、伴读权益、荣誉奖牌的精致卡通图标。未执行线上部署。

## 目录职责

- 任务入口：本目录 `/Users/jojo/VibeCoding/🎈小红书打卡分享`，后续新需求从这里读 `HANDOF.MD`。
- 正式源码：`/Users/jojo/VibeCoding/📍JUDS/apps/poster`，以后实际改 POSTER 页面优先改这里。
- 静态发布：`/Users/jojo/VibeCoding/📍JUDS/POSTER`，由正式源码构建同步，供 `jojodemos.mikeywa.icu/POSTER` 访问。
- 宿主站：`/Users/jojo/VibeCoding/📍JUDS`，保留 JOJO Demos、黑客松等页面。

## 本地内网启动

双击 `双击启动内网部署.command` 可在本机启动内网可访问的生产预览：

1. 自动进入项目目录。
2. 缺少 `node_modules` 时自动执行 `npm install`。
3. 自动执行 `npm run build`。
4. 默认使用 `5173` 端口；如果被占用，会自动尝试 `5174`、`5175` 等后续端口。
5. 使用 `0.0.0.0` 启动 Vite preview，并打印本机和内网访问地址。

启动后保持终端窗口打开；停止服务时在窗口按 `Control + C`。

## 核心功能

1. 默认首页展示“制作海报”页，右上角“活动首页”进入完整活动主页。
2. 活动首页覆盖默认、待上传、审核中、7 天可领、14 天完成等状态。
3. 活动首页展示活动 hero、14 阶成长树、累计进度、7 天伴读权益、14 天荣誉奖牌、今日打卡任务、历史记录和状态预览。
4. “发文要求”“规则”“截图示例”“7 天奖励”“14 天奖励”均有对应弹窗。
5. 制作海报页可用左右箭头切换 8 个海报模板：3 个 Figma 原模板 + 5 个新增阅读指标模板。
6. 拍照页展示模板蒙层，下方透明区域透出摄像头画面。
7. 拍照后进入分享海报页，可保存海报并进入小红书发布模拟页。
8. 发布后回到活动首页待上传态，可上传截图、填写链接并提交审核。
9. 审核、领奖、历史记录均为纯前端模拟状态，方便验收全流程。

## API

当前 Demo 无后端 API。

使用浏览器能力：

- `navigator.mediaDevices.getUserMedia`：打开手机摄像头，支持前后摄像头切换。
- `navigator.permissions.query({ name: 'camera' })`：已授权时在选模板页自动预热相机；未授权时通过按钮文案引导用户点一下。
- `canvas.toDataURL('image/png')`：生成可保存图片。

## 关键技术架构

- Vite + React：活动首页、模板切换、相机流程和结果页状态。
- GSAP：页面、模板、控件入场与切换动效。
- Canvas：把相机画面和模板信息合成为海报 PNG。
- 活动原型：`ActivityHomeScreen`、`PosterBuilderScreen`、`SharePosterScreen`、`PublishScreen`、`HistoryScreen` 和 `ModalLayer` 覆盖原型主要页面。
- 活动状态：`activityStateConfig` 管理默认、待上传、审核中、7 天可领、14 天完成；`prototypeStates` 提供前端状态预览。
- 图标资产：`RewardIllustration` 生成伴读权益和荣誉奖牌 SVG；`GrowthTreeIcon` + `GrowthStageStrip` 生成 14 阶成长树。生成式方向图保存在 `public/assets/reward-growth-icon-direction.png`。
- CSS `svh` + 9:16 高度上限：避免底部按钮被移动浏览器控件遮住。
- WebP Favicon：3D 简洁相机图标，含上深下浅蓝色渐变背景和黄色镜头内圈，放在 `public/favicon-32.webp` / `public/favicon.webp` / `public/apple-touch-icon.webp`；512px 图标约 11KB。
- Figma：原 3 个模板来自 Figma；新增 5 个阅读主题模板已作为一组导入到同一 Figma 文件，并保留导入源 `design/figma-import/reading-template-pack.svg`。
- 模板生成脚本：`scripts/generate_reading_templates.py` 生成新增模板透明 WebP、Figma 导入 SVG 和预览图。
- WebP 模板资源：新增模板为 `public/templates/reading-template-04.webp` 到 `reading-template-08.webp`，单张约 23-41KB。
- Vercel：部署到 `jojodemos.mikeywa.icu/POSTER`，构建时使用 `--base=/POSTER/`。
- 本地内网部署：`双击启动内网部署.command` 构建后用 `npx vite preview --host 0.0.0.0` 启动。
- 网页标题：`index.html` 中设置为“小红书打卡相机”。
