# AI Typography Rules

## Purpose

适用于营销内容、网页内容、产品文档及书面表达。目标是提升可读性与专业感，优先遵循现代数字产品的排版习惯，而非传统出版排版。

## Output Level

自动识别场景：

* Marketing：活动页、广告文案、Landing Page、社交媒体内容；
* Web：官网、产品页、帮助中心、功能介绍（默认）；
* Document：PRD、设计方案、研究报告、长篇分析。

## Core Rules

### 行首禁则

以下字符不得出现在行首：

`，。；：！？）》】」』、`

错误：`今天发布新版本↵，欢迎体验`

正确：`今天发布新版本，↵欢迎体验`

### 行尾禁则

以下字符不得出现在行尾：

`（《【「『`

错误：`今天阅读《↵三体》`

正确：`今天阅读↵《三体》`

### 避免单字成行

避免单个汉字、单个词语或短单位独立占据一行。

错误：`这是一个重要的设计原↵则`

正确：`这是一个重要的↵设计原则`

### 避免孤行（Widow）

避免段落最后仅剩一行独立悬挂。

### 避免寡行（Orphan）

避免段落首行单独留在上一页、上一屏或上一段布局区域。

## Paragraph Rules

* 一个段落表达一个核心观点；
* Marketing：建议 1–3 行；
* Web：建议 3–5 行；
* Document：建议 4–8 行；
* 超过 8 行应考虑拆分。

## Chinese-English Spacing

中文与英文之间保留空格。

正确：`支持 ChatGPT 与 Claude。`

错误：`支持ChatGPT与Claude。`

正确：`使用 Figma 完成设计。`

错误：`使用Figma完成设计。`

## Number Spacing

数字与中文单位之间保留适当间距。

正确：`预计耗时 30 分钟。`

正确：`售价 299 元。`

错误：`预计耗时30分钟。`

错误：`售价299元。`

## English Naming

保持官方拼写，不得自行变形：

`ChatGPT`、`OpenAI`、`Claude`、`Gemini`、`GitHub`、`Figma`、`Notion`、`Linear`、`Vercel`、`Supabase`、`iPhone`、`iPad`、`macOS`、`iOS`。

禁止：

`chatgpt`、`github`、`iphone`、`figma`。

## Default Behavior

未指定时默认采用 Web 级别排版。

优先级：

1. 行首禁则；
2. 行尾禁则；
3. 避免单字成行；
4. 避免孤行与寡行；
5. 中英文间距；
6. 数字与单位间距；
7. 官方英文拼写。

参考风格：

Apple、Notion、Linear、Stripe。
