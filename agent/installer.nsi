Unicode True
Name "MagProAgent"
OutFile "/tmp/agent-release/MagProAgent-Setup-1.8.13.exe"
InstallDir "$LOCALAPPDATA\Programs\MagProAgent"
RequestExecutionLevel user
SilentInstall normal
AutoCloseWindow true
ShowInstDetails nevershow

Section "Install"
  SetShellVarContext current
  ExecWait 'taskkill /F /IM MagProAgent.exe'
  SetOutPath "$INSTDIR"
  File /r "/tmp/agent-release/win-unpacked/*.*"
  CreateDirectory "$SMPROGRAMS\MagProAgent"
  CreateShortcut "$SMPROGRAMS\MagProAgent\MagProAgent.lnk" "$INSTDIR\MagProAgent.exe"
  CreateShortcut "$DESKTOP\MagProAgent.lnk" "$INSTDIR\MagProAgent.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProAgent" '"$INSTDIR\MagProAgent.exe" --hidden'
  Exec '"$INSTDIR\MagProAgent.exe" --hidden'
SectionEnd