# lxy-skills Repository Rules

`AGENTS.md` is the source of truth for this repository. Keep `CLAUDE.md` as an exact copy. Update `AGENTS.md` first, then run `Copy-Item AGENTS.md CLAUDE.md -Force`.

## Scope

This repository contains only these personal skills:

- `rename-titles`
- `ixBrowser_qq_publish`

Do not add bundled, vendor, or third-party skills without an explicit request.

## Skill Layout

- Each skill lives in its own top-level directory.
- Every skill must include a valid `SKILL.md` with `name` and `description` frontmatter.
- Keep a skill's required scripts, references, tests, and agent metadata within that skill directory.
- Update `README.md` whenever a skill is added, removed, renamed, or materially changes its installation process.

## Safety And Verification

- Never commit local configuration, account identifiers, cookies, tokens, generated dependency directories, or build output.
- Commit an example configuration file when a skill needs one, and document how to create the local configuration separately.
- Before pushing, inspect the staged diff, check that `AGENTS.md` and `CLAUDE.md` match, and scan tracked files for credentials or machine-specific paths.
