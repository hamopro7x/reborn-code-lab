# deploy.ps1 - نشر التحديثات على Fly.io
# تشغيل من داخل مجلد المشروع (hamo) باستخدام:
#   .\deploy.ps1

Set-Location $PSScriptRoot

Write-Host "⬇️ جاري سحب آخر تحديث من Git..." -ForegroundColor Cyan
git pull origin main

Write-Host "`n🚀 جاري النشر على Fly.io..." -ForegroundColor Green
fly deploy -a m-hamo --no-cache `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo

Write-Host "`n✅ انتهى النشر." -ForegroundColor Green
