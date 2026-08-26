---
name: skill-router
description: 35+ Skill 能力地图与路由中枢。AI 执行任务时按需加载对应 skill，避免盲目搜索。当用户问"该用哪个 skill"、"有没有 XX skill"、或涉及特定领域（React Native/Expo/前端/FSD/测试/代码审查/AI/RAG）时，第一动作读此文件。
disable-model-invocation: true
---

# Skill Router — 35+ Skill 能力地图

## 快速决策树

```
用户请求 → 判断领域 → 命中 Skill

领域判断：
├── RN / Expo 开发      → § A React Native & Expo
│                            （先读 expo-overview 再路由到具体 expo-* skill）
├── 前端 / UI / 样式    → § B 前端 & UI
├── FSD 架构            → § C 架构 & 设计模式
├── 测试                → § D 测试 & 质量
├── AI / LLM / RAG      → § E AI & LLM
├── 代码审查            → § F 代码审查 & Git
├── 学习 & 进度         → § G 学习 & 知识管理
└── Cursor 工具         → § H Cursor 工具 & 自动化
```

---

## A. React Native & Expo

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **wifi-camera-app-conventions** | `.cursor/skills/wifi-camera-app-conventions/SKILL.md` | 本项目开发规范、UI theme、组件、状态管理 |
| **expo-native-ui** | 待安装 | UI 组件、icons、media、storage、visual effects |
| **react-native-best-practices** | 待安装 | SVG 图表、动画、手势、Reanimated |
| **react-native-testing** | 待安装 | Jest、Testing Library、RN 测试 |
| **feature-sliced-design** | 待安装 | FSD 架构、模块划分 |
| **react-native-mmkv** | 待安装 | MMKV v4、Nitro Modules |
| **tanstack-form** | 待安装 | TanStack Form + Zod 表单 |

---

## B. 前端 & UI

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **pretty-ui** | `~/.cursor/skills/pretty-ui/SKILL.md` | 美化 UI、统一风格、Tailwind、卡片、按钮、表单 |
| **tailwind** | — | Tailwind CSS、样式、响应式 |

---

## C. 架构 & 设计模式

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **feature-first** | `~/.cursor/skills/feature-first/SKILL.md` | FSD 迁移、架构升级、代码组织 |
| **feature-sliced-design** | 待安装 | FSD v2.1、feature 模块 |

---

## D. 测试 & 质量

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **react-native-testing** | 待安装 | React Native 测试、Jest、Testing Library |
| **diagnosing-bugs** | `~/.cursor/skills/diagnosing-bugs/SKILL.md` | Bug 诊断、错误排查、性能问题 |

---

## E. AI & LLM

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **learning-progress-tracker** | `~/.cursor/skills/learning-progress-tracker/SKILL.md` | 学习进度、知识地图、笔记 |
| **langchain-rag** | `~/.cursor/skills/langchain-rag/SKILL.md` | RAG、向量数据库、embedding |
| **dive-into-langgraph** | `~/.cursor/skills/dive-into-langgraph/SKILL.md` | LangGraph、Agent 编排、ReAct |
| **langchain-architecture** | `~/.cursor/skills/langchain-architecture/SKILL.md` | LangChain 架构、应用设计 |
| **llm-streaming-response-handler** | `~/.cursor/skills/llm-streaming-response-handler/SKILL.md` | SSE、流式响应、实时 token |

---

## F. 代码审查 & Git

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **git-commit-assistant** | `~/.cursor/skills/git-commit-assistant/SKILL.md` | 提交、commit、push、PR |
| **review-bugbot** | `~/.cursor/skills-cursor/review-bugbot/SKILL.md` | Bug 复现、bug review |
| **review-security** | `~/.cursor/skills-cursor/review-security/SKILL.md` | 安全审查、漏洞检测 |
| **babysit** | `~/.cursor/skills-cursor/babysit/SKILL.md` | PR merge、CI、comments |

---

## G. 学习 & 知识管理

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **ai-learning-mentor** | `~/.cursor/agents/ai-learning-mentor.md` | 学习导师、AI 概念、苏格拉底提问 |
| **dev-to-doc-recap** | `~/.cursor/skills/dev-to-doc-recap/SKILL.md` | PR 复现、知识笔记、总结实现 |
| **learning-progress-tracker** | `~/.cursor/skills/learning-progress-tracker/SKILL.md` | 学习进度、路线图、详细笔记 |

---

## H. Cursor 工具 & 自动化

