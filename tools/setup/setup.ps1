# PC setup (#865): one idempotent script rebuilds the PC. PowerShell 5.1 and 7.
#   powershell -File tools\setup\setup.ps1 [-Install] [-DryRun] [-Repo owner/name]
#   powershell -File tools\setup\setup.ps1 -Check     (#867: secrets present / missing / empty; never prints a value)
# Each step prints OK / FIXED / MISSING <what to do>. Never prints, copies or creates a secret.
param([switch]$Install, [switch]$DryRun, [switch]$Check, [string]$Repo = '', [string]$ConfigPath = '', [string]$HomeDir = '', [string]$CheckoutDir = '')

$DefaultRepo = 'igalgerman/oren_study'      # the ONE hard-coded repo name; config.toml `repo` wins inside a checkout
$DefaultRoot = 'C:/work/Oren_study'         # only used when no config.toml is found (fresh PC, script run alone)

# ---------- pure helpers (tested by test_setup.ps1) ----------
function Read-Config([string]$Path) {
  $c = @{}
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $c }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]*)"') { $c[$Matches[1]] = $Matches[2] }
    elseif ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*([^\s#]+)') { $c[$Matches[1]] = $Matches[2] }
  }
  return $c
}

function Get-RepoUrl([string]$Repo) { return "https://github.com/$Repo.git" }

# $null = origin already points at $Repo (https or ssh); else the URL origin must get.
function Get-RemoteFix([string]$Current, [string]$Repo) {
  if ($Current -match 'github\.com[:/](.+?)(\.git)?/?$' -and $Matches[1] -eq $Repo) { return $null }
  return (Get-RepoUrl $Repo)
}

function Get-ShimContent([string]$PythonExe) {
  $p = $PythonExe -replace '\\', '/'
  return "#!/usr/bin/env bash`nexec `"$p`" `"`$@`"`n"
}

function ConvertFrom-MsysPath([string]$P) {
  if ($P -match '^/([a-zA-Z])/(.*)$') { return ($Matches[1].ToUpper() + ':/' + $Matches[2]) }
  return $P
}

# A path under another Windows user than $User -> that user name, else $null.
function Get-UserMismatch([string]$Path, [string]$User) {
  if ($Path -match '^[A-Za-z]:[\\/]Users[\\/]([^\\/]+)[\\/]' -and $Matches[1] -ne $User) { return $Matches[1] }
  return $null
}

function Get-RepoDirs($Cfg, [string]$Repo, [string]$Root) {
  $dirs = @{}
  $dirs[$Repo] = $(if ($Cfg.main_checkout) { $Cfg.main_checkout } else { "$Root/a" })
  foreach ($k in 'game_repo', 'data_repo') {
    if ($Cfg[$k]) { $dirs[$Cfg[$k]] = "$Root/" + ($Cfg[$k] -split '/')[-1] }
  }
  return $dirs
}

function Get-Plan([bool]$Install) {
  return @(
    "1 tools: check git, gh, node >= 22, claude, miniforge python 3.12, herdr core + app" + $(if ($Install) { " (winget install what is missing)" } else { " (install only with -Install)" }),
    "2 folders: work folder, bin\python3 shim, %USERPROFILE%\.oren (empty)",
    "3 repo: clone the checkouts when missing, core.autocrlf false, fix an old origin URL",
    "4 herdr: start the app, check the spaces, python tools\runner\recover.py --open",
    "5 scheduled tasks: tools\recover.cmd --install, tools\runner\beatcheck.py --install",
    "6 verify: re-check everything, print the summary table"
  )
}

# ---------- secrets (#867): THE one table; docs/setup-secrets.he.md has one row per Id ----------
# Kind: file = a file with content; keys = key=value file, Keys must all be set; dir = a folder; gh / claude = login state; appids = config.toml keys.
$SecretItems = @(
  @{ Id = 'app.pem';          Kind = 'file';   Path = '.oren/app.pem';           Required = $true  },
  @{ Id = 'telegram.env';     Kind = 'keys';   Path = '.oren/telegram.env';      Required = $true;  KeyNames = @('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID') },
  @{ Id = 'diag.key';         Kind = 'file';   Path = '.oren/diag.key';          Required = $true  },
  @{ Id = 'private_names.txt'; Kind = 'file';  Path = '.oren/private_names.txt'; Required = $true  },
  @{ Id = 'playlog';          Kind = 'dir';    Path = '.oren/playlog';           Required = $false },
  @{ Id = '.env';             Kind = 'keys';   Path = '.env';                    Required = $false; KeyNames = @('CLOUDFLARE_API_TOKEN'); InCheckout = $true },
  @{ Id = 'gh-login';         Kind = 'gh';     Required = $true  },
  @{ Id = 'claude-login';     Kind = 'claude'; Required = $true  },
  @{ Id = 'app-ids';          Kind = 'appids'; Required = $true;  KeyNames = @('github_app_id', 'github_app_installation_id') }
)

# Names of the keys set (non-empty) in a key=value file text; values are never kept.
function Get-KeyNamesSet([string]$Text) {
  $names = @()
  foreach ($line in ($Text -split "`n")) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$') {
      $v = $Matches[2].Trim('"', "'", ' ')
      if ($v.Length -gt 0) { $names += $Matches[1] }
    }
  }
  return $names
}

