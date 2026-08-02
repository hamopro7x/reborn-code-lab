Unicode True
Name "MagProAgent"
OutFile "/tmp/agent-release/MagProAgent-Setup-1.8.13.exe"
InstallDir "$LOCALAPPDATA\Programs\MagProAgent"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

Section "Install"
  SetShellVarContext current
  ; nsExec ينفذ الأمر بدون فتح نافذة أوامر مرئية للموظف
  nsExec::Exec 'taskkill /F /IM MagProAgent.exe'
  Pop $0
  SetOutPath "$INSTDIR"
  File /r "/tmp/agent-release/win-unpacked/*.*"
  CreateDirectory "$SMPROGRAMS\MagProAgent"
  CreateShortcut "$SMPROGRAMS\MagProAgent\MagProAgent.lnk" "$INSTDIR\MagProAgent.exe"
  CreateShortcut "$DESKTOP\MagProAgent.lnk" "$INSTDIR\MagProAgent.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProAgent" '"$INSTDIR\MagProAgent.exe" --hidden'
  Exec '"$INSTDIR\MagProAgent.exe" --hidden'
SectionEnd
