# deploy.ps1 - deploy latest updates to Fly.io
# Run from the project folder:  .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-LastCommandSucceeded([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE. Production was NOT updated."
    }
}

Write-Host "Pulling latest changes from Git..." -ForegroundColor Cyan
git pull origin main
Assert-LastCommandSucceeded "git pull"

# امنع نشر أي نسخة أعادت مساري المنتجات القديمين بالخطأ.
$legacyProductCode = rg -n `
  'from\(["'']products["'']\)\.(insert|update|delete)|products/\$\{Date\.now\(\)\}.*\.name' `
  src/routes src/components
if ($LASTEXITCODE -eq 0) {
    Write-Host $legacyProductCode -ForegroundColor Red
    throw "Legacy client-side product write/upload path detected. Deployment stopped."
}
if ($LASTEXITCODE -ne 1) {
    throw "Could not scan the product code before deployment."
}

# اقرأ مفتاح الخدمة من ملف .env، وثبّت كل اتصال Fly على القاعدة الجديدة فقط
$envContent = Get-Content .env -Raw
$serviceRoleMatch = [regex]::Match($envContent, 'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"')
if ($serviceRoleMatch.Success) {
    $serviceRoleKey = $serviceRoleMatch.Groups[1].Value
    Write-Host "Setting the new database connection on Fly..." -ForegroundColor Cyan
    fly secrets set -a mag-pro1 `
      SUPABASE_URL="https://kcdsdaytrnzoiharmyxo.supabase.co" `
      SUPABASE_PROJECT_ID="kcdsdaytrnzoiharmyxo" `
      SUPABASE_PUBLISHABLE_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" `
      SUPABASE_ANON_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" `
      SUPABASE_SERVICE_ROLE_KEY="$serviceRoleKey"
    Assert-LastCommandSucceeded "fly secrets set"
} else {
    throw "SUPABASE_SERVICE_ROLE_KEY was not found in .env. Deployment stopped before replacing a working release."
}

Write-Host "Deploying to Fly.io..." -ForegroundColor Green
fly deploy --no-cache `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo
if ($LASTEXITCODE -ne 0) {
    Write-Warning "The default Fly builder failed. Retrying without Depot..."
    fly deploy --no-cache --depot=false `
      --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
      --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
      --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo
}
Assert-LastCommandSucceeded "fly deploy (including the non-Depot retry)"

Write-Host "Verifying the production bundle..." -ForegroundColor Cyan
$html = (Invoke-WebRequest -UseBasicParsing -Uri "https://mag-pro1.com/admin?panel=products" -Headers @{ "Cache-Control" = "no-cache" }).Content
$assetMatches = [regex]::Matches($html, '(?:src|href)="([^"]+\.js[^"]*)"')
$legacyLiveCode = $false
foreach ($match in $assetMatches) {
    $assetPath = $match.Groups[1].Value
    $assetUrl = if ($assetPath.StartsWith("/")) { "https://mag-pro1.com$assetPath" } else { $assetPath }
    $asset = (Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -Headers @{ "Cache-Control" = "no-cache" }).Content
    if ($asset -match 'products/\$\{Date\.now' -or $asset -match 'from\(`products`\)\.insert') {
        $legacyLiveCode = $true
        break
    }
}
if ($legacyLiveCode) {
    throw "Fly completed, but mag-pro1.com still serves the legacy product bundle. Deployment verification failed."
}

Write-Host "Deploy finished and the production product bundle was verified." -ForegroundColor Green