# Status of a file-ish item: Status present|missing|empty, Missing = key NAMES that are not set. No value leaves this function.
function Get-ItemState($Item, [string]$HomeDir, [string]$CheckoutDir, $Cfg) {
  $r = @{ Status = 'missing'; Missing = @() }
  $base = $(if ($Item.InCheckout) { $CheckoutDir } else { $HomeDir })
  switch ($Item.Kind) {
    'appids' { $miss = @($Item.KeyNames | Where-Object { -not $Cfg[$_] }); $r.Missing = $miss; $r.Status = $(if ($miss.Count) { 'missing' } else { 'present' }); return $r }
    'dir' {
      $d = Join-Path $base $Item.Path
      if (-not (Test-Path -LiteralPath $d -PathType Container)) { return $r }
      $r.Status = $(if (@(Get-ChildItem -LiteralPath $d -Force).Count) { 'present' } else { 'empty' }); return $r
    }
    'file' {
      $f = Join-Path $base $Item.Path
      if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return $r }
      $r.Status = $(if ((Get-Item -LiteralPath $f).Length -gt 0 -and ([IO.File]::ReadAllText($f)).Trim().Length -gt 0) { 'present' } else { 'empty' }); return $r
    }
    'keys' {
      $f = Join-Path $base $Item.Path
      if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return $r }
      $set = @(Get-KeyNamesSet ([IO.File]::ReadAllText($f)))
      $r.Missing = @($Item.KeyNames | Where-Object { $set -notcontains $_ })
      if ($set.Count -eq 0) { $r.Status = 'empty' } elseif ($r.Missing.Count) { $r.Status = 'missing' } else { $r.Status = 'present' }
      return $r
    }
  }
  return $r
}

if ($MyInvocation.InvocationName -eq '.') { return }   # dot-sourced by the test: helpers only

# ---------- run ----------
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $here '..\runner\config.toml' }
$cfg = Read-Config $ConfigPath
if (-not $Repo) { $Repo = $(if ($cfg.repo) { $cfg.repo } else { $DefaultRepo }) }
$user = $env:USERNAME
$main = $(if ($cfg.main_checkout) { $cfg.main_checkout } else { "$DefaultRoot/a" })
$root = (Split-Path -Parent $main) -replace '\\', '/'
$results = New-Object System.Collections.ArrayList

