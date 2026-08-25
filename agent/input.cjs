// التحكم عن بعد في جهاز الموظف (ويندوز) — حل ثانٍ أسرع بكثير:
// نبني مرة واحدة ملفاً تنفيذياً صغيراً بلغة C# باستخدام مُصرِّف .NET المدمج
// في كل نسخة ويندوز (csc.exe)، ثم نشغّله كعملية دائمة تقرأ أوامر نصية
// خفيفة من stdin وتنفّذها فوراً عبر SendInput. هذا يلغي حمل PowerShell
// (بطء البدء + بطء حلقة ReadLine) وهو سبب تأخر الماوس.
// إن فشل التصريف لأي سبب نرجع تلقائياً لمسار PowerShell القديم.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CS = `
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;

class MagInput {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int cb);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  static int Size = Marshal.SizeOf(typeof(INPUT));

  static void Mouse(uint flags, uint data) {
    INPUT[] i = new INPUT[1];
    i[0].type = 0; i[0].u.mi.dwFlags = flags; i[0].u.mi.mouseData = data;
    SendInput(1, i, Size);
  }
  static void Key(ushort vk, bool down, bool ext) {
    INPUT[] i = new INPUT[1];
    i[0].type = 1; i[0].u.ki.wVk = vk;
    i[0].u.ki.dwFlags = (uint)((down ? 0 : 2) | (ext ? 1 : 0));
    SendInput(1, i, Size);
  }
  static void Unicode(ushort code) {
    INPUT[] i = new INPUT[2];
    i[0].type = 1; i[0].u.ki.wScan = code; i[0].u.ki.dwFlags = 4;
    i[1].type = 1; i[1].u.ki.wScan = code; i[1].u.ki.dwFlags = 4 | 2;
    SendInput(2, i, Size);
  }
  static void MoveTo(double fx, double fy) {
    int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
    SetCursorPos((int)(fx * w), (int)(fy * h));
  }
  static double D(string s) {
    double v; double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out v); return v;
  }
  static int I(string s) { int v; int.TryParse(s, out v); return v; }

  static int Main() {
    try { SetProcessDPIAware(); } catch {}
    Stream stdin = Console.OpenStandardInput();
    StreamReader r = new StreamReader(stdin, Encoding.ASCII, false, 4096);
    string line;
    while ((line = r.ReadLine()) != null) {
      if (line.Length < 1) continue;
      try {
        string[] p = line.Split(' ');
        switch (p[0]) {
          case "M": MoveTo(D(p[1]), D(p[2])); break;
          case "D": {
            if (p.Length >= 4) MoveTo(D(p[2]), D(p[3]));
            int b = I(p[1]);
            uint f = b == 2 ? 0x0008u : b == 1 ? 0x0020u : 0x0002u;
            Mouse(f, 0); break;
          }
          case "U": {
            int b = I(p[1]);
            uint f = b == 2 ? 0x0010u : b == 1 ? 0x0040u : 0x0004u;
            Mouse(f, 0); break;
          }
          case "W": Mouse(0x0800, unchecked((uint)I(p[1]))); break;
          case "K": Key((ushort)I(p[1]), p[2] == "1", p[3] == "1"); break;
          case "T": for (int i = 1; i < p.Length; i++) Unicode((ushort)I(p[i])); break;
        }
      } catch {}
    }
    return 0;
  }
}
`;

// مسار PowerShell كخطة بديلة فقط (أبطأ) — نفس البروتوكول النصي.
const PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MagInputPs {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] i, int cb);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  static int Size = Marshal.SizeOf(typeof(INPUT));
  public static void Mouse(uint flags, uint data) { INPUT[] i = new INPUT[1]; i[0].type = 0; i[0].u.mi.dwFlags = flags; i[0].u.mi.mouseData = data; SendInput(1, i, Size); }
  public static void Key(ushort vk, bool down, bool ext) { INPUT[] i = new INPUT[1]; i[0].type = 1; i[0].u.ki.wVk = vk; i[0].u.ki.dwFlags = (uint)((down ? 0 : 2) | (ext ? 1 : 0)); SendInput(1, i, Size); }
  public static void Unicode(ushort code) { INPUT[] i = new INPUT[2]; i[0].type = 1; i[0].u.ki.wScan = code; i[0].u.ki.dwFlags = 4; i[1].type = 1; i[1].u.ki.wScan = code; i[1].u.ki.dwFlags = 4 | 2; SendInput(2, i, Size); }
  public static void MoveTo(double fx, double fy) { int w = GetSystemMetrics(0); int h = GetSystemMetrics(1); SetCursorPos((int)(fx * w), (int)(fy * h)); }
}
'@

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Length -lt 1) { continue }
  try {
    $p = $line.Split(' ')
    switch ($p[0]) {
      'M' { [MagInputPs]::MoveTo([double]$p[1], [double]$p[2]) }
      'D' {
        if ($p.Length -ge 4) { [MagInputPs]::MoveTo([double]$p[2], [double]$p[3]) }
        $b = [int]$p[1]
        $f = 0x0002; if ($b -eq 2) { $f = 0x0008 } elseif ($b -eq 1) { $f = 0x0020 }
        [MagInputPs]::Mouse([uint32]$f, 0)
      }
      'U' {
        $b = [int]$p[1]
        $f = 0x0004; if ($b -eq 2) { $f = 0x0010 } elseif ($b -eq 1) { $f = 0x0040 }
        [MagInputPs]::Mouse([uint32]$f, 0)
      }
      'W' { [MagInputPs]::Mouse(0x0800, [uint32][int]$p[1]) }
      'K' { [MagInputPs]::Key([ushort][int]$p[1], ($p[2] -eq '1'), ($p[3] -eq '1')) }
      'T' { for ($i = 1; $i -lt $p.Length; $i++) { [MagInputPs]::Unicode([ushort][int]$p[$i]) } }
    }
  } catch { }
}
`;

