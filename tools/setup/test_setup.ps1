# Tests for setup.ps1 helpers (#865): powershell -File tools\setup\test_setup.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'setup.ps1')
$fail = @()
function Eq($name, $got, $want) { if ("$got" -ne "$want") { $script:fail += "$name`: got '$got' want '$want'" } }
$name = 'owner/new-name'

# remote URL fix decision
Eq 'remote same https' (Get-RemoteFix "https://github.com/$name.git" $name) ''
Eq 'remote same ssh' (Get-RemoteFix "git@github.com:$name.git" $name) ''
Eq 'remote old name' (Get-RemoteFix 'https://github.com/owner/old-name.git' $name) (Get-RepoUrl $name)
Eq 'remote none' (Get-RemoteFix '' $name) (Get-RepoUrl $name)

# config read
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cfg-" + [guid]::NewGuid() + '.toml')
Set-Content $tmp "repo = `"owner/x`"   # c`nmax_core = 5  # n`nhc = `"C:/Users/bob/a.exe`"`n# comment = 1"
$c = Read-Config $tmp; Remove-Item $tmp
Eq 'cfg repo' $c.repo 'owner/x'; Eq 'cfg number' $c.max_core '5'; Eq 'cfg none' $c.comment ''

# user mismatch + msys path + shim
Eq 'user other' (Get-UserMismatch 'C:/Users/bob/a.exe' 'alice') 'bob'
Eq 'user same' (Get-UserMismatch 'C:/Users/alice/a.exe' 'alice') ''
Eq 'user none' (Get-UserMismatch 'C:/work/x' 'alice') ''
Eq 'msys' (ConvertFrom-MsysPath '/c/work/bin') 'C:/work/bin'
Eq 'shim' (Get-ShimContent 'C:\Users\a\miniforge3\python.exe') "#!/usr/bin/env bash`nexec `"C:/Users/a/miniforge3/python.exe`" `"`$@`"`n"
Eq 'shim lf' (Get-ShimContent 'x').Contains("`r") 'False'

