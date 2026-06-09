# ixBrowser_qq_publish

这是一个私人定制的通用 skill，用 ixBrowser 自动串起企鹅号图文发布流程。

## 当前行为

- 先插入两张正文配图，再把光标移到正文最前插入视频。
- 每个窗口打开发布页后先等待 10 秒，让旧草稿、标题和封面区域完成恢复；然后再强制清空标题区和正文编辑区，并连续确认正文稳定为空，避免旧草稿异步恢复后叠加。
- 最终正文顺序校验为：`视频 -> 配图1 -> 配图2`。
- 发布前会读取页面实际标题，必须和当前视频文件名生成的标题完全一致；如果不一致，会先自动改回正确标题并复查，复查仍错误才停止。
- 会自动识别并清理视频和配图之间、配图之间的多余空行。
- 开发模式会停在发布按钮前；正式模式检查通过后会自动点击发布。
- 正式模式确认发布成功后，才会把已用 `.mp4` 移到 `used`，避免下次重复分配。
- 视频封面弹窗里的 tab 是【上传封面】；文章封面弹窗里的 tab 才是【本地上传】。如果正文里已经有插图，文章封面弹窗默认可能会先落在【文内图片】，所以脚本会先切回【本地上传】再上传。
- 封面、声明和最终复查这类步骤优先按“能否读到明确状态”判断：能读到目标内容时严格校验；读不到精确内容时，只要页面已经给出足够强的成功信号，就允许继续。复查会预留合适延时，给服务器和页面反应时间；只有明确切错 tab、预览长期不变、标题不一致，或关键结果既读不到也没有可信替代信号时才停止。
- 文章封面上传后会检查预览是否真的变化；如果没变，会停止并提示封面未生效。
- 正式模式下的发布成功判定优先看发布后页面跳转或管理列表变化，而不只是按钮点击完成。
- 视频上传弹窗第一次点【确认】后，如果按钮进入动画、loading、disabled 或其他处理中状态，会继续观察，不会因为弹窗还没立刻关闭就过早第二次点击。
- 配图确认、标题回读、封面上传、声明确认、发布按钮等关键步骤后会短暂停顿，让页面状态先落稳再进入下一步。
- 如果同一时刻误触发了第二次发布命令，底层会直接拒绝并提示“已有发布任务在运行，请等待，不要重试”，避免刷新页面打断正在上传的视频。

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

安装到你的宿主 skill 目录。仓库是私有仓库，换电脑时先确保这台电脑已经能访问 GitHub 私有仓库。

```powershell
git clone https://github.com/Scope-lxy/ixBrowser_qq_publish_skill.git "<你的skill目录>\ixBrowser_qq_publish"
cd "<你的skill目录>\ixBrowser_qq_publish"
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File .\scripts\setup-config.ps1
```

`setup-config.ps1` 会询问本机素材目录 `assetsRoot`。直接回车会使用 `Documents\企鹅号发布`。

如果已经从开发仓库安装到本机，也可以按宿主选择安装目标：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-skill.ps1 -TargetHost all
```

## 更新

```powershell
cd "<你的skill目录>\ixBrowser_qq_publish"
powershell -ExecutionPolicy Bypass -File .\scripts\update-skill.ps1
```

## 注意

- `config\penguinhao.config.json` 是本机私有配置，不提交 GitHub。
- `node_modules` 不提交 GitHub，安装或更新时用 `npm ci --omit=dev` 生成。

## 开发验证

```powershell
npm test
npm run build
```
