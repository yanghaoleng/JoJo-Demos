# JOCAM

「我和叫叫合拍」手机端相机 Demo，正式路径为 `https://mikeywa.site/jocam/`。

## 功能

- 摄像头画面作为 Rive 透明区域的背景。
- MediaPipe 人像分割层实时绘制在叫叫前方。
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

构建产物输出到仓库根目录的 `jocam/`，资源基路径固定为 `/jocam/`。

Rive 源文件来自 `https://rive.mikeywa.site/mBK`，入库文件的 SHA-256 为 `203a6f992698be770a4b49fb42f2632f095cef22490fa426bf933ed37c929233`。
