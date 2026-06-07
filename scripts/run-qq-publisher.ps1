param(
  [Parameter(Mandatory = $true)]
  [string]$Command
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repoRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "config\penguinhao.config.json"))) {
    powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\setup-config.ps1")
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
    npm install --omit=dev
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  npm run qq:publish -- "$Command"
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
