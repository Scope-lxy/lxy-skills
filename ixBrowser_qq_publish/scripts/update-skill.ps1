param(
  [switch]$SkipInstall
)

$skillRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $skillRoot
try {
  if (Test-Path -LiteralPath ".git") {
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  if (-not (Test-Path -LiteralPath "config\penguinhao.config.json")) {
    powershell -ExecutionPolicy Bypass -File ".\scripts\setup-config.ps1"
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  if (-not $SkipInstall) {
    npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}
finally {
  Pop-Location
}
