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

## 图标

- 生成母版：`assets/app-icon-master.png`
- 浏览器和主屏图标：`intermotion/icons/`
- Web App 清单：`intermotion/site.webmanifest`

## 动画授权

动画使用 Blender Foundation 的《Caminandes 3: Llamigos》，来源为 Wikimedia Commons，许可为 Creative Commons Attribution 3.0 Unported。页面和导出画面中均保留了署名。

- 来源：https://commons.wikimedia.org/wiki/File:Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm
- 许可：https://creativecommons.org/licenses/by/3.0/
