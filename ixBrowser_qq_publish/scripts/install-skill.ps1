param(
  [ValidateSet("all", "claude", "openclaw", "codex")]
  [string]$TargetHost = "all",

  [switch]$DryRun
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = $repoRoot
$skillName = "ixBrowser_qq_publish"

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "未找到 skill 源目录：$sourceDir"
}

$targets = @()

switch ($TargetHost) {
  "all" {
    $targets = @(
      @{ Name = "claude"; Path = Join-Path $env:USERPROFILE ".claude\skills\$skillName" },
      @{ Name = "openclaw"; Path = Join-Path $env:USERPROFILE ".openclaw\skills\$skillName" },
      @{ Name = "codex"; Path = Join-Path $env:USERPROFILE ".agents\skills\$skillName" }
    )
  }
  "claude" {
    $targets = @(
      @{ Name = "claude"; Path = Join-Path $env:USERPROFILE ".claude\skills\$skillName" }
    )
  }
  "openclaw" {
    $targets = @(
      @{ Name = "openclaw"; Path = Join-Path $env:USERPROFILE ".openclaw\skills\$skillName" }
    )
  }
  "codex" {
    $targets = @(
      @{ Name = "codex"; Path = Join-Path $env:USERPROFILE ".agents\skills\$skillName" }
    )
  }
}

foreach ($target in $targets) {
  $targetRoot = Split-Path -Parent $target.Path

  if ($DryRun) {
    Write-Host "[dry-run] $($target.Name): $sourceDir -> $($target.Path)"
    continue
  }

  New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

  if (Test-Path -LiteralPath $target.Path) {
    Remove-Item -LiteralPath $target.Path -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $target.Path | Out-Null

  $skillItems = @(
    "SKILL.md",
    "README.md",
    "agents",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "vitest.config.ts",
    "config\penguinhao.config.example.json",
    "src",
    "scripts\run-qq-publisher.ps1",
    "scripts\setup-config.ps1",
    "scripts\update-skill.ps1"
  )

  foreach ($item in $skillItems) {
    $sourcePath = Join-Path $repoRoot $item

    if (-not (Test-Path -LiteralPath $sourcePath)) {
      throw "未找到 skill 文件：$sourcePath"
    }

    $targetPath = Join-Path $target.Path $item
    $targetParent = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
  }

  $localConfig = Join-Path $repoRoot "config\penguinhao.config.json"
  if (Test-Path -LiteralPath $localConfig) {
    Copy-Item -LiteralPath $localConfig -Destination (Join-Path $target.Path "config\penguinhao.config.json") -Force
  }

  Write-Host "[$($target.Name)] 已安装到 $($target.Path)"
}
