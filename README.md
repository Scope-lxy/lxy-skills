# ixBrowser_qq_publish

这是一个私人定制的通用 skill，用 ixBrowser 自动串起企鹅号图文发布流程。

`README.md` 面向人，讲这个 skill 是什么、怎么安装、怎么用、用户会看到什么结果。  
真正给 agent 执行用的协议和硬约束，放在 `SKILL.md`。

## 当前行为

### 用户会看到什么

- 支持按窗口或窗口范围批量发企鹅号，例如 `发视频 1`、`发视频 1-5`、`/发企鹅号 3窗口`。
- 开发模式会停在发布按钮前，方便人工最后确认；正式模式会在检查通过后自动发布。
- 每个窗口都会返回一行中文结果，方便直接看成功、失败或停在哪一步。
- 视频上传时间可能很长，CLI 会持续输出进度，避免看起来像卡住了。

### 发布内容怎么组织

- 会先清掉旧草稿，再重新搭建正文，避免历史内容混进来。
- 标题确认后会先处理文章封面和创作声明，再进入正文媒体步骤。
- 正文固定按 `视频 -> 配图1 -> 配图2` 的顺序整理。
- 会自动清理多余空行，让最终版式更稳定。

### 发布前会自动检查什么

- 页面实际标题必须和当前视频文件名生成的标题完全一致，不一致会先自动修正。
- 文章封面必须真的生效；如果预览没变化，会直接停止，不会带着错误封面继续走。
- 正式模式下，只有确认真的发布成功后，才会把已用 `.mp4` 移到 `used`。

### 你不用手动兜底的事情

- 视频上传开始后，脚本会尽早补齐视频标题和视频封面，不用等上传结束再处理。
- 如果误触发了第二次同样的发布命令，底层会直接拒绝，避免打断正在上传的视频。
- 页面上某些步骤需要等待状态落稳时，脚本会自己停顿，不靠人工卡时机。

### 细规则放哪里

- 如果你想看“agent 收到命令后必须怎么判断、怎么回复、哪些情况不能重跑”的硬规则，看 `SKILL.md`。
- 如果你只想知道这个工具怎么安装、配置、使用，看这份 `README.md` 就够了。

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
