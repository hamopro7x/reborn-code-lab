# deploy.ps1 - deploy latest updates to Fly.io
# Run from the project folder:  .\deploy.ps1

Set-Location $PSScriptRoot

Write-Host "Pulling latest changes from Git..." -ForegroundColor Cyan
git pull origin main

Write-Host "Deploying to Fly.io..." -ForegroundColor Green
fly deploy -a m-hamo --no-cache `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo

Write-Host "Deploy finished." -ForegroundColor Green
