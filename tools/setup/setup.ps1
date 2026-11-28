# PC setup (#865, #889): sets the repo-local git e-mail of every clone to the noreply address (GitHub e-mail privacy push-block).
# Usage: powershell tools/setup/setup.ps1 [-Check]   (-Check only reports a mismatch, changes nothing)
param([switch]$Check, [string]$Root = "C:/work")
$cfg = Get-Content (Join-Path $PSScriptRoot "../runner/config.toml") -Raw
$email = [regex]::Match($cfg, 'git_email\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $email) { Write-Error "git_email missing in tools/runner/config.toml"; exit 2 }
$clones = @("Oren_study/a", "sw-factory", "learn-quest", "family-vault")
$bad = 0
foreach ($c in $clones) {
  $dir = Join-Path $Root $c
  if (-not (Test-Path (Join-Path $dir ".git"))) { Write-Host "skip   $c (no clone)"; continue }
  $cur = (git -C $dir config --local user.email) 2>$null
  if ($cur -eq $email) { Write-Host "ok     $c"; continue }
  if ($Check) { Write-Host "MISMATCH $c (has '$cur')"; $bad++ }
  else { git -C $dir config --local user.email $email; Write-Host "set    $c" }
}
exit $(if ($bad) { 1 } else { 0 })
