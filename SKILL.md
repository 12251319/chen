---
name: yuketang-courseware
description: 雨课堂课件抓取：复用本机已登录的 Edge 会话，导出某门课全部课堂课件的幻灯片图片，合并成按课次排列的 PDF，并用 Windows 自带 OCR 生成逐页文字，最后输出目录索引。触发词：扒雨课堂课件、导出雨课堂 PPT、雨课堂课件下载、把某门课的教案扒下来、抓取雨课堂。
---

# 雨课堂课件抓取

把一个雨课堂班级（教室）的**全部课堂课件**导出成本地文件：幻灯片原图、按课次合并的 PDF、逐页 OCR 文字、目录索引。

## 前提条件

- Windows（浏览器自动化用 Edge；OCR 用 Windows 自带的 `Windows.Media.Ocr`）
- Node.js ≥ 18（脚本用全局 `fetch` 和 `WebSocket`）
- Python ≥ 3.9 且安装 Pillow（`python -m pip install pillow`）
- 本机已安装 Microsoft Edge
- 雨课堂账号可以正常扫码登录

## 工作流程

### 第 1 步：启动带调试端口的 Edge

浏览器必须从**独立配置目录**启动，并且带 `--remote-debugging-port=9222`；不要复用用户正在用的 Edge 配置。

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = "<工作目录>\edge-profile"
Start-Process $edge -ArgumentList @(
  "--remote-debugging-port=9222",
  "--remote-allow-origins=*",
  "--user-data-dir=$profile",
  "--no-first-run", "--no-default-browser-check",
  "https://changjiang.yuketang.cn/v2/web/index"
)
```

> 沙箱环境里浏览器进程可能被拒绝启动：需要让宿主以更高权限执行，或由用户手动启动上述命令。
> Edge 首次启动会显示登录页，请用户**用微信扫码登录**，登录完成后再继续。

### 第 2 步：确认登录并导出 cookie

```bash
node scripts/cdp.js eval "location.href"     # 应显示 /v2/web/index 而不是登录页
node scripts/cdp.js cookies                  # 写出 cookies.json（含 sessionid，务必不要提交到仓库）
```

### 第 3 步：抓取课程课件

先取到课程（教室）ID：登录后进入该课程的学习日志，URL 里的 `classroom_id` 或 `classroomId` 参数就是。

```bash
node scripts/scrape.js 26109207 "输出目录/雨课堂-概率论"
```

产物：

```
输出目录/雨课堂-概率论/
  slides/<课次序号-标题>/<课件序号-标题>/P001.jpg ...
  manifest.json
```

脚本会依次调用：课堂记录列表 → 每讲的课件列表 → 每页幻灯片的签名图片 URL，然后下载图片。

### 第 4 步：合并 PDF

```bash
python scripts/build_pdf.py "输出目录/雨课堂-概率论"
# 产物：输出目录/雨课堂-概率论/教案PDF/<课次>.pdf
```

### 第 5 步（可选）：OCR 文字层

```powershell
# 1) 先列出要 OCR 的图片（可用脚本生成）
python scripts/list_images.py "输出目录/雨课堂-概率论" > ocr_list.txt
# 2) 调用 Windows OCR
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ocr.ps1 -ListFile ocr_list.txt -OutFile ocr.tsv
# 3) 汇总成每课件一个文本
python scripts/ocr_to_text.py ocr.tsv "输出目录/雨课堂-概率论/OCR文本"
```

### 第 6 步：生成目录索引

```bash
python scripts/build_index.py "输出目录/雨课堂-概率论"
# 产物：输出目录/雨课堂-概率论/索引.md
```

## 输出结构

```
输出目录/<课程名>/
  slides/            按课次/课件分目录的幻灯片 JPG
  manifest.json      课次、课件、页码、来源 URL 清单
  教案PDF/           按课次合并的 PDF
  OCR文本/           逐课件文字（可选）
  索引.md            目录与页数索引
```

## 关键约束与易错点

- **必须复用真实登录会话**：雨课堂登录是微信扫码，脚本不做登录自动化；只通过 CDP 取已建立的 cookie。
- **cookie 是凭证**：`cookies.json`、`edge-profile/` 不要提交，.gitignore 已排除。
- **图片 URL 带签名**（`auth_key`）：有效期有限，必须登录后立即抓取；过期就重新登录重跑。
- **PPT 没有原始文件**：雨课堂把课件渲染成图片，导出的是 1600×900 级别的 JPG，不是 PPTX。
- **API 可能变**：接口是前端页面实际调用的内部接口，站点改版后需要按浏览器开发者工具重新抓包核对。
- **缺课/未上传**：某讲没有课件是正常现象（`presentations` 为空），脚本会记录 0 页并在索引里体现。
- **OCR 仅 Windows**：依赖系统已安装中文 OCR 语言包；其他平台可跳过这一步。

## 合规提示

仅用于导出**自己选修课程**的学习资料，请勿公开传播、二次分发或用于商业用途；课件版权归授课教师与学校所有。公开仓库中不要包含抓取产物。
