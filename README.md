# JUDS - JOJO UI Design System

这是一个用于打磨 JOJO 产品设计语言工程标准化的项目。项目会通过制作各种 demo，持续测试品牌视觉、组件状态、动效反馈、响应式布局和工程复用方式。

## 项目内容

| 路径 | 说明 |
| --- | --- |
| `DESIGN.md` | JOJO 主设计规范，包含品牌、色彩、字体、组件、动效和验收标准 |
| `Design-mikey.MD` | 动效、状态机和交互反馈参考文档 |
| `DEMO/` | 叫叫产品流程、品牌官网、学习评估等 demo |
| `DEMO-top/` | 产品落地页方向 demo |
| `skills/` | 课中 UI 与模块化视觉规范 skill |
| `design/` | 叫叫 App 模块化视觉风格文档 |
| `assets/` | 品牌 logo、字体、icon、情感化形象等设计资产 |
| `叫叫UI与品牌手册.pdf` | 原始品牌与 UI 手册 |

## 当前 Demo

| Demo | 文件 |
| --- | --- |
| 学习流程导航 | `DEMO/index.html` |
| 登录页 | `DEMO/login.html` |
| 学科选择 | `DEMO/subjects.html` |
| 学习评估 | `DEMO/assessment.html` |
| 评估报告 | `DEMO/report.html` |
| 课前准备 | `DEMO/waiting.html` |
| 叫叫 APP 官网页 | `DEMO/jiaojiao.html` |
| 绿豆 APP 官网页 | `DEMO/lvdou.html` |
| 成长内容 Web App | `DEMO/app.html` |
| 模块化题型 Demo | `DEMO/modular-standard-question.html` |
| 家长成长沟通 | `report/index.html` |
| 家长成长沟通（Figma 实图版） | `report-codex/index.html` |

## 使用方式

直接在浏览器打开对应 HTML 文件即可预览。设计和开发迭代时，优先对照 `DESIGN.md` 检查 token、动效、状态和验收标准。

## 索引页架构

`DEMO/index.html` 是作品索引页。每个项目使用连续 SVG 轮廓的文件夹呈现，文件夹内部依次放置 3 张项目缩略图和 1 个 favicon；点击文件夹后通过便签式弹窗展示入口链接。

## 设计目标

1. 让 JOJO 的品牌表达在不同页面中保持一致。
2. 把颜色、字体、圆角、间距、动效沉淀为可复用规范。
3. 用 demo 验证规范是否能落到真实界面和交互状态。
4. 同时兼顾孩子视角的趣味和家长视角的专业可信。

## 家长成长沟通 Demo

`/report/` 是纯静态单页演示：用每日、周日晚上、每月、约半年四个时间节点，以及产品消息和班班消息两种触达方式，说明如何让家长感受到孩子的学习结果。无 API、无用户数据采集。

`/report-codex/` 为独立重建版本，逐步演示 Figma 原稿中的入口、公众号/班班/指导师触达、阶段报封面和报告详情。每日、每月、阶段详情均为可向上滑动的信息流；截图和关键内容均来自 Figma 原稿。无 API、无用户数据采集。
