# ixBrowser_qq_publish

这是一个私人定制的 Codex skill，用 ixBrowser 自动串起企鹅号图文发布流程。

## 当前行为

- 先插入两张正文配图，再把光标移到正文最前插入视频。
- 最终正文顺序校验为：`视频 -> 配图1 -> 配图2`。
- 会自动识别并清理视频和配图之间、配图之间的多余空行。
- 开发模式会停在发布按钮前；正式模式检查通过后会自动点击发布。
- 正式模式确认发布成功后，才会把已用 `.mp4` 移到 `used`，避免下次重复分配。

## 支持命令

发布格式：

`[/]发企鹅号|发视频` + 空格 + `窗口号` 或 `起始窗口-结束窗口` + 可选的 `窗口` 后缀。

示例：

- `发视频 1`
- `发视频 1-10`
- `发企鹅号 1`
- `/发企鹅号 1-10窗口`

模式切换格式：

`[/]发企鹅号|发视频` + 空格 + `开发模式|正式模式`

示例：

- `发视频 开发模式`
- `发视频 正式模式`

注意：命令词和窗口号之间必须有空格，`发视频1` 不会触发发布。

## 首次安装

安装到 Codex skill 目录。仓库是私有仓库，换电脑时先确保这台电脑已经能访问 GitHub 私有仓库。

```powershell
git clone https://github.com/Scope-lxy/ixBrowser_qq_publish_skill.git "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
cd "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File .\scripts\setup-config.ps1
```

`setup-config.ps1` 会询问本机素材目录 `assetsRoot`。直接回车会使用 `Documents\企鹅号发布`。

如果已经从开发仓库安装到本机，也可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-skill.ps1 -TargetHost codex
```

## 更新

```powershell
cd "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
powershell -ExecutionPolicy Bypass -File .\scripts\update-skill.ps1
```

## 注意

- `config\penguinhao.config.json` 是本机私有配置，不提交 GitHub。
- `node_modules` 不提交 GitHub，安装或更新时用 `npm ci --omit=dev` 生成。
- 如果 Codex 还在找旧 skill 名 `ixBrowser_video_publish`，重新开一个 Codex 会话刷新 skill 列表。

## 开发验证

```powershell
npm test
npm run build
```