# ---- dry run + -Check with mock tools (#868): runs on Windows or pwsh on Linux ----
$ps = (Get-Process -Id $PID).Path
$win = ($env:OS -eq 'Windows_NT')
$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ("setup-test-" + [guid]::NewGuid())
$shimDir = Join-Path $tmpRoot 'shims'; New-Item -ItemType Directory -Force $shimDir | Out-Null
$log = Join-Path $tmpRoot 'calls.log'; New-Item -ItemType File -Force $log | Out-Null
if (-not $win) {
  # every mock only records its call line; `git remote get-url origin` answers from $MOCK_ORIGIN
  foreach ($t in 'git', 'gh', 'hc', 'schtasks', 'winget', 'claude') {
    $f = Join-Path $shimDir $t
    "#!/bin/sh`necho `"$t `$*`" >> `"$log`"`nif [ `"$t`" = git ] && [ `"`$3`" = remote ] && [ `"`$4`" = get-url ]; then echo `"`$MOCK_ORIGIN`"; fi`nif [ `"$t`" = git ] && [ `"`$3`" = config ] && [ `"`$4`" = --local ]; then echo false; fi`nexit 0`n" | Set-Content -NoNewline -Path $f
    & chmod +x $f
  }
}
$repoDir = Join-Path $tmpRoot 'checkout'; New-Item -ItemType Directory -Force (Join-Path $repoDir '.git') | Out-Null
$secHome = Join-Path $tmpRoot 'home'; New-Item -ItemType Directory -Force (Join-Path $secHome '.oren') | Out-Null
$fakeSecret = 'FAKE-SECRET-VALUE-9f3a1c'
$cfgFile = Join-Path $tmpRoot 'config.toml'
function Write-Cfg($repo) { Set-Content $cfgFile "repo = `"$repo`"`nmain_checkout = `"$($repoDir -replace '\\','/')`"`ngithub_app_key = `"$(($secHome -replace '\\','/'))/.oren/app.pem`"`n" }
function Run-Setup([string[]]$a, [string]$origin) {
  $env:MOCK_ORIGIN = $origin; $env:HOME = $secHome; $env:USERPROFILE = $secHome
  $oldPath = $env:PATH; if (-not $win) { $env:PATH = $shimDir + [IO.Path]::PathSeparator + $env:PATH }
  try { return (& $ps -NoProfile -File (Join-Path $here 'setup.ps1') -ConfigPath $cfgFile @a 2>&1 | Out-String) } finally { $env:PATH = $oldPath }
}
function Writes-In-Log {
  $pat = '^(git (clone|remote (set-url|add)|config (?!--local core\.autocrlf$|--local user\.email$))|winget |schtasks .*/(Create|Delete)|claude |gh (?!auth status))'
  return @(Get-Content $log | Where-Object { $_ -match $pat })
}

# 1) normal dry run: every step listed, origin already right, no write call
Write-Cfg 'owner/new-name'
$out = Run-Setup @('-DryRun') 'https://github.com/owner/new-name.git'
foreach ($n in 1..6) { if ($out -notmatch "DRYRUN $n ") { $fail += "dry-run misses step $n" } }
foreach ($w in 'git clone|origin', 'recover\.py --open', 'recover\.cmd --install', 'beatcheck\.py --install') { if ($out -notmatch $w) { $fail += "dry-run output misses '$w'" } }
if ($out -match 'set-url') { $fail += 'dry run plans a remote fix though origin is right' }
if (-not $win -and -not (Select-String -Path $log -SimpleMatch 'remote get-url')) { $fail += 'mock git was not used' }
if (Writes-In-Log) { $fail += 'dry run made a write call: ' + ((Writes-In-Log) -join '; ') }

# 2) origin on an old repo name: the plan has the set-url fix, still no real write
$out = Run-Setup @('-DryRun') 'https://github.com/owner/old-name.git'
if ($out -notmatch 'git remote set-url origin https://github\.com/owner/new-name\.git') { $fail += 'old origin: no set-url fix planned' }
if (Writes-In-Log) { $fail += 'old-origin dry run made a write call' }

# 3) repo value changed: only the new name in the plan
Write-Cfg 'owner/sw-factory'
$out = Run-Setup @('-DryRun') 'https://github.com/owner/old-name.git'
if ($out -notmatch 'owner/sw-factory') { $fail += 'new repo name not in the plan' }
if ($out -match ('(?i)oren' + '_study')) { $fail += 'old repo name in the plan after the repo value changed' }

# 4) -Check: secrets present / missing, never the value
$tel = Join-Path $secHome '.oren/telegram.env'; $dk = Join-Path $secHome '.oren/diag.key'
Set-Content $tel "TOKEN=$fakeSecret"; Set-Content $dk $fakeSecret
Set-Content (Join-Path $secHome '.oren/app.pem') $fakeSecret
$out = Run-Setup @('-Check') ''
if ($LASTEXITCODE -ne 0 -or $out -cmatch 'MISSING') { $fail += "-Check all present: expected no MISSING / exit 0 (exit $LASTEXITCODE)" }
Remove-Item $dk
$out = Run-Setup @('-Check') ''
if ($LASTEXITCODE -eq 0 -or $out -notmatch 'MISSING secret diag\.key') { $fail += '-Check with a missing file must report it and exit 1' }
if ($out -match [regex]::Escape($fakeSecret)) { $fail += '-Check printed a secret value' }
Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue

# one repo name only
$lit = 'oren' + '_study'
$hits = @(Get-ChildItem $here -File | Select-String -SimpleMatch $lit -CaseSensitive | Where-Object { $_.Line -notmatch '^\$DefaultRepo' })
if ($hits.Count) { $fail += "hard-coded repo name in: " + (($hits | ForEach-Object { $_.Filename + ':' + $_.LineNumber }) -join ', ') }

if ($fail.Count) { $fail | ForEach-Object { Write-Host "FAIL $_" }; exit 1 }
Write-Host 'setup tests passed'
exit 0   # a stale $LASTEXITCODE from the last -Check run must not leak out (#868)
