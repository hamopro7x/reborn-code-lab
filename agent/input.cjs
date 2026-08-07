// التحكم عن بعد في جهاز الموظف (ويندوز) بدون أي مكتبات أصلية.
// عملية PowerShell دائمة تقرأ أوامر نصية بسيطة (بدون JSON = أسرع بكثير)
// وتنفّذها عبر SendInput في user32.dll مع دعم كامل لليونيكود (عربي/إنجليزي).
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
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] i, int cb);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);

  static int Size = Marshal.SizeOf(typeof(INPUT));

  public static void Mouse(uint flags, uint data) {
    INPUT[] i = new INPUT[1];
    i[0].type = 0;
    i[0].u.mi.dwFlags = flags;
    i[0].u.mi.mouseData = data;
    SendInput(1, i, Size);
  }
  public static void Key(ushort vk, bool down, bool ext) {
    INPUT[] i = new INPUT[1];
    i[0].type = 1;
    i[0].u.ki.wVk = vk;
    i[0].u.ki.dwFlags = (uint)((down ? 0 : 2) | (ext ? 1 : 0));
    SendInput(1, i, Size);
  }
  public static void Unicode(ushort code) {
    INPUT[] i = new INPUT[2];
    i[0].type = 1; i[0].u.ki.wScan = code; i[0].u.ki.dwFlags = 4;
    i[1].type = 1; i[1].u.ki.wScan = code; i[1].u.ki.dwFlags = 4 | 2;
    SendInput(2, i, Size);
  }
  public static void MoveTo(double fx, double fy) {
    int w = GetSystemMetrics(0); int h = GetSystemMetrics(1);
    SetCursorPos((int)(fx * w), (int)(fy * h));
  }
}
'@

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Length -lt 1) { continue }
  try {
    $p = $line.Split(' ')
    switch ($p[0]) {
      'M' { [MagInput]::MoveTo([double]$p[1], [double]$p[2]) }
      'D' {
        if ($p.Length -ge 4) { [MagInput]::MoveTo([double]$p[2], [double]$p[3]) }
        $b = [int]$p[1]
        $f = 0x0002; if ($b -eq 2) { $f = 0x0008 } elseif ($b -eq 1) { $f = 0x0020 }
        [MagInput]::Mouse([uint32]$f, 0)
      }
      'U' {
        $b = [int]$p[1]
        $f = 0x0004; if ($b -eq 2) { $f = 0x0010 } elseif ($b -eq 1) { $f = 0x0040 }
        [MagInput]::Mouse([uint32]$f, 0)
      }
      'W' { [MagInput]::Mouse(0x0800, [uint32][int]$p[1]) }
      'K' { [MagInput]::Key([ushort][int]$p[1], ($p[2] -eq '1'), ($p[3] -eq '1')) }
      'T' { for ($i = 1; $i -lt $p.Length; $i++) { [MagInput]::Unicode([ushort][int]$p[$i]) } }
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
    proc.stdin.setDefaultEncoding("ascii");
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
};
const EXTENDED = new Set([
  "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End",
  "PageUp", "PageDown", "Insert", "Delete",
]);

function write(line) {
  const p = ensure();
  if (!p || !p.stdin.writable) return;
  try {
    p.stdin.write(line + "\n", "ascii");
  } catch {
    proc = null;
  }
}

// تجميع حركة الماوس: نرسل آخر إحداثي فقط كل 6ms لتفادي تراكم الأوامر
let pendingMove = null;
let moveTimer = null;
let lastMoveAt = 0;

function flushMove() {
  moveTimer = null;
  if (!pendingMove) return;
  const m = pendingMove;
  pendingMove = null;
  lastMoveAt = Date.now();
  write(`M ${m.x.toFixed(5)} ${m.y.toFixed(5)}`);
}

function queueMove(x, y) {
  pendingMove = { x, y };
  const since = Date.now() - lastMoveAt;
  if (since >= 6) {
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
    flushMove();
  } else if (!moveTimer) {
    moveTimer = setTimeout(flushMove, 6 - since);
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function sendText(s) {
  const codes = [];
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      // زوج بديل (إيموجي)
      const v = cp - 0x10000;
      codes.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else if (cp >= 32 || cp === 9) {
      codes.push(cp);
    }
  }
  for (let i = 0; i < codes.length; i += 24) {
    write("T " + codes.slice(i, i + 24).join(" "));
  }
}

/** ينفّذ أمر تحكم واحد وارد من لوحة الإدارة */
function handleRemoteInput(cmd) {
  if (!cmd || typeof cmd !== "object") return;
  if (cmd.t === "move") {
    const x = clamp01(cmd.x);
    const y = clamp01(cmd.y);
    if (x === null || y === null) return;
    queueMove(x, y);
    return;
  }
  if (cmd.t === "down" || cmd.t === "up") {
    const b = [0, 1, 2].includes(Number(cmd.b)) ? Number(cmd.b) : 0;
    const x = clamp01(cmd.x);
    const y = clamp01(cmd.y);
    if (cmd.t === "down") {
      if (x !== null && y !== null) {
        pendingMove = null;
        write(`D ${b} ${x.toFixed(5)} ${y.toFixed(5)}`);
      } else {
        write(`D ${b}`);
      }
    } else {
      write(`U ${b}`);
    }
    return;
  }
  if (cmd.t === "wheel") {
    const d = Math.max(-1200, Math.min(1200, Math.round(Number(cmd.d) || 0)));
    if (d) write(`W ${d}`);
    return;
  }
  if (cmd.t === "key") {
    const key = cmd.key;
    const vk = VK[key];
    if (vk) {
      write(`K ${vk} ${cmd.down ? 1 : 0} ${EXTENDED.has(key) ? 1 : 0}`);
    } else if (cmd.down && typeof key === "string" && [...key].length === 1) {
      // أي حرف (عربي/إنجليزي/رمز) يُكتب كيونيكود مضمون
      sendText(key);
    }
    return;
  }
  if (cmd.t === "text" && typeof cmd.s === "string") sendText(cmd.s);
}

function stopRemoteInput() {
  try {
    if (moveTimer) clearTimeout(moveTimer);
  } catch {}
  moveTimer = null;
  pendingMove = null;
  try {
    proc?.stdin?.end();
    proc?.kill();
  } catch {}
  proc = null;
}

module.exports = { handleRemoteInput, stopRemoteInput };
