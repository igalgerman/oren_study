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

# secrets -Check (#867): temp HOME with fake files; no value may appear in the output
$th = Join-Path ([IO.Path]::GetTempPath()) ("home-" + [guid]::NewGuid()); $tc = Join-Path $th 'checkout'
New-Item -ItemType Directory -Force -Path (Join-Path $th '.oren'), $tc | Out-Null
$fake = 'FAKE-SECRET-' + [guid]::NewGuid()
Set-Content (Join-Path $th '.oren/app.pem') $fake
Set-Content (Join-Path $th '.oren/telegram.env') "TELEGRAM_BOT_TOKEN=$fake`nTELEGRAM_CHAT_ID="
New-Item -ItemType File (Join-Path $th '.oren/diag.key') | Out-Null
Set-Content (Join-Path $tc '.env') "CLOUDFLARE_API_TOKEN=$fake"
$cfgf = Join-Path $th 'c.toml'; Set-Content $cfgf "github_app_id = 1"
$it = @{}; foreach ($i in $SecretItems) { $it[$i.Id] = $i }
$cf = Read-Config $cfgf
Eq 'item present' (Get-ItemState $it['app.pem'] $th $tc $cf).Status 'present'
Eq 'item empty' (Get-ItemState $it['diag.key'] $th $tc $cf).Status 'empty'
Eq 'item missing' (Get-ItemState $it['private_names.txt'] $th $tc $cf).Status 'missing'
$tg = Get-ItemState $it['telegram.env'] $th $tc $cf
Eq 'keys status' $tg.Status 'missing'; Eq 'keys missing names' ($tg.Missing -join ',') 'TELEGRAM_CHAT_ID'
Eq 'checkout env' (Get-ItemState $it['.env'] $th $tc $cf).Status 'present'
Eq 'dir missing' (Get-ItemState $it['playlog'] $th $tc $cf).Status 'missing'
New-Item -ItemType Directory (Join-Path $th '.oren/playlog') | Out-Null
Eq 'dir empty' (Get-ItemState $it['playlog'] $th $tc $cf).Status 'empty'
$ai = Get-ItemState $it['app-ids'] $th $tc $cf
Eq 'ids missing' ($ai.Missing -join ',') 'github_app_installation_id'
$out = & powershell -NoProfile -File (Join-Path $here 'setup.ps1') -Check -HomeDir $th -CheckoutDir $tc -ConfigPath $cfgf 2>&1 | Out-String
Eq 'check exit 1 when missing' $LASTEXITCODE 1
if ($out -match 'not recognized') { $fail += '-Check run printed a PowerShell error: ' + $out }
if ($out.Contains($fake)) { $fail += 'a secret value appears in the -Check output' }
foreach ($i in $SecretItems) { if ($out -notmatch [regex]::Escape($i.Id)) { $fail += "-Check output misses item $($i.Id)" } }
if ($out -notmatch 'TELEGRAM_CHAT_ID') { $fail += '-Check does not name the missing key' }

# gh / claude logged in: fake shims that exit 0 / 1 (Windows .cmd) -> present / missing
if ($env:OS -eq 'Windows_NT') {
  $sd = Join-Path ([IO.Path]::GetTempPath()) ("shim-" + [guid]::NewGuid()); New-Item -ItemType Directory -Force -Path $sd | Out-Null
  Set-Content (Join-Path $sd 'gh.cmd') '@exit /b 0'; Set-Content (Join-Path $sd 'claude.cmd') '@exit /b 1'
  $oldPath = $env:PATH; $env:PATH = "$sd;$oldPath"
  $o2 = & powershell -NoProfile -File (Join-Path $here 'setup.ps1') -Check -HomeDir $th -CheckoutDir $tc -ConfigPath $cfgf 2>&1 | Out-String
  $env:PATH = $oldPath; Remove-Item -Recurse -Force $sd
  if ($o2 -notmatch 'present\s+gh-login') { $fail += 'gh logged in should read present' }
  if ($o2 -notmatch 'missing\s+claude-login') { $fail += 'claude not logged in should read missing' }
}
Remove-Item -Recurse -Force $th

# the Hebrew checklist has every item of the table, at most 10 rows
$doc = Get-Content -Raw -Encoding UTF8 (Join-Path $here '..\..\docs\setup-secrets.he.md')
foreach ($i in $SecretItems) { if (-not $doc.Contains('`' + $i.Id + '`')) { $fail += "docs/setup-secrets.he.md misses item $($i.Id)" } }
if (@($doc -split "`n" | Where-Object { $_ -match '^\|\s*`' }).Count -gt 10) { $fail += 'checklist has more than 10 rows' }
if ($doc -notmatch 'SecretItems') { $fail += 'the doc does not name the table $SecretItems' }

if ($fail.Count) { $fail | ForEach-Object { Write-Host "FAIL $_" }; exit 1 }
Write-Host 'setup tests passed'
