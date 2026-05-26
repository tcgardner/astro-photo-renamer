Set-Location $PSScriptRoot

Write-Host "── astro-photo-renamer ───────────────────────────────" -ForegroundColor Cyan

# Pre-flight checks (report issues without launching anything)

# 1. Node version (≥20 required)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warning "Node.js is not installed."
} else {
    $nodeVer = (node --version) -replace '^v', ''
    if ([int]($nodeVer.Split('.')[0]) -lt 24) {
        Write-Warning "Node.js 24+ required (found v$nodeVer)."
    }
}

# 2. .env
if (-not (Test-Path '.env')) {
    Write-Warning ".env not found. Run: copy .env.example .env"
}

# 3. credentials.json
if (-not (Test-Path 'credentials.json')) {
    Write-Warning "credentials.json not found. OAuth will fail. See README -> Google Cloud setup."
}

# 4. Install dependencies if needed
if (-not (Test-Path 'node_modules\.bin\tsx.cmd')) {
    Write-Host "Installing dependencies..."
    npm install
}

Write-Host ""
Write-Host "astro-photo-renamer is a CLI tool — there is no server to start." -ForegroundColor Yellow
Write-Host ""
Write-Host "Usage:"
Write-Host "  npm run dev -- <command> [options]"
Write-Host ""
Write-Host "Commands:"
Write-Host "  run            Download + identify + rename in one shot"
Write-Host "  run --local    Skip download; process images already in staging/"
Write-Host "  download       Open Google Photos Picker and download selected images"
Write-Host "  identify       Identify and rename images already in staging/"
Write-Host ""
Write-Host "Examples:"
Write-Host "  npm run dev -- run"
Write-Host "  npm run dev -- run --local"
Write-Host '  $env:DRY_RUN="true"; npm run dev -- run --local'
Write-Host ""

exit 1
