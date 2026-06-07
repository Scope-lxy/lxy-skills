param(
  [string]$AssetsRoot,
  [switch]$Force
)

$skillRoot = Split-Path -Parent $PSScriptRoot
$configDir = Join-Path $skillRoot "config"
$examplePath = Join-Path $configDir "penguinhao.config.example.json"
$configPath = Join-Path $configDir "penguinhao.config.json"

if ((Test-Path -LiteralPath $configPath) -and -not $Force) {
  Write-Host "本机配置已存在：$configPath"
  exit 0
}

if (-not (Test-Path -LiteralPath $examplePath)) {
  throw "未找到配置模板：$examplePath"
}

$config = Get-Content -LiteralPath $examplePath -Encoding UTF8 -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($AssetsRoot)) {
  $defaultAssetsRoot = Join-Path $env:USERPROFILE "Documents\企鹅号发布"
  $answer = Read-Host "请输入企鹅号素材目录 assetsRoot，直接回车使用 $defaultAssetsRoot"

  if ([string]::IsNullOrWhiteSpace($answer)) {
    $AssetsRoot = $defaultAssetsRoot
  } else {
    $AssetsRoot = $answer
  }
}

$config.assetsRoot = $AssetsRoot
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "已写入本机配置：$configPath"
