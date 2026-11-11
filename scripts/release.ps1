# release.ps1 — 途忆发布入口（幂等补推）
# 功能：对比本地与远端，只推不一致的 ref（master + 本地 tag），每远端重试 3 次。
# 凭据：走 Windows 凭据管理器（wincred），Gitee/GitHub 的 HTTPS 凭据存在系统凭据里。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1                # 双远端
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Remotes gitee # 单远端
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -DryRun        # 只报告待推内容
param(
    [string[]]$Remotes = @('gitee', 'github'),
    [int]$Retries = 3,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Invoke-GitPush([string]$remote) {
    $missing = @()

    $localHead = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw "git rev-parse 失败，确认在仓库内运行" }

    # master：本地与远端不一致才推
    $remoteHead = @(git ls-remote --heads $remote master | ForEach-Object { ($_ -split "\s+")[0] })
    if ($remoteHead -notcontains $localHead) { $missing += 'master' }

    # tag：本地有、远端没有的才推（兼容带 ^{} 的注释 tag 行）
    $localTags = @(git tag)
    $remoteTags = @(git ls-remote --tags $remote | ForEach-Object {
            if ($_ -match 'refs/tags/([^^]+)(\^\{\})?$') { $matches[1] }
        })
    foreach ($tag in $localTags) {
        if ($tag -and $remoteTags -notcontains $tag) { $missing += $tag }
    }

    if ($missing.Count -eq 0) {
        Write-Host "[$remote] 已是最新，无需推送"
        return $true
    }

    Write-Host "[$remote] 待推送：$($missing -join ' ')"
    if ($DryRun) { return $true }

    for ($i = 1; $i -le $Retries; $i++) {
        git -c credential.helper=wincred push $remote $missing
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[$remote] 推送成功（第 $i 次尝试）"
            return $true
        }
        Write-Host "[$remote] 第 $i 次推送失败，5 秒后重试…"
        Start-Sleep -Seconds 5
    }
    Write-Host "[$remote] 重试 $Retries 次仍失败"
    return $false
}

$allOk = $true
foreach ($remote in $Remotes) {
    try {
        if (-not (Invoke-GitPush $remote)) { $allOk = $false }
    } catch {
        Write-Host "[$remote] 异常：$($_.Exception.Message)"
        $allOk = $false
    }
}

if (-not $allOk) { exit 1 }
Write-Host '发布完成 ✓'
