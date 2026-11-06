# 途忆 · 在桌面生成快捷方式
#   powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1
# 生成：
#   途忆（启动并打开网页）.lnk   —— 后台启动服务 + 打开 http://127.0.0.1:8787/
#   途忆（打开网页）.url         —— 只打开网页（服务需已在运行）
#   途忆（停止服务）.lnk         —— 停止后台服务

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $desktop)) { throw "找不到桌面目录：$desktop" }

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

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$launchVbs = Join-Path $root 'scripts\launch.vbs'
$stopVbs = Join-Path $root 'scripts\stop.vbs'
$shell = New-Object -ComObject WScript.Shell

function New-DesktopShortcut([string]$name, [string]$target, [string]$arguments, [string]$description, [string]$iconPath) {
  $path = Join-Path $desktop ($name + '.lnk')
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = $description
  if ($iconPath -and (Test-Path $iconPath)) { $shortcut.IconLocation = $iconPath + ',0' }
  $shortcut.Save()
  return $path
}

$created = @()
$created += New-DesktopShortcut '途忆（启动并打开网页）' $wscript ('"' + $launchVbs + '"') '后台启动途忆服务，等端口就绪后自动打开聊天页面' $node
$created += New-DesktopShortcut '途忆（停止服务）' $wscript ('"' + $stopVbs + '"') '停止途忆后台服务（端口 8787）' $node

$urlPath = Join-Path $desktop '途忆（打开网页）.url'
$urlContent = @(
  '[InternetShortcut]',
  'URL=http://127.0.0.1:8787/',
  'IconIndex=0'
)
Set-Content -Path $urlPath -Value $urlContent -Encoding ASCII
$created += $urlPath

Write-Host '已在桌面生成：'
foreach ($path in $created) { Write-Host ('  ' + $path) }
