# ixBrowser_qq_publish

这是一个私人定制的 Codex skill，用 ixBrowser 自动串起企鹅号图文发布流程。

## 支持命令

- `发视频 1`
- `发视频 1-5`
- `发企鹅号 1`
- `发企鹅号 1-5`
- `/发视频 1-5窗口`
- `/发企鹅号 1-5窗口`
- `发视频 开发模式`
- `发视频 正式模式`

## 首次安装

安装到 Codex skill 目录：

```powershell
git clone <你的私有仓库地址> "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
cd "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File .\scripts\setup-config.ps1
```

`setup-config.ps1` 会询问本机素材目录 `assetsRoot`。直接回车会使用 `Documents\企鹅号发布`。

## 更新

```powershell
cd "$env:USERPROFILE\.agents\skills\ixBrowser_qq_publish"
powershell -ExecutionPolicy Bypass -File .\scripts\update-skill.ps1
```

## 注意

- `config\penguinhao.config.json` 是本机私有配置，不提交 GitHub。
- `node_modules` 不提交 GitHub，安装或更新时用 `npm ci --omit=dev` 生成。
- 开发模式会停在发布按钮前；正式模式检查通过后会自动点击发布。
