Unicode True
Name "Mag Pro"
OutFile "/tmp/agent-release/MagPro-Setup-2.0.2.exe"
InstallDir "$LOCALAPPDATA\Programs\MagPro"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

Section "Install"
  SetShellVarContext current
  ; nsExec ينفذ الأمر بدون فتح نافذة أوامر مرئية للموظف
  nsExec::Exec 'taskkill /F /IM "Mag Pro.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM MagProAgent.exe'
  Pop $0
  SetOutPath "$INSTDIR"
  File /r "/tmp/agent-release/win-unpacked/*.*"
  CreateDirectory "$SMPROGRAMS\Mag Pro"
  CreateShortcut "$SMPROGRAMS\Mag Pro\Mag Pro.lnk" "$INSTDIR\Mag Pro.exe"
  CreateShortcut "$DESKTOP\Mag Pro.lnk" "$INSTDIR\Mag Pro.exe"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProAgent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagPro" '"$INSTDIR\Mag Pro.exe" --hidden'
  Exec '"$INSTDIR\Mag Pro.exe" --hidden'
SectionEnd
