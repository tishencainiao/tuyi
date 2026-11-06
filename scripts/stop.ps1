# 途忆 · 一键停止（双击桌面快捷方式时由 stop.vbs 调用）
# 可选环境变量：TUYI_QUIET=1 不弹窗（测试用）

$ErrorActionPreference = 'SilentlyContinue'
$port = 8787
$killed = 0

try {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -gt 0) {
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
      $killed += 1
    }
  }
} catch {
  $killed = 0
}

if ($env:TUYI_QUIET -eq '1') {
  if ($killed -gt 0) { Write-Host '[tuyi] 服务已停止' } else { Write-Host '[tuyi] 服务当前没有运行' }
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
if ($killed -gt 0) {
  [System.Windows.Forms.MessageBox]::Show('途忆服务已停止。', '途忆') | Out-Null
} else {
  [System.Windows.Forms.MessageBox]::Show('途忆服务当前没有在运行。', '途忆') | Out-Null
}
