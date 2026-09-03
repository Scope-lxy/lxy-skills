# lxy-skills

个人使用的 Agent Skills 合集，按 [Agent Skills](https://agentskills.io) 的 `SKILL.md` 结构组织，可用于 Codex、Claude Code 和其他兼容工具。

## Skills

| Skill | 用途 |
| --- | --- |
| [`rename-titles`](./rename-titles/) | 根据 SRT 字幕生成唯一中文标题；确认后批量同步重命名字幕、视频和封面。 |
| [`ixBrowser_qq_publish`](./ixBrowser_qq_publish/) | 通过 ixBrowser 多窗口发布企鹅号视频。 |

## 在新设备使用

本仓库是私有仓库。新设备先登录同一个 GitHub 账号，然后在支持 Agent Skills 的工具中分别说：

```text
帮我安装这个 skill：https://github.com/Scope-lxy/lxy-skills/tree/main/rename-titles
```

```text
帮我安装这个 skill：https://github.com/Scope-lxy/lxy-skills/tree/main/ixBrowser_qq_publish
```

`rename-titles` 默认使用当前 Windows 用户桌面下的既有素材文件夹；也可以在使用时提供实际目录。

`ixBrowser_qq_publish` 不同步真实账号配置。安装后根据该 Skill 目录中的示例配置文件创建本地 `penguinhao.config.json`。

## 维护约定

`AGENTS.md` 和 `CLAUDE.md` 仅供本地工具使用，不属于仓库交付物，不备份或提交到 GitHub；需要这些文件的本地工具可在仓库内使用，但它们已被 Git 忽略。
