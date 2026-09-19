param(
	[Parameter(Mandatory = $true)][string]$Hwnd,
	[Parameter(Mandatory = $true)][ValidateSet('attach', 'detach')][string]$Action,
	[int]$X = 0,
	[int]$Y = 0,
	[int]$Width = 0,
	[int]$Height = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class WebpaperDesktop {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int left;
        public int top;
        public int right;
        public int bottom;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    static IntPtr foundWorker;
    static EnumProc enumProc;

    public static IntPtr ParseHwnd(string text) {
        ulong value = ulong.Parse(text);
        return unchecked((IntPtr)(long)value);
    }

    public static IntPtr FindWorkerW() {
        foundWorker = IntPtr.Zero;
        IntPtr progman = FindWindow("Progman", null);
        IntPtr unused;
        if (progman != IntPtr.Zero) {
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 2, 1000, out unused);
        }
        enumProc = OnEnum;
        EnumWindows(enumProc, IntPtr.Zero);
        if (foundWorker != IntPtr.Zero) return foundWorker;
        return progman;
    }

    static bool OnEnum(IntPtr hwnd, IntPtr lParam) {
        IntPtr shell = FindWindowEx(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (shell != IntPtr.Zero) {
            IntPtr next = FindWindowEx(IntPtr.Zero, hwnd, "WorkerW", null);
            if (next != IntPtr.Zero) foundWorker = next;
        }
        return true;
    }

    public static string Attach(IntPtr child, int x, int y, int width, int height) {
        IntPtr parent = FindWorkerW();
        if (parent == IntPtr.Zero) return "NO_PARENT";
        SetParent(child, parent);
        RECT rect;
        int relX = x;
        int relY = y;
        if (GetWindowRect(parent, out rect)) {
            relX = x - rect.left;
            relY = y - rect.top;
        }
        SetWindowPos(child, IntPtr.Zero, relX, relY, width, height, 0x0010 | 0x0040);
        IntPtr style = GetWindowLongPtr(child, -20);
        long next = style.ToInt64() | 0x00000080 | 0x08000000;
        SetWindowLongPtr(child, -20, new IntPtr(next));
        return parent.ToInt64().ToString();
    }

    public static void Detach(IntPtr child) {
        SetParent(child, IntPtr.Zero);
    }
}
"@

$child = [WebpaperDesktop]::ParseHwnd($Hwnd)
if ($Action -eq 'detach') {
	[WebpaperDesktop]::Detach($child)
	Write-Output 'DETACHED'
	exit 0
}

$result = [WebpaperDesktop]::Attach($child, $X, $Y, $Width, $Height)
if ($result -eq 'NO_PARENT') {
	Write-Error 'Could not find the Windows desktop window.'
	exit 1
}

Write-Output "OK $result"