| Skill | 路径 | 触发词 |
|-------|------|--------|
| **create-skill** | `~/.cursor/skills-cursor/create-skill/SKILL.md` | 创建 skill、安装 skill |
| **create-rule** | `~/.cursor/skills-cursor/create-rule/SKILL.md` | 创建规则、AGENTS.md |
| **create-hook** | `~/.cursor/skills-cursor/create-hook/SKILL.md` | 创建 hook、hooks.json |
| **automate** | `~/.cursor/skills-cursor/automate/SKILL.md` | Cursor 自动化 |
| **sdk** | `~/.cursor/skills-cursor/sdk/SKILL.md` | Cursor SDK、@cursor/sdk |
| **statusline** | `~/.cursor/skills-cursor/statusline/SKILL.md` | 状态栏、CLI 定制 |
| **loop** | `~/.cursor/skills-cursor/loop/SKILL.md` | 定时循环、间隔任务 |
| **split-to-prs** | `~/.cursor/skills-cursor/split-to-prs/SKILL.md` | PR 拆分 |

---

## 调用规则

1. **按需读取**：不确定该读哪个 skill 时，先读本文件
2. **命中后读具体 skill**：一次任务 ≤ 3 个 skill
3. **不要一次读全部 skill**：context 宝贵
4. **路由格式**：`→ § A` 表示跳转到本文件的 A 节

---

## Skill 安装状态

### Expo / RN Skills（`.cursor/skills/`）

| Skill | 状态 | 路径 |
|-------|------|------|
| expo-overview | ✅ 已安装 | `.cursor/skills/` |
| expo-router | ✅ 已安装 | `.cursor/skills/` |
| expo-native-ui | ✅ 已安装 | `.cursor/skills/` |
| expo-ui | ✅ 已安装 | `.cursor/skills/` |
| expo-animation | ✅ 已安装 | `.cursor/skills/` |
| expo-design-system | ✅ 已安装 | `.cursor/skills/` |
| expo-data-fetching | ✅ 已安装 | `.cursor/skills/` |
| expo-tailwind-setup | ✅ 已安装 | `.cursor/skills/` |
| expo-dev-client | ✅ 已安装 | `.cursor/skills/` |
| expo-module | ✅ 已安装 | `.cursor/skills/` |
| expo-brownfield | ✅ 已安装 | `.cursor/skills/` |
| expo-app-clip | ✅ 已安装 | `.cursor/skills/` |
| expo-dom | ✅ 已安装 | `.cursor/skills/` |
| expo-web-to-native | ✅ 已安装 | `.cursor/skills/` |
| expo-project-structure | ✅ 已安装 | `.cursor/skills/` |
| expo-examples | ✅ 已安装 | `.cursor/skills/` |
| expo-upgrade | ✅ 已安装 | `.cursor/skills/` |
| expo-skill-eval | ✅ 已安装 | `.cursor/skills/` |
| expo-skill-feedback | ✅ 已安装 | `.cursor/skills/` |
| expo-migrate-module | ✅ 已安装 | `.cursor/skills/` |
| eas-app-stores | ✅ 已安装 | `.cursor/skills/` |
| eas-hosting | ✅ 已安装 | `.cursor/skills/` |
| eas-workflows | ✅ 已安装 | `.cursor/skills/` |
| eas-simulator | ✅ 已安装 | `.cursor/skills/` |
| eas-update-insights | ✅ 已安装 | `.cursor/skills/` |
| eas-observe | ✅ 已安装 | `.cursor/skills/` |

### 本项目 / 全局 Skills

| Skill | 状态 | 路径 |
|-------|------|------|
| wifi-camera-app-conventions | ✅ 已安装 | `.cursor/skills/` |
| pretty-ui | ✅ 已安装 | `~/.cursor/skills/` |
| diagnosing-bugs | ✅ 已安装 | `~/.cursor/skills/` |
| learning-progress-tracker | ✅ 已安装 | `~/.cursor/skills/` |
| langchain-rag | ✅ 已安装 | `~/.cursor/skills/` |
| dive-into-langgraph | ✅ 已安装 | `~/.cursor/skills/` |
| langchain-architecture | ✅ 已安装 | `~/.cursor/skills/` |
| llm-streaming-response-handler | ✅ 已安装 | `~/.cursor/skills/` |
| git-commit-assistant | ✅ 已安装 | `~/.cursor/skills/` |
| review-bugbot | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| review-security | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| babysit | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| create-skill | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| create-rule | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| create-hook | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| automate | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| sdk | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| statusline | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| loop | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| split-to-prs | ✅ 已安装 | `~/.cursor/skills-cursor/` |
| dev-to-doc-recap | ✅ 已安装 | `~/.cursor/skills/` |
| feature-first | ✅ 已安装 | `~/.cursor/skills/` |
| skill-router | ✅ 已安装 | `.cursor/skills/skill-router/` |
| react-native-best-practices | ✅ 已安装 | `.cursor/skills/` |
| react-native-testing | ✅ 已安装 | `.cursor/skills/` |
| feature-sliced-design | ✅ 已安装 | `.cursor/skills/` |
| react-native-mmkv | ✅ 已安装 | `.cursor/skills/` |
| start-wifi-camera | ✅ 已安装 | `.cursor/skills/` |
| tanstack-form | ⏳ 待安装 | — |
