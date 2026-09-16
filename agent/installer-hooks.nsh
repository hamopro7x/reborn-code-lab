!macro customInstall
  ; Stop every previous generation before replacing its files.
  nsExec::Exec 'taskkill /F /IM "Mag Pro.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Mag Pro Connect.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM MagProAgent.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "MAG PRO Agent.exe"'
  Pop $0
  Sleep 1200

  ; Remove old startup entries and obsolete installations.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagPro"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MagProAgent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MAG PRO Agent"
  nsExec::Exec 'schtasks /Delete /TN "MagPro" /F'
  Pop $0
  nsExec::Exec 'schtasks /Delete /TN "MagProAgent" /F'
  Pop $0
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MagPro.vbs"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MagProAgent.vbs"
  RMDir /r "$LOCALAPPDATA\Programs\MagPro"
  RMDir /r "$LOCALAPPDATA\Programs\mag-pro"
  RMDir /r "$LOCALAPPDATA\Programs\mag-pro-agent"
  RMDir /r "$LOCALAPPDATA\Programs\MagProAgent"
  Delete "$DESKTOP\Mag Pro.lnk"
  Delete "$DESKTOP\MAG PRO Agent.lnk"
  RMDir /r "$SMPROGRAMS\Mag Pro"
!macroend