if ($Check) {
  if (-not $HomeDir) { $HomeDir = $env:USERPROFILE }
  if (-not $CheckoutDir) { $CheckoutDir = (Resolve-Path (Join-Path $here '..\..')).Path }
  Write-Host "CHECK secrets (names and state only, no value is read out or printed)"
  $bad = 0
  foreach ($it in $SecretItems) {
    $st = 'missing'; $miss = @()
    if ($it.Kind -eq 'gh') {
      if (Have 'gh') { & gh auth status 2>&1 | Out-Null; $st = $(if ($LASTEXITCODE -eq 0) { 'present' } else { 'missing' }) }
    } elseif ($it.Kind -eq 'claude') {
      if (Have 'claude') { & claude auth status 2>&1 | Out-Null; $st = $(if ($LASTEXITCODE -eq 0) { 'present' } else { 'missing' }) }
    } else {
      $r = Get-ItemState $it $HomeDir $CheckoutDir $cfg
      $st = $r.Status; $miss = @($r.Missing)
    }
    $note = $(if ($miss.Count) { ' missing keys: ' + ($miss -join ', ') } else { '' })
    $req = $(if ($it.Required) { 'required' } else { 'optional' })
    Write-Host ("{0,-8} {1} ({2}){3}" -f $st, $it.Id, $req, $note)
    if ($it.Required -and $st -ne 'present') { $bad++ }
  }
  if ($bad) { Write-Host "$bad required item(s) not present: see docs/setup-secrets.he.md"; exit 1 }
  Write-Host 'all required secrets present'
  exit 0
}

if ($DryRun) {
  Write-Host "DRY RUN: nothing is changed (repo $Repo)"
  foreach ($p in (Get-Plan $Install.IsPresent)) { Write-Host "DRYRUN $p" }
  exit 0
}

function Add-Result([string]$Step, [string]$Name, [string]$Status, [string]$Hint = '') {
  [void]$results.Add([pscustomobject]@{ Step = $Step; Name = $Name; Status = $Status; Hint = $Hint })
  Write-Host ("{0,-7} {1}: {2} {3}" -f $Status, $Step, $Name, $Hint)
}
function Have([string]$cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget-Or-Page([string]$Id, [string]$Page, [string]$Name, [string]$Step, [scriptblock]$Probe = $null) {
  if ($Install -and $Id -and (Have 'winget')) {
    & winget install --id $Id -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    if ($LASTEXITCODE -ne 0) { Add-Result $Step $Name 'MISSING' "winget install $Id failed (exit $LASTEXITCODE): download $Page"; return }
    if ($Probe -and -not (& $Probe)) { Add-Result $Step $Name 'MISSING' "installed $Id but it is not on PATH yet: open a new shell and rerun"; return }
    Add-Result $Step $Name 'FIXED' "installed $Id"
  } else { Add-Result $Step $Name 'MISSING' "install it (rerun with -Install) or download: $Page" }
}
function Path-Check([string]$Key, [string]$Path) {
  $bad = Get-UserMismatch $Path $user
  if ($bad) { Add-Result 'paths' $Key 'MISSING' "config.toml key '$Key' points under user '$bad', you are '$user': edit it"; return $false }
  return $true
}

function Step-Tools {
  $s = '1 tools'
  if (Have 'git') { Add-Result $s 'git' 'OK' } else { Winget-Or-Page 'Git.Git' 'https://git-scm.com/download/win' 'git' $s { Have 'git' } }
  if (Have 'gh') {
    & gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Add-Result $s 'gh' 'OK' } else { Add-Result $s 'gh' 'MISSING' 'run: gh auth login' }
  } else { Winget-Or-Page 'GitHub.cli' 'https://cli.github.com' 'gh' $s { Have 'gh' } }
  if (Have 'node') {
    $v = (& node --version) -replace '^v', ''
    if ([int]($v -split '\.')[0] -ge 22) { Add-Result $s 'node' 'OK' "v$v" } else { Winget-Or-Page 'OpenJS.NodeJS' 'https://nodejs.org' 'node (>= 22)' $s { Have 'node' } }
  } else { Winget-Or-Page 'OpenJS.NodeJS' 'https://nodejs.org' 'node (>= 22)' $s { Have 'node' } }
  if (Have 'claude') { Add-Result $s 'claude' 'OK' } else { Add-Result $s 'claude' 'MISSING' 'run: npm install -g @anthropic-ai/claude-code' }
  $py = Join-Path $env:USERPROFILE 'miniforge3\python.exe'
  if (Test-Path $py) { Add-Result $s 'python' 'OK' $py } else { Winget-Or-Page 'CondaForge.Miniforge3' 'https://conda-forge.org/download/' 'miniforge python 3.12' $s { Test-Path $py } }
  $hc = $(if ($cfg.hc) { $cfg.hc } else { Join-Path $env:LOCALAPPDATA 'Programs\herdr-core\hc.exe' })
  if (Path-Check 'hc' $hc) {
    if (Test-Path -LiteralPath $hc) { Add-Result $s 'herdr core' 'OK' } else { Add-Result $s 'herdr core' 'MISSING' "install herdr core (https://herdr.dev, expected $hc; config.toml key hc)" }
  }
  $app = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
  if (Test-Path $app) { Add-Result $s 'herdr app' 'OK' } else { Add-Result $s 'herdr app' 'MISSING' "install the herdr app (expected $app)" }
}

