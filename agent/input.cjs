// التحكم عن بعد في جهاز الموظف (ويندوز) بدون أي مكتبات أصلية.
// نشغّل عملية PowerShell دائمة تقرأ أوامر JSON سطراً سطراً وتنفّذها عبر user32.dll
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MagInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
}
'@
Add-Type -AssemblyName System.Windows.Forms

$ZERO = [UIntPtr]::Zero
function ScreenW { [MagInput]::GetSystemMetrics(0) }
function ScreenH { [MagInput]::GetSystemMetrics(1) }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  try {
    $c = $line | ConvertFrom-Json
    switch ($c.t) {
      'move' {
        $x = [int]([double]$c.x * (ScreenW))
        $y = [int]([double]$c.y * (ScreenH))
        [MagInput]::SetCursorPos($x, $y) | Out-Null
      }
      'down' {
        if ($c.x -ne $null) {
          $x = [int]([double]$c.x * (ScreenW)); $y = [int]([double]$c.y * (ScreenH))
          [MagInput]::SetCursorPos($x, $y) | Out-Null
        }
        # 0=يسار 1=وسط 2=يمين (نفس ترقيم المتصفح)
        $f = 0x0002
        if ([int]$c.b -eq 2) { $f = 0x0008 } elseif ([int]$c.b -eq 1) { $f = 0x0020 }
        [MagInput]::mouse_event($f, 0, 0, 0, $ZERO)
      }
      'up' {
        $f = 0x0004
        if ([int]$c.b -eq 2) { $f = 0x0010 } elseif ([int]$c.b -eq 1) { $f = 0x0040 }
        [MagInput]::mouse_event($f, 0, 0, 0, $ZERO)
      }
      'wheel' {
        [MagInput]::mouse_event(0x0800, 0, 0, [uint32]([int]$c.d), $ZERO)
      }
      'key' {
        $vk = [byte][int]$c.vk
        $flags = 0
        if ($c.ext) { $flags = $flags -bor 0x0001 }
        if (-not $c.down) { $flags = $flags -bor 0x0002 }
        [MagInput]::keybd_event($vk, 0, $flags, $ZERO)
      }
      'text' {
        if ($c.s) { [System.Windows.Forms.SendKeys]::SendWait([string]$c.s) }
      }
    }
  } catch { }
}
`;


let proc = null;
let scriptPath = null;

function ensure() {
  if (process.platform !== "win32") return null;
  if (proc && !proc.killed) return proc;
  try {
    if (!scriptPath) {
      scriptPath = path.join(os.tmpdir(), "mag-input-" + process.pid + ".ps1");
      fs.writeFileSync(scriptPath, PS, "utf8");
    }
    proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
    );
    proc.on("exit", () => {
      proc = null;
    });
    proc.on("error", () => {
      proc = null;
    });
    return proc;
  } catch {
    proc = null;
    return null;
  }
}

// تحويل مفاتيح المتصفح إلى أكواد ويندوز الافتراضية
const VK = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, CapsLock: 20,
  Escape: 27, " ": 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46, Meta: 91, ContextMenu: 93,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117,
  F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
  ";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191,
  "`": 192, "[": 219, "\\": 220, "]": 221, "'": 222,
};
const EXTENDED = new Set([
  "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End",
  "PageUp", "PageDown", "Insert", "Delete",
]);

function vkFor(key) {
  if (!key) return 0;
  if (VK[key] !== undefined) return VK[key];
  if (key.length === 1) {
    const c = key.toUpperCase();
    const code = c.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90)) return code;
  }
  return 0;
}

function escapeSendKeys(s) {
  return String(s).replace(/[+^%~(){}\[\]]/g, (m) => "{" + m + "}");
}

/** ينفّذ أمر تحكم واحد وارد من لوحة الإدارة */
function handleRemoteInput(cmd) {
  if (!cmd || typeof cmd !== "object") return;
  const p = ensure();
  if (!p || !p.stdin.writable) return;
  let payload = null;
  if (cmd.t === "move" || cmd.t === "up" || cmd.t === "down" || cmd.t === "wheel") {
    payload = cmd;
  } else if (cmd.t === "key") {
    const vk = vkFor(cmd.key);
    if (!vk) {
      // حرف غير قياسي (عربي مثلاً) — نكتبه كنص عند الضغط فقط
      if (cmd.down && cmd.key && cmd.key.length === 1) {
        payload = { t: "text", s: escapeSendKeys(cmd.key) };
      }
    } else {
      payload = { t: "key", vk, down: !!cmd.down, ext: EXTENDED.has(cmd.key) };
    }
  } else if (cmd.t === "text" && typeof cmd.s === "string") {
    payload = { t: "text", s: escapeSendKeys(cmd.s) };
  }
  if (!payload) return;
  try {
    p.stdin.write(JSON.stringify(payload) + "\n");
  } catch {
    proc = null;
  }
}

function stopRemoteInput() {
  try {
    proc?.stdin?.end();
    proc?.kill();
  } catch {}
  proc = null;
}

module.exports = { handleRemoteInput, stopRemoteInput };
