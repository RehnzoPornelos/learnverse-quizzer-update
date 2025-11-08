<# Robust setup.ps1
   - Forces working folder to script dir
   - Logs to setup.log
   - Avoids inline 'try' expressions that caused errors
   - Uses Get-Command to detect tools
   - Uses Start-Process safely
#>

# Force working folder to script location (fix Explorer double-click cwd issue)
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Logging
$log = Join-Path -Path (Get-Location) -ChildPath "setup.log"
if (Test-Path $log) { Remove-Item $log -Force }
Start-Transcript -Path $log -Force

Write-Host "=== Learnverse Quiz Installer (robust) ==="
Write-Host "Working folder: $(Get-Location)"
Write-Host ""

function Write-Ok($s)  { Write-Host "[OK]  $s" -ForegroundColor Green }
function Write-Warn($s){ Write-Host "[WARN] $s" -ForegroundColor Yellow }
function Write-Err($s) { Write-Host "[ERR]  $s" -ForegroundColor Red }

function Safe-Run($exe, [string[]]$argArray) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    Write-Err "Command not found in PATH: $exe"
    return 127
  }
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $argArray -NoNewWindow -Wait -PassThru -ErrorAction Stop
    return $p.ExitCode
  } catch {
    Write-Err "Failed running $exe $($argArray -join ' ') : $_"
    return 999
  }
}

# Detect tools (non-fatal)
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd  = Get-Command npm  -ErrorAction SilentlyContinue
$pyCmd   = Get-Command python -ErrorAction SilentlyContinue

if ($nodeCmd) { $nodeVer = (& node --version) ; Write-Ok "Node detected: $nodeVer" } else { Write-Warn "Node not found (install from https://nodejs.org/)" }
if ($npmCmd)  { $npmVer  = (& npm --version) ; Write-Ok "npm detected: $npmVer" } else { Write-Warn "npm not found" }
if ($pyCmd)   { $pyVer   = (& python --version 2>&1) ; Write-Ok "Python detected: $pyVer" } else { Write-Warn "Python not found" }

# --- Replace your npm-run block with this ---
Write-Host "Detected npm source: $($npmCmd.Source) (CommandType: $($npmCmd.CommandType))"

try {
  Write-Host "Invoking npm via PowerShell call operator..."
  & npm ci --no-audit --no-fund
  $exit = $LASTEXITCODE
  if ($exit -eq $null) { $exit = 0 }
} catch {
  Write-Err "Direct npm invocation via & failed: $_"
  $exit = 999
}

# Install backend requirements if present
$req = ".\backend\requirements.txt"
if (Test-Path $req) {
  Write-Host "`n== Running: python -m pip install --upgrade pip =="
  $exit1 = Safe-Run "python" @("-m","pip","install","--upgrade","pip")
  Write-Host "== Running: python -m pip install -r backend/requirements.txt =="
  $exit2 = Safe-Run "python" @("-m","pip","install","-r",$req)
  if ($exit2 -eq 0) { Write-Ok "Python requirements installed." } else { Write-Err "pip install returned exit code $exit2" }
} else {
  Write-Warn "backend/requirements.txt not found; skipping pip install."
}

Write-Host "`nInstaller actions finished. Log: $log"

Stop-Transcript
Write-Host "`nDone. See setup.log for details."