function Step-Folders {
  $s = '2 folders'
  $bin = ConvertFrom-MsysPath $(if ($cfg.extra_path) { $cfg.extra_path } else { "$root/bin" })
  foreach ($d in @($root, $bin, (Join-Path $env:USERPROFILE '.oren'))) {
    if (Test-Path -LiteralPath $d) { Add-Result $s $d 'OK' } else { New-Item -ItemType Directory -Force -Path $d | Out-Null; Add-Result $s $d 'FIXED' 'created' }
  }
  $py = Join-Path $env:USERPROFILE 'miniforge3\python.exe'
  $shim = Join-Path $bin 'python3'
  $want = Get-ShimContent $py
  $have = $(if (Test-Path -LiteralPath $shim) { [IO.File]::ReadAllText($shim) } else { '' })
  if ($have -eq $want) { Add-Result $s 'python3 shim' 'OK' }
  else { [IO.File]::WriteAllText($shim, $want, (New-Object Text.UTF8Encoding($false))); Add-Result $s 'python3 shim' 'FIXED' $shim }
}

function Step-Repo {
  $s = '3 repo'
  if (-not (Have 'git')) { Add-Result $s 'checkouts' 'MISSING' 'git is missing (step 1)'; return }
  foreach ($e in (Get-RepoDirs $cfg $Repo $root).GetEnumerator()) {
    $name = $e.Key; $dir = $e.Value
    if (-not (Path-Check "checkout $name" $dir)) { continue }
    if (-not (Test-Path -LiteralPath (Join-Path $dir '.git'))) {
      & git clone (Get-RepoUrl $name) $dir 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { Add-Result $s "clone $name" 'FIXED' $dir } else { Add-Result $s "clone $name" 'MISSING' "git clone failed: log in with gh auth login, then rerun"; continue }
    } else { Add-Result $s "clone $name" 'OK' }
    if ((& git -C $dir config --local core.autocrlf) -ne 'false') { & git -C $dir config core.autocrlf false; Add-Result $s "autocrlf $name" 'FIXED' 'core.autocrlf false' }
    else { Add-Result $s "autocrlf $name" 'OK' }
    if ($cfg.git_email) {   # #889: repo-local noreply address (GitHub e-mail privacy push-block)
      if ((& git -C $dir config --local user.email) -eq $cfg.git_email) { Add-Result $s "git email $name" 'OK' }
      else { & git -C $dir config --local user.email $cfg.git_email; Add-Result $s "git email $name" 'FIXED' 'set to git_email from config.toml' }
    }
    $cur = (& git -C $dir remote get-url origin 2>$null)
    $fix = Get-RemoteFix ([string]$cur) $name
    if ($fix) {
      if ($cur) { & git -C $dir remote set-url origin $fix } else { & git -C $dir remote add origin $fix }
      Add-Result $s "origin $name" 'FIXED' "git remote set-url origin $fix"
    } else { Add-Result $s "origin $name" 'OK' }
  }
}

