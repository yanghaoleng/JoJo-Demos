# JOCAM

「我和叫叫合拍」手机端相机 Demo，正式路径为 `https://mikeywa.site/jocam/`。

## 功能

- 摄像头画面作为 Rive 透明区域的背景。
- MediaPipe 人像分割层可在叫叫前后切换，拍照和录像都使用当前图层顺序。
- 叫叫按 Rive 画布左下角锚定，高度上限为原尺寸的 51.2%；每次切换动作都会自动检测透明边界，完整显示后将最左可见内容贴齐窗口。以 `Start_Dial` 开始，每秒从筛选后的 `TalkingEmotion` 时间轴中随机切换。
- 每次进入页面时随机生成 1-520 的阅读天数，平时和录像期间保持不变；点击顶部字幕可切换两种文案并重新随机数值。
- 第二种「坚持连续学习叫叫阅读」字幕使用红色大号数字和白色描边。
- 支持竖屏 `720×1280` 和横屏 `1280×720` 成片；选择横屏时整个相机界面旋转 90° 并铺满视口，叫叫保持左对齐。
- 轻点快门拍照，长按快门录像，最长 15 秒。
- 成片自带「我和叫叫一起阅读的第 xx 天」字幕。
- 叫叫、Rive 运行时和人像模型均为同源静态资源，并显示真实加载进度。
- 相机帧仅在用户设备上合成，不上传。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到仓库根目录的 `jocam/`。正式构建默认从 `https://rive.mikeywa.site/jocam/` 直连加载大体积资源，让最终页面仍保持在 `https://mikeywa.site/jocam/`，也不会把叫叫和人像模型绕回旧服务器。可以用 `JOCAM_ASSET_BASE` 覆盖该资源基地址。

Rive 源文件来自 `https://rive.mikeywa.site/mBK`，入库文件的 SHA-256 为 `203a6f992698be770a4b49fb42f2632f095cef22490fa426bf933ed37c929233`。

`deploy/nginx-rive-jocam.conf` 让大体积资源从腾讯云源站直连加载；`deploy/nginx-mikeywa-jocam.conf` 只负责在主站保留 `/jocam/` 入口。两份片段分别由 `rive.mikeywa.site` 和 `mikeywa.site` 的 HTTPS server 块引用。