let proc = null;
let helperPath = null;
let helperFailed = false;

function findCsc() {
  const root = process.env.SystemRoot || "C:\\Windows";
  const dirs = ["Framework64", "Framework"];
  for (const d of dirs) {
    const base = path.join(root, "Microsoft.NET", d);
    let vers = [];
    try {
      vers = fs.readdirSync(base).filter((v) => v.startsWith("v4.")).sort().reverse();
    } catch {
      continue;
    }
    for (const v of vers) {
      const csc = path.join(base, v, "csc.exe");
      if (fs.existsSync(csc)) return csc;
    }
  }
  return null;
}

/** يبني (مرة واحدة) ملف التحكم التنفيذي ويعيد مساره، أو null عند الفشل */
function buildHelper() {
  if (helperPath && fs.existsSync(helperPath)) return helperPath;
  if (helperFailed) return null;
  try {
    const dir = path.join(os.tmpdir(), "mag-input");
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, "mag-input-v2.exe");
    if (fs.existsSync(exe)) {
      helperPath = exe;
      return exe;
    }
    const csc = findCsc();
    if (!csc) {
      helperFailed = true;
      return null;
    }
    const src = path.join(dir, "mag-input-v2.cs");
    fs.writeFileSync(src, CS, "utf8");
    execFileSync(csc, ["/nologo", "/optimize+", "/target:exe", `/out:${exe}`, src], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 40000,
    });
    if (!fs.existsSync(exe)) {
      helperFailed = true;
      return null;
    }
    helperPath = exe;
    return exe;
  } catch {
    helperFailed = true;
    return null;
  }
}

let psPath = null;

function ensure() {
  if (process.platform !== "win32") return null;
  if (proc && !proc.killed) return proc;
  try {
    const exe = buildHelper();
    if (exe) {
      proc = spawn(exe, [], { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    } else {
      if (!psPath) {
        psPath = path.join(os.tmpdir(), "mag-input-" + process.pid + ".ps1");
        fs.writeFileSync(psPath, PS, "utf8");
      }
      proc = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psPath],
        { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
      );
    }
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

function writeRaw(line) {
  const p = ensure();
  if (!p || !p.stdin.writable) return;
  try {
    p.stdin.write(line + "\n", "ascii");
  } catch {
    proc = null;
  }
}

// الحركة: آخر موضع فقط هو المهم. نجمع الحركات في نفس دورة الحدث ونرسل
// الأخيرة فقط، فلا يتكوّن طابور مواضع قديمة عند ضعف الشبكة أو الرشقات
// السريعة. أما النقر والكيبورد فيُرسلان دائماً بلا إسقاط، وقبلهما نُفرغ
// الحركة المعلّقة للحفاظ على الترتيب الصحيح (اذهب ثم اضغط).
let pendingMove = null;
let flushScheduled = false;

function flushMove() {
  flushScheduled = false;
  if (pendingMove === null) return;
  const line = pendingMove;
  pendingMove = null;
  writeRaw(line);
}

function writeMove(line) {
  pendingMove = line;
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(flushMove);
}

/** أحداث موثوقة (نقر/مفاتيح/عجلة/نص) — تُرسل فوراً بعد إفراغ الحركة */
function write(line) {
  if (pendingMove !== null) flushMove();
  writeRaw(line);
}

// الحركة تُرسل فوراً — العملية الأصلية سريعة ولا تحتاج تجميع زمني،
// نحتفظ فقط بإسقاط الحركات المتطابقة لتقليل الضغط على القناة.
let lastX = -1;
let lastY = -1;

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
    if (x === lastX && y === lastY) return;
    lastX = x;
    lastY = y;
    writeMove(`M ${x.toFixed(5)} ${y.toFixed(5)}`);
    return;
  }
  if (cmd.t === "down" || cmd.t === "up") {
    const b = [0, 1, 2].includes(Number(cmd.b)) ? Number(cmd.b) : 0;
    const x = clamp01(cmd.x);
    const y = clamp01(cmd.y);
    if (cmd.t === "down") {
      if (x !== null && y !== null) {
        lastX = x;
        lastY = y;
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
      sendText(key);
    }
    return;
  }
  if (cmd.t === "text" && typeof cmd.s === "string") sendText(cmd.s);
}

function stopRemoteInput() {
  try {
    proc?.stdin?.end();
    proc?.kill();
  } catch {}
  proc = null;
  pendingMove = null;
  lastX = -1;
  lastY = -1;

}

module.exports = { handleRemoteInput, stopRemoteInput };
