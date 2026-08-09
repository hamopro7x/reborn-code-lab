Unicode True
Name "Mag Pro Connect"
OutFile "/tmp/agent-release/MagProConnect-Setup-3.1.10.exe"
InstallDir "$LOCALAPPDATA\Programs\MagProConnect"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

Section "Install"
  SetShellVarContext current
  ; إيقاف كل أجيال البرنامج السابقة قبل لمس ملفاتها.
  nsExec::Exec 'taskkill /F /IM "Mag Pro.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Mag Pro Connect.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM MagProAgent.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "MAG PRO Agent.exe"'
  Pop $0
  Sleep 1200

  ; إلغاء كل نقاط التشغيل التلقائي القديمة حتى لا تعمل نسختان مع ويندوز.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagPro"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProAgent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MAG PRO Agent"
  nsExec::Exec 'schtasks /Delete /TN "MagPro" /F'
  Pop $0
  nsExec::Exec 'schtasks /Delete /TN "MagProAgent" /F'
  Pop $0
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MagPro.vbs"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MagProAgent.vbs"

  ; حذف الحزمة القديمة فعلياً. بيانات ربط الجهاز محفوظة في AppData وليست هنا.
  RMDir /r "$LOCALAPPDATA\Programs\MagPro"
  RMDir /r "$LOCALAPPDATA\Programs\mag-pro"
  RMDir /r "$LOCALAPPDATA\Programs\mag-pro-agent"
  RMDir /r "$LOCALAPPDATA\Programs\MagProAgent"
  Delete "$DESKTOP\Mag Pro.lnk"
  Delete "$DESKTOP\MAG PRO Agent.lnk"
  RMDir /r "$SMPROGRAMS\Mag Pro"

  SetOutPath "$INSTDIR"
  File /r "/tmp/agent-release/win-unpacked/*.*"
  CreateDirectory "$SMPROGRAMS\Mag Pro Connect"
  CreateShortcut "$SMPROGRAMS\Mag Pro Connect\Mag Pro Connect.lnk" "$INSTDIR\Mag Pro Connect.exe"
  CreateShortcut "$DESKTOP\Mag Pro Connect.lnk" "$INSTDIR\Mag Pro Connect.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProConnect" '"$INSTDIR\Mag Pro Connect.exe" --hidden'
  Exec '"$INSTDIR\Mag Pro Connect.exe" --hidden'
SectionEnd
