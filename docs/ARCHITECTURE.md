# 原理与接口说明

这套工具不是「HTTP 爬虫」，而是**复用真实登录会话的浏览器辅助抓取**。原因和链路如下。

## 1. 为什么不能直接发 HTTP 请求

雨课堂（长江雨课堂，`changjiang.yuketang.cn`）有三道门槛：

1. **登录**：账号只能微信扫码/APP 扫码，没有可脚本化的账号密码表单（即使有也需要短信/验证码）；
2. **会话**：所有数据接口都要求登录后的 cookie（`sessionid` 等），cookie 与微信身份绑定；
3. **签名资源**：幻灯片图片放在 CDN（`yangtse-pri-ups.yuketang.cn`）上，URL 带 `auth_key` 签名，过期失效。

所以直接 `fetch` 页面或接口会拿到登录页/401。正确做法是：让**用户自己的浏览器**完成登录，然后借浏览器的会话去请求。

## 2. 整体架构

```
┌──────────────┐   ①启动(独立profile)   ┌─────────────────────┐
│  Node 脚本    │ ─────────────────────→ │  Edge（调试端口 9222）│
│  cdp.js      │ ←──── ②WebSocket CDP ── │  用户扫码登录后的页面  │
└──────┬───────┘                        └─────────────────────┘
       │ ③读 cookie / 页面内同源 fetch
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 雨课堂内部接口                                                  │
│  /v2/api/web/logs/learn/<classroom>     → 课次列表              │
│  /api/v3/classroom-report/student/detail?lesson_id=… → 课件列表 │
│  /api/v3/classroom-report/student/ppt?lesson_id=&presentationId= │
│                                          → 每页幻灯片图片 URL    │
└──────────────────────────────────────────────────────────────┘
       │ ④下载（图片 URL 自带签名，无需 cookie）
       ▼
  slides/*.jpg → Pillow 合 PDF → OCR → 索引
```

## 3. 关键步骤

### 3.1 启动带调试端口的浏览器

```powershell
msedge.exe --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=<独立目录> https://changjiang.yuketang.cn/v2/web/index
```

- 用**独立 profile** 是为了不影响用户日常浏览器；代价是每次都要重新扫码登录。
- `--remote-allow-origins=*` 允许本地 WebSocket 客户端连接 CDP。
- 浏览器启动后是普通窗口，用户手动扫码；脚本不接触账号密码。

### 3.2 通过 CDP 借会话

CDP（Chrome DevTools Protocol）是浏览器自带的调试协议：

- `GET http://127.0.0.1:9222/json/list` 列出页面 target；
- 连接 target 的 `webSocketDebuggerUrl`，发送 JSON-RPC 命令；
- 常用命令：
  - `Network.getAllCookies` → 取登录 cookie；
  - `Runtime.evaluate` → 在页面里执行任意 JS，**同源 fetch 自动带 cookie**；
  - `Page.navigate` / `Input.dispatchMouseEvent` / `Page.captureScreenshot`。

因为脚本是在**已登录页面的上下文**里执行 `fetch`，所以接口鉴权天然通过，不需要自己复刻签名头。

### 3.3 接口链路

| 步骤 | 接口 | 说明 |
|---|---|---|
| 课次列表 | `/v2/api/web/logs/learn/<classroom_id>?actype=-1&page=0&offset=50&sort=-1` | 返回作业、公告、课堂记录；`type == 14` 是课堂记录，`courseware_id` 是 lesson_id |
| 课件列表 | `/api/v3/classroom-report/student/detail?lesson_id=<id>` | `data.presentation[]`：每个课件的 `presentationId`、`title`、`totalCount` |
| 幻灯片列表 | `/api/v3/classroom-report/student/ppt?lesson_id=<id>&presentationId=<id>` | `data.slideList[]`：每页的 `index`、`cover`（带 `auth_key` 的图片 URL）、`id` |

`classroom_id` 从课程学习日志页 URL 里取（`classroom_id=` 或 `classroomId=`）。

### 3.4 下载与后处理

- 图片 URL 是签名 CDN 直链：`https://yangtse-pri-ups.yuketang.cn/common_uploads/<teacher>/cover<hash>_<ts>.jpg?auth_key=...`，**不需要 cookie**，直接 `fetch` 保存即可；签名有时效，登录后尽快抓。
- 雨课堂的「课件」是 PPT 渲染出的图片（约 1600×900），没有 PPTX 原件可下载。
- `build_pdf.py` 用 Pillow 按课次把图片合并成 PDF（每页一张图）。
- OCR 用 Windows 自带 `Windows.Media.Ocr`（PowerShell + WinRT）：不依赖第三方模型，离线、速度快；中文识别在 1600px 宽度下可用，但公式密集页会有误差。
- `build_index.py` 读 `manifest.json` 生成目录索引，并标出「本次无课件」的课次。

## 4. 设计取舍

| 选择 | 理由 |
|---|---|
| 复用浏览器会话，不做登录自动化 | 微信扫码无法脚本化；也避免接触用户密码 |
| 独立 profile | 不污染用户日常浏览器；退出即删除 |
| 在页面里 `Runtime.evaluate` 调接口 | 自动带 cookie、自动同源，免去逆向签名 |
| 下载图片而不是「打印页面」 | 页面打印会丢懒加载图片；接口能拿到完整 93 页列表 |
| OCR 用系统能力 | 零依赖、无需 GPU；代价是精度一般 |
| 脚本保持零 npm 依赖 | Node 18+ 自带 `fetch`/`WebSocket`，开箱即用 |

## 5. 失效与维护

- 站点改版 → 上方三个接口路径/参数可能变化：用浏览器开发者工具（Network，筛选 `api`）重新抓包，替换 `scrape.js` 里的 URL。
- 登录态失效 → 重新启动 Edge 扫码，重新 `cdp.js cookies`。
- 图片 403 → `auth_key` 过期，重新登录重跑。
- 页面结构调整 → `cdp.js click` 按可见文本定位，若文案变化需调整。
