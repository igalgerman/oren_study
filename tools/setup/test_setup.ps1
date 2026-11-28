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

# dry run lists every step and changes nothing
$out = & powershell -NoProfile -File (Join-Path $here 'setup.ps1') -DryRun | Out-String
foreach ($n in 1..6) { if ($out -notmatch "DRYRUN $n ") { $fail += "dry-run misses step $n" } }

# one repo name only
$lit = 'oren' + '_study'
$hits = @(Get-ChildItem $here -File | Select-String -SimpleMatch $lit -CaseSensitive | Where-Object { $_.Line -notmatch '^\$DefaultRepo' })
if ($hits.Count) { $fail += "hard-coded repo name in: " + (($hits | ForEach-Object { $_.Filename + ':' + $_.LineNumber }) -join ', ') }

if ($fail.Count) { $fail | ForEach-Object { Write-Host "FAIL $_" }; exit 1 }
Write-Host 'setup tests passed'
