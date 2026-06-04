# jujo-skills

> 叫叫 JOJO 设计系统的 AI Agent Skills 集合。
> 通过 [`npx skills add`](https://github.com/vercel-labs/skills) 一行命令安装到任意 IDE / Agent。

## Skills

| Skill | 命令 | 源文档 |
| --- | --- | --- |
| `jujo-ui-design-md` | `npx skills add pixel-point/jujo-skills --skill jujo-ui-design-md` | [`DESIGN.md`](./jujo-ui-design-md/SKILL.md) |
| `jujo-modular-style` | `npx skills add pixel-point/jujo-skills --skill jujo-modular-style` | [`JOJO_MODULAR_VISUAL_STYLE.md`](./jujo-modular-style/SKILL.md) |

## 安装前置

- Node.js 16+
- 任意 AI Agent（Claude Code / Qoder / Cursor / Codex / Cline 等）

## 一键安装

```bash
# 1. 安装 JOJO UI 完整设计规范
npx skills add pixel-point/jujo-skills --skill jujo-ui-design-md

# 2. 安装 JOJO 模块化视觉风格
npx skills add pixel-point/jujo-skills --skill jujo-modular-style
```

安装后会在项目中生成：

```text
.<agent>/skills/jujo-ui-design-md/SKILL.md
.<agent>/skills/jujo-modular-style/SKILL.md
```

`<agent>` 由 IDE 决定，常见值为 `.claude`、`.qoder`、`.codex`。

## 一句话给 AI 用

安装完成后，把下面这句话直接粘到任何 AI 对话开头：

> 我已通过 `npx skills add pixel-point/jujo-skills` 安装了 JOJO 设计系统的 skill，请按这些 skill 完成任务，**把规范视为硬性约束**，并在每段产出后用一句注释说明依据。

## 本仓库目录结构

```text
skills/
├── README.md                          ← 本文件
├── jujo-ui-design-md/
│   └── SKILL.md                       ← AI 调用的核心规范
└── jujo-modular-style/
    └── SKILL.md                       ← AI 调用的核心规范
```

## 发布到 GitHub

把这个目录 push 到你自己的 GitHub 仓库（推荐命名 `jujo-skills`），然后把上面命令里的 `pixel-point/jujo-skills` 替换成你的 `<username>/<repo>` 即可。

```bash
git init skills-publish
cd skills-publish
cp -R ../skills/. .
git add . && git commit -m "feat: initial skill publish"
gh repo create jujo-skills --public --source=. --remote=origin --push
# 或者手动：
# git remote add origin git@github.com:<your-username>/jujo-skills.git
# git push -u origin main
```

推送后任何人执行 `npx skills add <your-username>/jujo-skills --skill <name>` 即可一键安装。

## 验证

```bash
# 查看 skill 是否装上
ls -la .claude/skills/  # 或 .qoder/skills/ .codex/skills/

# 让 AI 跑一段规范自检
# "请按 jujo-ui-design-md skill 的违规检查清单自检当前项目"
```

## 维护原则

1. **技能是约束，不是建议** — 任何"可选"内容进 skill 之前先想清楚
2. **违规清单 = 验收门** — 每条规范都对应一个可勾选的检查项
3. **一句话提示词要可粘贴** — 不让用户改一个字
4. **每个 skill 必须有源文档** — `SKILL.md` 不超过 200 行（细枝末节回查源文档）

## License

Internal use by 叫叫 / JUDS team. 转载需保留作者署名。
