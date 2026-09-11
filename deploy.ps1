# deploy.ps1 - deploy latest updates to Fly.io
# Run from the project folder:  .\deploy.ps1

Set-Location $PSScriptRoot

Write-Host "Pulling latest changes from Git..." -ForegroundColor Cyan
git pull origin main

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
} else {
    Write-Warning "Could not find SUPABASE_SERVICE_ROLE_KEY in .env; skipping secret update."
}

Write-Host "Deploying to Fly.io..." -ForegroundColor Green
fly deploy --no-cache `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo

Write-Host "Deploy finished." -ForegroundColor Green
