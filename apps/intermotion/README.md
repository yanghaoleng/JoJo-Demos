# Intermotion 反应视频

打开页面后直接进入拍摄界面。用户点击一次「开始拍摄」完成声音解锁和摄像头、麦克风授权，页面随后播放动画并录制合成画面。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物直接写入仓库根目录的 `intermotion/`，不会清理原有的 MediaPipe 模型与 WASM 文件。公网入口为 `/intermotion/`。

## 关键参数

- 人像蒙版阈值：`0.55`
- 羽化范围上限：`3px`
- 抠图刷新间隔：`90ms`
- 录制画布：`1280 × 720`
- 人物描边：白色贴纸 / 彩虹跑马灯 / 橙色霓虹，双击或双击轻触人物切换

## 图标

- 生成母版：`assets/app-icon-master.png`
- 浏览器和主屏图标：`intermotion/icons/`
- Web App 清单：`intermotion/site.webmanifest`

## 视频素材

使用用户提供的录屏素材，已精确裁掉前 `24.000s`，并转换为浏览器兼容的 H.264/AAC MP4。输出保留完整画面比例，补齐为 `1280 × 720`，同时清除源文件元数据。
