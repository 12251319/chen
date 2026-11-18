# 雨课堂课件抓取 Skill

> 复用本机已登录的浏览器会话，把雨课堂某门课的**全部课堂课件**导出为：幻灯片原图 → 按课次合并的 PDF → 逐页 OCR 文字 → 目录索引。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D4.svg)](#环境要求)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-339933.svg)](#环境要求)
[![Skill](https://img.shields.io/badge/Form-Agent%20Skill-6f42c1.svg)](#安装)

> **仅限个人学习使用。** 课件版权归授课教师与学校所有，请勿公开传播抓取产物。公开仓库中不要提交 `cookies.json`、`slides/`、`教案PDF/`、`OCR文本/`。

---

## 目录

- [为什么需要它](#为什么需要它)
- [功能特性](#功能特性)
- [工作原理](#工作原理)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令参考](#命令参考)
- [输出结构](#输出结构)
- [OCR 文字层](#ocr-文字层)
- [常见问题](#常见问题)
- [已知限制](#已知限制)
- [合规与免责声明](#合规与免责声明)
- [仓库结构](#仓库结构)
- [开发与验证](#开发与验证)
- [License](#license)

---

## 为什么需要它

雨课堂的课件**不在公开网页里**：

1. **登录墙**：只能微信/APP 扫码，没有可脚本化的账号密码入口；
2. **SPA**：页面由前端渲染，直接请求 HTML 拿不到内容；
3. **签名图片**：幻灯片是 CDN 上的 JPG，URL 带 `auth_key` 签名且会过期；
4. **没有 PPTX**：雨课堂只提供渲染后的图片，官方不提供原文件下载。

于是这个 Skill 采用「**浏览器辅助抓取**」：让用户自己的浏览器完成扫码登录，脚本通过调试协议借用会话，在页面同源上下文里调用内部接口拿数据，再下载图片做后处理。

## 功能特性

- **一条命令导出整门课**：自动枚举课次 → 课件 → 幻灯片，按课次/课件分目录保存；
- **不碰账号密码**：登录由用户在浏览器窗口手动完成，脚本只读取已建立的会话 cookie；
- **独立浏览器配置**：不影响日常使用的 Edge，退出后删除即可；
- **零 npm 依赖**：只用 Node 18+ 自带的 `fetch` / `WebSocket`；
- **按课次合并 PDF**：每讲一个 PDF，方便打印和阅读；
- **OCR 文字层**：Windows 自带 `Windows.Media.Ocr`，离线、无需模型下载；
- **目录索引**：自动汇总课次/日期/页数，并标出「本次无课件」的课次；
- **可移植 Skill**：同一个目录可用于 DeepSeek Harness、Claude Code、Codex。

## 工作原理

```
┌──────────────┐  ① 启动（独立 profile）  ┌────────────────────────┐
│  Node 脚本    │ ───────────────────────→ │  Edge（调试端口 9222）   │
│  cdp.js      │ ←──── ② CDP / WebSocket ─│  用户扫码登录后的页面     │
└──────┬───────┘                          └────────────────────────┘
       │ ③ 读 cookie / 页面内同源 fetch
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 雨课堂内部接口                                                    │
│  /v2/api/web/logs/learn/<classroom>          → 课次列表            │
│  /api/v3/classroom-report/student/detail     → 课件列表            │
│  /api/v3/classroom-report/student/ppt        → 每页幻灯片图片 URL   │
└──────────────────────────────────────────────────────────────────┘
       │ ④ 下载（图片 URL 自带签名，无需额外鉴权）
       ▼
  slides/*.jpg → build_pdf.py → 教案PDF/ → ocr.ps1 → OCR文本/ → build_index.py → 索引.md
```

三个接口的具体参数与返回结构、设计取舍、失效后的排查方法，见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。

## 环境要求

| 依赖 | 版本/说明 |
|---|---|
| 操作系统 | Windows 10 / 11（OCR 依赖 Windows 自带能力） |
| 浏览器 | Microsoft Edge |
| Node.js | ≥ 18（使用全局 `fetch`、`WebSocket`；开发环境 Node 24 实测） |
| Python | ≥ 3.9，需安装 Pillow（`python -m pip install pillow`） |
| 网络 | 能正常访问 `changjiang.yuketang.cn` 与课件 CDN |
| 账号 | 能扫码登录雨课堂 |

> 非 Windows 环境可跳过 OCR 步骤，其余功能（抓取 + PDF + 索引）依赖 Node/Python，理论上可跨平台，但本仓库只在 Windows 上验证过。

## 安装

### 方式一：作为 Agent Skill 使用（推荐）

```powershell
# DeepSeek Harness
Copy-Item -Recurse . "$env:USERPROFILE\.dsh\skills\yuketang-courseware"

# Claude Code
Copy-Item -Recurse . "$env:USERPROFILE\.claude\skills\yuketang-courseware"

# Codex
Copy-Item -Recurse . "$env:USERPROFILE\.agents\skills\yuketang-courseware"
```

重启/刷新 Agent 后，技能会根据 `SKILL.md` 的 description 被自动路由；也可以直接说「用 yuketang-courseware 抓某门课的课件」。

### 方式二：作为命令行工具使用

```bash
git clone https://github.com/<你的用户名>/yuketang-courseware.git
cd yuketang-courseware
node scripts/cdp.js --help
```

## 快速开始

以「概率论与数理统计 A」为例（`classroom_id` 从课程学习日志页 URL 的 `classroom_id=` 参数获取）：

```powershell
# 1. 启动带调试端口的 Edge（独立 profile，不占用日常浏览器）
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
Start-Process $edge -ArgumentList @(
  "--remote-debugging-port=9222",
  "--remote-allow-origins=*",
  "--user-data-dir=$PWD\edge-profile",
  "--no-first-run", "--no-default-browser-check",
  "https://changjiang.yuketang.cn/v2/web/index"
)

# 2. 在弹出的窗口里用微信扫码登录，然后确认会话并导出 cookie
node scripts/cdp.js eval "location.href"   # 输出应为 /v2/web/index，而不是登录页
node scripts/cdp.js cookies                # 生成 cookies.json（勿提交）

# 3. 抓取全部课件
node scripts/scrape.js 26109207 "out/概率论"

# 4. 合并为按课次的 PDF
python scripts/build_pdf.py "out/概率论"

# 5. 可选：OCR 文字层 + 目录索引
python scripts/list_images.py "out/概率论" > ocr_list.txt
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/ocr.ps1 -ListFile ocr_list.txt -OutFile ocr.tsv
python scripts/ocr_to_text.py ocr.tsv "out/概率论/OCR文本"
python scripts/build_index.py "out/概率论"
```

完成后打开 `out/概率论/索引.md` 查看课次与页数；`out/概率论/教案PDF/` 是按课次合并的 PDF。

## 命令参考

| 脚本 | 作用 | 用法 |
|---|---|---|
| `cdp.js` | CDP 客户端：执行 JS、取 cookie、导航、点击、截图、打印 PDF | `node cdp.js <list\|eval\|nav\|click\|cookies\|shot\|pdf> [args]` |
| `scrape.js` | 课次 → 课件 → 幻灯片，下载图片并写 `manifest.json` | `node scrape.js <classroom_id> <输出目录> [--cookies cookies.json] [--base URL]` |
| `build_pdf.py` | 按课次把幻灯片合并成 PDF | `python build_pdf.py <课程目录>` |
| `list_images.py` | 列出所有幻灯片图片（供 OCR 使用） | `python list_images.py <课程目录> [--filter 关键字]` |
| `ocr.ps1` | Windows OCR 批量识别 | `powershell -File ocr.ps1 -ListFile list.txt -OutFile ocr.tsv` |
| `ocr_to_text.py` | 把 OCR 结果汇总成每课件一个文本 | `python ocr_to_text.py <ocr.tsv> <输出目录>` |
| `build_index.py` | 生成课程目录索引 `索引.md` | `python build_index.py <课程目录>` |

环境变量：`CDP_PORT` 可改调试端口（默认 `9222`）。

## 输出结构

```
out/概率论/
├── slides/
│   ├── 01-3.1_二维随机变量/
│   │   └── 1-3.1_二维随机变量/
│   │       ├── P001.jpg
│   │       └── ...
│   └── 14-3.2_边缘分布/
├── manifest.json          # 课次、课件、页码、来源 URL 清单
├── 教案PDF/
│   ├── 01-3.1_二维随机变量.pdf
│   └── ...
├── OCR文本/               # 可选
│   └── 01-3.1_二维随机变量.txt
└── 索引.md                # 目录与页数索引（含「本次无课件」标记）
```

## OCR 文字层

- 使用 `Windows.Media.Ocr`（PowerShell + WinRT），**离线、无需下载模型**；
- 中文识别依赖系统 OCR 语言包（中文系统默认有 `zh-Hans-CN`）；
- 课件是 1600×900 左右的渲染图，正文识别效果良好；**公式密集页可能有误差**，重要公式请对照 PDF 原图；
- 输出是「每课件一个 txt，按页标记 `[P001]`」，方便后续做知识点总结或检索。

## 常见问题

**Q1：`cdp.js` 报 `CDP list failed` / `no page target`？**
浏览器没启动，或没用 `--remote-debugging-port=9222` 启动。按「快速开始」第 1 步重开。

**Q2：`cdp.js eval "location.href"` 返回登录页 URL？**
还没扫码登录。在弹出的 Edge 窗口完成微信扫码后重试。

**Q3：`scrape.js` 报 `cookie file not found`？**
先运行 `node scripts/cdp.js cookies` 生成 `cookies.json`（与运行目录一致）。

**Q4：图片下载 403？**
签名 URL 过期。重新启动浏览器 → 扫码登录 → 重新导出 cookie → 重跑抓取。

**Q5：某讲显示 0 页？**
该次课老师没有上传课件（缺勤/未发布）。`索引.md` 会把这讲列在「缺课件课次」里。

**Q6：浏览器在受限沙箱里启动失败？**
沙箱会拦截浏览器进程。让宿主以更高权限执行启动命令，或由用户手动在终端里启动 Edge，再继续脚本步骤。

**Q7：能只抓某一讲吗？**
当前按整门课抓取；临时需求可在 `scrape.js` 里按 lesson 标题过滤，或在抓完后只保留需要的课次目录。

**Q8：会不会把我的账号密码发出去？**
不会。脚本不处理登录，只读取浏览器已建立的 cookie，且 cookie 文件被 `.gitignore` 排除。

## 已知限制

- **没有 PPTX 原文件**：雨课堂只提供渲染后的 JPG，长边约 1600px；
- **接口可能变**：内部接口随站点改版可能失效，需按 `docs/ARCHITECTURE.md` 重新抓包；
- **仅 Windows 验证**：OCR 与启动脚本按 Windows 编写；
- **需要人工登录**：无法全自动，扫码这一步必须由用户完成；
- **课程内容不随仓库分发**：仓库只包含工具代码。

## 合规与免责声明

- 本项目仅用于导出**本人选修课程**的学习资料，方便离线复习；
- 课件、讲义、试题的版权归授课教师与学校所有，**请勿公开传播、二次分发或用于商业用途**；
- 请遵守雨课堂/学堂在线的用户协议，不要高频请求、不要绕过访问控制；
- 使用者对自己抓取和保存的内容负全部责任。

## 仓库结构

```
yuketang-courseware/
├── SKILL.md                 # 技能定义（Agent 读取）
├── README.md                # 本文件
├── LICENSE                  # MIT
├── .gitignore               # 排除 cookie、浏览器配置、抓取产物
├── docs/
│   ├── ARCHITECTURE.md      # 原理、接口链路、设计取舍
│   └── PUBLISH.md           # 发布到 GitHub 的步骤与排错
└── scripts/
    ├── cdp.js
    ├── scrape.js
    ├── build_pdf.py
    ├── list_images.py
    ├── ocr.ps1
    ├── ocr_to_text.py
    └── build_index.py
```

## 开发与验证

- 所有脚本保持**零第三方依赖**（Node 用内置 API，Python 只用 Pillow）；
- 语法检查：`node --check`、`python -m py_compile`、PowerShell Parser；
- 端到端验证：用合成课件数据跑通「PDF 合并 → OCR 汇总 → 索引生成」；扫码登录与真实课程抓取需在本机手动验证。

## License

[MIT](LICENSE) © 2026 陈俊仁