function Step-Herdr {
  $s = '4 herdr'
  $py = Join-Path $env:USERPROFILE 'miniforge3\python.exe'
  if (-not (Test-Path $py)) { Add-Result $s 'control sessions' 'MISSING' 'python is missing (step 1)'; return }
  $app = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
  $spaces = @()
  if (Test-Path $app) {
    if (-not (Get-Process -Name 'herdr-app' -ErrorAction SilentlyContinue)) { Start-Process $app; Start-Sleep -Seconds 10 }
    try { $spaces = @(((& $app ls) | ConvertFrom-Json).spaces | ForEach-Object { $_.name }) } catch { $spaces = @() }
  }
  $want = @($(if ($cfg.control_space) { $cfg.control_space } else { 'oren' }), $(if ($cfg.herdr_space) { $cfg.herdr_space } else { 'oren-workers' }))
  foreach ($w in $want) {
    if ($spaces -contains $w) { Add-Result $s "space $w" 'OK' }
    else { Add-Result $s "space $w" 'MISSING' "in the herdr app create a space named '$w' by hand (the CLI cannot yet), then rerun" }
  }
  if (@($want | Where-Object { $spaces -notcontains $_ }).Count -eq 0) {
    $out = & $py (Join-Path $main 'tools\runner\recover.py') --open 2>&1 | Out-String
    if ($out -match 'everything was running') { Add-Result $s 'control sessions + watchdog' 'OK' } else { Add-Result $s 'control sessions + watchdog' 'FIXED' ($out.Trim() -replace '\s+', ' ') }
  } else { Add-Result $s 'control sessions + watchdog' 'MISSING' 'create the spaces above first' }
}

