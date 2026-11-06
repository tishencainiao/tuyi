# 途忆 · 一键启动（双击桌面快捷方式时由 launch.vbs 调用）
# 做三件事：检查服务是否在跑 → 没跑就后台启动 → 等端口就绪后打开网页。
# 可选环境变量：TUYI_NO_OPEN=1 只启动不打开浏览器；TUYI_QUIET=1 不弹窗（测试用）

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8787
$url = "http://127.0.0.1:$port/"
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-PortOpen([int]$p) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $p, $null, $null)
    $done = $async.AsyncWaitHandle.WaitOne(500, $false)
    $connected = $done -and $client.Connected
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Show-Tip([string]$message, [string]$title) {
  if ($env:TUYI_QUIET -eq '1') {
    Write-Host ('[tuyi] ' + $message)
    return
  }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, $title) | Out-Null
}

$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }
if (-not $node) {
  foreach ($candidate in @(
      'E:\Program Files\nodejs\node.exe',
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )) {
    if ($candidate -and (Test-Path $candidate)) { $node = $candidate; break }
  }
}
if (-not $node) {
  Show-Tip '没有找到 Node.js（需要 Node 18 或更高版本）。' '途忆启动失败'
  exit 1
}

if (-not (Test-PortOpen $port)) {
  $out = Join-Path $logDir 'server.out.log'
  $err = Join-Path $logDir 'server.err.log'
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-PortOpen $port) { break }
  }
}

if (-not (Test-PortOpen $port)) {
  Show-Tip ("服务没有启动成功。日志在：" + (Join-Path $logDir 'server.err.log')) '途忆启动失败'
  exit 1
}

if ($env:TUYI_NO_OPEN -ne '1') {
  Start-Process $url
}
