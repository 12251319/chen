# 发布到 GitHub

本仓库已按「公开仓库」准备：带 MIT LICENSE、`.gitignore`（排除 cookie/浏览器配置/抓取产物）、README 免责声明。

## 0. 前提

- 一个 GitHub 账号（网页登录状态）
- 本机 Git ≥ 2.30（`git --version` 验证）
- 仓库中**不要**出现 `cookies.json`、`slides/`、`教案PDF/`、`OCR文本/`

## 方式 A：命令行（推荐，HTTPS + PAT）

### 1. 在网页上创建空仓库

GitHub → New repository → 名称如 `yuketang-courseware` → **不要**勾选 "Add a README file" → Create。

### 2. 配置提交身份（只需一次）

```powershell
git config --global user.name "你的名字或 GitHub 用户名"
git config --global user.email "你的邮箱"
```

### 3. 初始化并提交

```powershell
cd <本目录>
git init -b main
git add .
git status          # 确认没有 cookies.json / slides/ 等文件
git commit -m "feat: yuketang courseware scraper skill"
```

### 4. 关联远程并推送

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 5. 认证

推送时要求输入用户名和密码。**GitHub 不再接受账号密码**，密码位置要填 **Personal Access Token（PAT）**：

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token；
2. 勾选 `repo`（足够推送私有/公开仓库）；
3. 复制 token 当密码粘贴（token 只显示一次）。

或者安装 **GitHub Desktop** / **Git Credential Manager**，用浏览器授权，免手动粘贴。

## 方式 B：GitHub Desktop（不想碰命令行）

1. File → Add local repository，选择本目录；
2. Publish repository，勾选/取消 "Keep this code private"；
3. 之后每次 Commit → Push。

## 方式 C：网页上传（文件少时可行）

新建仓库 → "uploading an existing file" → 把本目录的 12 个文件按目录结构拖上去（`scripts/`、`docs/` 需先建目录：网页上传支持拖文件夹）。

## 常见问题

| 现象 | 处理 |
|---|---|
| `TLS` 连接失败 / 超时 | 先开代理（Clash Verge、letsvpn 等），然后临时给 git 设代理：`git -c http.proxy=http://127.0.0.1:7897 push` |
| `Authentication failed` | 密码处必须填 PAT，不是 GitHub 登录密码；PAT 需勾 `repo` |
| 推上去发现多了大文件 | 检查 `.gitignore` 是否生效：`git status --ignored`；已误提交用 `git rm --cached <file>` 后再提交 |
| 想改为私有 | 仓库 Settings → Danger Zone → Change visibility |

## 公开前检查清单

- [ ] `git status` 里没有 `cookies.json`、`edge-profile/`、`slides/`、`教案PDF/`、`OCR文本/`
- [ ] README 顶部有「仅限个人学习」免责声明
- [ ] LICENSE 年份/署名正确
- [ ] 没有把某门课的具体课件/教案内容贴进仓库
- [ ] 提交信息里没有账号、token、cookie

## 发布后

- 把 `SKILL.md` 里的用法再核对一遍（目录名、脚本参数）；
- 在 README 顶部加仓库徽章或使用示例（可选）；
- 如果要给别人用，对方只需把目录复制到自己的技能目录（见 README「安装」）。