function Step-Tasks {
  $s = '5 scheduled tasks'
  $py = Join-Path $env:USERPROFILE 'miniforge3\python.exe'
  foreach ($t in @(@('Oren recover', 'tools\recover.cmd'), @('Oren beatcheck', 'tools\runner\beatcheck.py'))) {
    & schtasks /Query /TN $t[0] 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Add-Result $s $t[0] 'OK'; continue }
    $f = Join-Path $main $t[1]
    if ($t[1] -like '*.cmd') { & cmd /c "`"$f`" --install" 2>&1 | Out-Null } else { & $py $f --install 2>&1 | Out-Null }
    & schtasks /Query /TN $t[0] 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Add-Result $s $t[0] 'FIXED' 'installed' } else { Add-Result $s $t[0] 'MISSING' "run '$($t[1]) --install' once as administrator" }
  }
}

foreach ($k in 'main_checkout', 'github_app_key', 'bash', 'inspector_handoff', 'worktree_prefix') { if ($cfg[$k]) { [void](Path-Check $k $cfg[$k]) } }
Step-Tools; Step-Folders; Step-Repo; Step-Herdr; Step-Tasks

# 6 verify: a second pass re-checks everything from scratch; the summary and the exit code come from it
function Verify-All {
  $v = New-Object System.Collections.ArrayList
  function V([string]$n, [bool]$ok, [string]$hint) { [void]$v.Add([pscustomobject]@{ Name = $n; Ok = $ok; Hint = $hint }) }
  foreach ($t in 'git', 'gh', 'node', 'claude') { V $t (Have $t) "install $t (step 1)" }
  if (Have 'node') { V 'node >= 22' ([int]((& node --version) -replace '^v', '' -split '\.')[0] -ge 22) 'install node 22 or newer' }
  $py = Join-Path $env:USERPROFILE 'miniforge3\python.exe'
  V 'python' (Test-Path $py) "install miniforge python 3.12 ($py)"
  $hc = $(if ($cfg.hc) { $cfg.hc } else { Join-Path $env:LOCALAPPDATA 'Programs\herdr-core\hc.exe' })
  V 'herdr core' (Test-Path -LiteralPath $hc) "install herdr core ($hc)"
  $app = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
  V 'herdr app' (Test-Path $app) "install the herdr app ($app)"
  $bin = ConvertFrom-MsysPath $(if ($cfg.extra_path) { $cfg.extra_path } else { "$root/bin" })
  foreach ($d in @($root, $bin, (Join-Path $env:USERPROFILE '.oren'))) { V "folder $d" (Test-Path -LiteralPath $d) 'rerun setup.ps1' }
  $shim = Join-Path $bin 'python3'
  V 'python3 shim' ((Test-Path -LiteralPath $shim) -and ([IO.File]::ReadAllText($shim) -eq (Get-ShimContent $py))) "rerun setup.ps1 ($shim)"
  if (Have 'git') {
    foreach ($e in (Get-RepoDirs $cfg $Repo $root).GetEnumerator()) {
      $dir = $e.Value
      $git = Test-Path -LiteralPath (Join-Path $dir '.git')
      V "checkout $($e.Key)" $git "clone it: git clone $(Get-RepoUrl $e.Key) $dir"
      if ($git) {
        V "origin $($e.Key)" (-not (Get-RemoteFix ([string](& git -C $dir remote get-url origin 2>$null)) $e.Key)) 'rerun setup.ps1 (origin URL)'
        V "autocrlf $($e.Key)" ((& git -C $dir config --local core.autocrlf) -eq 'false') 'rerun setup.ps1'
      }
    }
  }
  foreach ($t in 'Oren recover', 'Oren beatcheck') { & schtasks /Query /TN $t 2>&1 | Out-Null; V "task $t" ($LASTEXITCODE -eq 0) 'rerun setup.ps1 (task install; may need administrator)' }
  $sp = @()
  if (Test-Path $app) { try { $sp = @(((& $app ls) | ConvertFrom-Json).spaces | ForEach-Object { $_.name }) } catch { $sp = @() } }
  foreach ($w in @($(if ($cfg.control_space) { $cfg.control_space } else { 'oren' }), $(if ($cfg.herdr_space) { $cfg.herdr_space } else { 'oren-workers' }))) {
    V "space $w" ($sp -contains $w) "create the herdr space '$w' by hand"
  }
  return $v
}
Write-Host ''
Write-Host '6 verify: re-checking everything'
$checks = @(Verify-All)
$checks | ForEach-Object { Write-Host ("{0,-7} {1}" -f $(if ($_.Ok) { 'OK' } else { 'MISSING' }), $_.Name) }
# MISSING items from the steps that the second pass cannot see (paths of another user, failed clone) stay MISSING too
$stepMissing = @($results | Where-Object { $_.Status -eq 'MISSING' -and $_.Step -eq 'paths' })
$missing = @($checks | Where-Object { -not $_.Ok }) + $stepMissing
Write-Host ("summary: {0} OK, {1} FIXED, {2} MISSING" -f @($checks | Where-Object { $_.Ok }).Count, @($results | Where-Object { $_.Status -eq 'FIXED' }).Count, $missing.Count)
if ($missing.Count -gt 0) {
  Write-Host 'MISSING:'
  $missing | ForEach-Object { Write-Host ("  - {0} -> {1}" -f $_.Name, $_.Hint) }
  exit 1
}
if (-not (@($results | Where-Object { $_.Status -eq 'FIXED' }).Count)) { Write-Host 'nothing to do' }
exit 0
