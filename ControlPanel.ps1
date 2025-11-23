    <#
    .SYNOPSIS
        Learnverse Quiz System - Control Panel (XAMPP-style)
    .DESCRIPTION
        Replaces the two terminal windows with a single control panel
    #>

    # Ensure this runs in Windows PowerShell (powershell.exe), not PowerShell Core (pwsh),
    # because WinForms/MessageBox behavior differs and may fail in pwsh.
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        $winPs = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
        if ($winPs) {
            Start-Process -FilePath $winPs -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`"" -WindowStyle Normal
            Exit
        }
    }

    $ErrorActionPreference = "Stop"
    try {
    # Set working directory to script location
    Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    # Required: Initialize WinForms properly (fixes invisible UI issue)
    [System.Windows.Forms.Application]::EnableVisualStyles()

    # Global process variables
    $script:backendProcess = $null
    $script:frontendProcess = $null
    $script:frontendURL = ""
    $script:networkURL = ""

    # Create main form
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Learnverse Quiz System - Control Panel"
    $form.Size = New-Object System.Drawing.Size(600, 450)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedSingle"
    $form.MaximizeBox = $false
    $form.BackColor = [System.Drawing.Color]::White

    # Title Panel
    $titlePanel = New-Object System.Windows.Forms.Panel
    $titlePanel.Location = New-Object System.Drawing.Point(0, 0)
    $titlePanel.Size = New-Object System.Drawing.Size(600, 60)
    $titlePanel.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
    $form.Controls.Add($titlePanel)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Location = New-Object System.Drawing.Point(20, 15)
    $titleLabel.Size = New-Object System.Drawing.Size(560, 30)
    $titleLabel.Text = "Learnverse Quiz System"
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $titleLabel.ForeColor = [System.Drawing.Color]::White
    $titlePanel.Controls.Add($titleLabel)

    # Backend Status Group
    $backendGroup = New-Object System.Windows.Forms.GroupBox
    $backendGroup.Location = New-Object System.Drawing.Point(20, 80)
    $backendGroup.Size = New-Object System.Drawing.Size(550, 70)
    $backendGroup.Text = "Backend Server (Python/Uvicorn)"
    $backendGroup.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($backendGroup)

    $backendStatusLabel = New-Object System.Windows.Forms.Label
    $backendStatusLabel.Location = New-Object System.Drawing.Point(15, 30)
    $backendStatusLabel.Size = New-Object System.Drawing.Size(520, 25)
    $backendStatusLabel.Text = "Status: Stopped"
    $backendStatusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $backendStatusLabel.ForeColor = [System.Drawing.Color]::Red
    $backendGroup.Controls.Add($backendStatusLabel)

    # Frontend Status Group
    $frontendGroup = New-Object System.Windows.Forms.GroupBox
    $frontendGroup.Location = New-Object System.Drawing.Point(20, 160)
    $frontendGroup.Size = New-Object System.Drawing.Size(550, 100)
    $frontendGroup.Text = "Frontend Server (Vite/Node)"
    $frontendGroup.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($frontendGroup)

    $frontendStatusLabel = New-Object System.Windows.Forms.Label
    $frontendStatusLabel.Location = New-Object System.Drawing.Point(15, 30)
    $frontendStatusLabel.Size = New-Object System.Drawing.Size(520, 25)
    $frontendStatusLabel.Text = "Status: Stopped"
    $frontendStatusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Red
    $frontendGroup.Controls.Add($frontendStatusLabel)

    $frontendLocalLabel = New-Object System.Windows.Forms.Label
    $frontendLocalLabel.Location = New-Object System.Drawing.Point(15, 55)
    $frontendLocalLabel.Size = New-Object System.Drawing.Size(520, 20)
    $frontendLocalLabel.Text = "Local: (not running)"
    $frontendLocalLabel.Font = New-Object System.Drawing.Font("Consolas", 9)
    $frontendGroup.Controls.Add($frontendLocalLabel)

    $frontendNetworkLabel = New-Object System.Windows.Forms.Label
    $frontendNetworkLabel.Location = New-Object System.Drawing.Point(15, 75)
    $frontendNetworkLabel.Size = New-Object System.Drawing.Size(520, 20)
    $frontendNetworkLabel.Text = "Network: (not running)"
    $frontendNetworkLabel.Font = New-Object System.Drawing.Font("Consolas", 9)
    $frontendGroup.Controls.Add($frontendNetworkLabel)

    # Open Browser Button (moved below groups)
    $openBrowserButton = New-Object System.Windows.Forms.Button
    $openBrowserButton.Location = New-Object System.Drawing.Point(370, 275)
    $openBrowserButton.Size = New-Object System.Drawing.Size(200, 35)
    $openBrowserButton.Text = "Open in Browser"
    $openBrowserButton.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $openBrowserButton.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
    $openBrowserButton.ForeColor = [System.Drawing.Color]::White
    $openBrowserButton.FlatStyle = "Flat"
    $openBrowserButton.Enabled = $false
    $form.Controls.Add($openBrowserButton)

    # Start Button
    $startButton = New-Object System.Windows.Forms.Button
    $startButton.Location = New-Object System.Drawing.Point(20, 320)
    $startButton.Size = New-Object System.Drawing.Size(260, 50)
    $startButton.Text = "Start System"
    $startButton.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $startButton.BackColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
    $startButton.ForeColor = [System.Drawing.Color]::White
    $startButton.FlatStyle = "Flat"
    $form.Controls.Add($startButton)

    # Stop Button
    $stopButton = New-Object System.Windows.Forms.Button
    $stopButton.Location = New-Object System.Drawing.Point(310, 320)
    $stopButton.Size = New-Object System.Drawing.Size(260, 50)
    $stopButton.Text = "Stop System"
    $stopButton.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $stopButton.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
    $stopButton.ForeColor = [System.Drawing.Color]::White
    $stopButton.FlatStyle = "Flat"
    $stopButton.Enabled = $false
    $form.Controls.Add($stopButton)

    # Status Bar
    $statusBar = New-Object System.Windows.Forms.Label
    $statusBar.Location = New-Object System.Drawing.Point(20, 385)
    $statusBar.Size = New-Object System.Drawing.Size(550, 30)
    $statusBar.Text = "Ready to start. Click 'Start System' to begin."
    $statusBar.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Italic)
    $statusBar.ForeColor = [System.Drawing.Color]::Gray
    $form.Controls.Add($statusBar)

    # Functions
    function Update-StatusBar {
        param([string]$message)
        $statusBar.Text = $message
        [System.Windows.Forms.Application]::DoEvents()
    }

    # Read VITE_BACKEND_URL from .env.local and extract host (IP/hostname)
    function Get-NetworkIPFromEnv {
        try {
            $envFile = Join-Path (Get-Location) ".env.local"
            if (-not (Test-Path $envFile)) { return $null }

            $content = Get-Content $envFile -Raw

            # Enable multiline matching and capture HTTP URL
            if ($content -match "(?m)^\s*VITE_BACKEND_URL\s*=\s*(https?://([^/:]+))") {
                return $Matches[2]   # host (e.g., 192.168.1.6)
            }
        } catch {}

        return $null
    }

    # Get the first reasonable non-loopback IPv4 OR IP from env file
    function Get-LocalIP {
        try {
            # Try env-file first (the IP set by set-backend-url.ts)
            $envHost = Get-NetworkIPFromEnv
            if ($envHost -and $envHost -ne "127.0.0.1" -and $envHost -ne "localhost") {
                return $envHost
            }

            # Fallback: pick the first non-loopback, non-link-local IPv4 address
            $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
                $_.IPAddress -notmatch '^(127|169)\.' -and $_.InterfaceAlias -notmatch 'Loopback'
            } | Select-Object -ExpandProperty IPAddress -ErrorAction SilentlyContinue

            if ($addresses -and $addresses.Count -gt 0) {
                return $addresses[0]
            }

            # Final fallback
            return "localhost"
        } catch {
            return "localhost"
        }
    }

    function Start-Backend {
        Update-StatusBar "Starting backend server..."
        
        $backendPath = Join-Path (Get-Location) "backend"
        $backendCmd = "cd /d `"$backendPath`" && python -m uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload"
        
        try {
            # Start backend like start.bat does - using cmd.exe
            $script:backendProcess = Start-Process -FilePath "cmd.exe" `
                -ArgumentList "/c", $backendCmd `
                -WindowStyle Hidden `
                -PassThru
            
            Start-Sleep -Milliseconds 500
            
            if ($script:backendProcess.HasExited) {
                $backendStatusLabel.Text = "Status: Failed to start"
                $backendStatusLabel.ForeColor = [System.Drawing.Color]::Red
                Update-StatusBar "Error: Backend exited immediately. Check if Python and dependencies are installed."
                return $false
            }
            
            $backendStatusLabel.Text = "Status: Running (PID: $($script:backendProcess.Id))"
            $backendStatusLabel.ForeColor = [System.Drawing.Color]::Green
            return $true
        } catch {
            $backendStatusLabel.Text = "Status: Failed to start"
            $backendStatusLabel.ForeColor = [System.Drawing.Color]::Red
            Update-StatusBar "Error: Could not start backend - $_"
            return $false
        }
    }

    function Start-Frontend {
        Update-StatusBar "Starting frontend server..."
        
        $frontendCmd = "cd /d `"$(Get-Location)`" && npm run dev"
        
        try {
            # Start frontend like start.bat does - using cmd.exe
            $script:frontendProcess = Start-Process -FilePath "cmd.exe" `
                -ArgumentList "/c", $frontendCmd `
                -WindowStyle Hidden `
                -PassThru
            
            # Wait a bit longer for Vite to start
            Start-Sleep -Seconds 4
            
            if ($script:frontendProcess.HasExited) {
                $frontendStatusLabel.Text = "Status: Failed to start"
                $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Red
                Update-StatusBar "Error: Frontend exited immediately. Check if Node.js and npm packages are installed."
                return $false
            }
            
            # --- START replacement: detect actual frontend port and proper network IP ---
            # Default values (safe fallback)
            $detectedPort = 8080
            $detectedAddr = "localhost"

            try {
                # Wait a moment for node/vite to open sockets
                Start-Sleep -Milliseconds 500

                # Get node process IDs (if any)
                $nodePids = @()
                try { $nodePids = Get-Process -Name "node" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id -ErrorAction SilentlyContinue } catch {}

                $listeners = @()
                if ($nodePids -and $nodePids.Count -gt 0) {
                    try {
                        $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $nodePids -contains $_.OwningProcess }
                    } catch {
                        # If Get-NetTCPConnection fails (permission/older PS), leave listeners empty so fallback occurs below
                        $listeners = @()
                    }
                }

                if ($listeners -and $listeners.Count -gt 0) {
                    # Pick the first listener (should be the Vite dev server). If multiple, the first is usually fine.
                    $entry = $listeners | Select-Object -First 1
                    $detectedPort = $entry.LocalPort
                    $localAddr = $entry.LocalAddress

                    if ($localAddr -eq "0.0.0.0" -or $localAddr -eq "::") {
                        # listening on all addresses — use the machine's LAN IP
                        $detectedAddr = Get-LocalIP
                        if ($detectedAddr -eq "localhost") { $detectedAddr = "127.0.0.1" }
                    } else {
                        $detectedAddr = $localAddr
                    }
                } else {
                    # No direct node listeners found. Try to infer from Get-LocalIP and common ports.
                    $detectedAddr = Get-LocalIP
                    if (-not $detectedAddr) { $detectedAddr = "localhost" }
                    # keep port as default 8080 (Vite typical)
                }
            } catch {
                # If anything went wrong detecting, fall back quietly
                $detectedPort = 8080
                $detectedAddr = Get-LocalIP
                if (-not $detectedAddr) { $detectedAddr = "localhost" }
            }

            # Build URLs with trailing slash (matches Vite output)
            $script:frontendURL = "http://localhost:${detectedPort}/"
            if ($detectedAddr -and $detectedAddr -ne "localhost") {
                $script:networkURL = "http://${detectedAddr}:${detectedPort}/"
            } else {
                $script:networkURL = $script:frontendURL
            }

            $frontendStatusLabel.Text = "Status: Running (PID: $($script:frontendProcess.Id))"
            $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Green
            $frontendLocalLabel.Text = "Local:   $script:frontendURL"
            $frontendNetworkLabel.Text = "Network: $script:networkURL"
            $openBrowserButton.Enabled = $true
            
            return $true
        } catch {
            $frontendStatusLabel.Text = "Status: Failed to start"
            $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Red
            Update-StatusBar "Error: Could not start frontend - $_"
            return $false
        }
    }

    function Stop-AllServers {
        Update-StatusBar "Stopping servers..."
        
        # Kill all related processes more aggressively
        $processesKilled = 0
        
        # 1. Use taskkill for more forceful termination (kills process trees)
        if ($script:backendProcess -and -not $script:backendProcess.HasExited) {
            try {
                # Use taskkill with /F (force) and /T (tree) flags
                Start-Process "taskkill" -ArgumentList "/F", "/T", "/PID", $script:backendProcess.Id -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
                $processesKilled++
                $backendStatusLabel.Text = "Status: Stopped"
                $backendStatusLabel.ForeColor = [System.Drawing.Color]::Red
            } catch {
                Update-StatusBar "Warning: Could not stop backend process"
            }
        }
        
        if ($script:frontendProcess -and -not $script:frontendProcess.HasExited) {
            try {
                # Use taskkill with /F (force) and /T (tree) flags
                Start-Process "taskkill" -ArgumentList "/F", "/T", "/PID", $script:frontendProcess.Id -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
                $processesKilled++
                $frontendStatusLabel.Text = "Status: Stopped"
                $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Red
                $frontendLocalLabel.Text = "Local: (not running)"
                $frontendNetworkLabel.Text = "Network: (not running)"
                $openBrowserButton.Enabled = $false
            } catch {
                Update-StatusBar "Warning: Could not stop frontend process"
            }
        }
        
        # 2. Kill any remaining orphaned processes by port
        try {
            # Find and kill processes using port 8000 (backend)
            $backend8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $backend8000) {
                Start-Process "taskkill" -ArgumentList "/F", "/PID", $pid -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
                $processesKilled++
            }
            
            # Find and kill processes using port 8080 (frontend)
            $frontend8080 = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $frontend8080) {
                Start-Process "taskkill" -ArgumentList "/F", "/PID", $pid -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
                $processesKilled++
            }
        } catch {}
        
        # 3. Kill any remaining python/node processes running our servers (more aggressive)
        try {
            # Kill all python processes with uvicorn
            Start-Process "taskkill" -ArgumentList "/F", "/IM", "python.exe", "/FI", "WINDOWTITLE eq *uvicorn*" -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
            
            # Kill all node processes with vite
            Start-Process "taskkill" -ArgumentList "/F", "/IM", "node.exe", "/FI", "WINDOWTITLE eq *vite*" -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
        } catch {}
        
        # 4. Additional safety: kill by command line pattern
        try {
            Get-Process | Where-Object {$_.ProcessName -eq "python" -or $_.ProcessName -eq "node"} | ForEach-Object {
                try {
                    $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
                    if ($cmdLine -like "*uvicorn*socket_app*" -or $cmdLine -like "*vite*" -or $cmdLine -like "*:8000*" -or $cmdLine -like "*:8080*") {
                        Start-Process "taskkill" -ArgumentList "/F", "/PID", $_.Id -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
                        $processesKilled++
                    }
                } catch {}
            }
        } catch {}
        
        # 5. Wait longer for file handles to be released
        if ($processesKilled -gt 0) {
            Update-StatusBar "Stopped $processesKilled process(es). Waiting for file handles to release..."
            Start-Sleep -Seconds 3
        }
        
        # 6. Force garbage collection to release any Python file handles
        try {
            [System.GC]::Collect()
            [System.GC]::WaitForPendingFinalizers()
        } catch {}
        
        $script:backendProcess = $null
        $script:frontendProcess = $null
        Update-StatusBar "All servers stopped. Folder should now be unlocked."
    }

    # Button Event Handlers
    $startButton.Add_Click({
        $startButton.Enabled = $false
        $startButton.Text = "Starting..."
        
        if (Start-Backend) {
            # Enable stop button right away since backend started
            $stopButton.Enabled = $true
            
            Start-Sleep -Seconds 2
            
            if (Start-Frontend) {
                Update-StatusBar "System is running! Access the quiz system in your browser."
                $startButton.Text = "Start System"
                
                # Auto-open browser with Network URL
                Start-Sleep -Seconds 1
                try {
                    Start-Process $script:networkURL
                } catch {
                    Update-StatusBar "Browser opened. If not, manually visit: $script:networkURL"
                }
            } else {
                Update-StatusBar "Warning: Backend running but frontend failed to start."
                $startButton.Text = "Start System"
            }
        } else {
            Update-StatusBar "Failed to start backend. Check if Python and dependencies are installed."
            $startButton.Enabled = $true
            $startButton.Text = "Start System"
        }
    })

    $stopButton.Add_Click({
        $stopButton.Enabled = $false
        Stop-AllServers
        $startButton.Enabled = $true
    })

    $openBrowserButton.Add_Click({
        if ($script:networkURL) {
            try {
                Start-Process $script:networkURL
                Update-StatusBar "Opened browser to $script:networkURL"
            } catch {
                Update-StatusBar "Could not open browser automatically. Visit: $script:networkURL"
            }
        }
    })

    # Form closing event
    $form.Add_FormClosing({
        param($sender, $e)
        
        if ($script:backendProcess -or $script:frontendProcess) {
            $result = [System.Windows.Forms.MessageBox]::Show(
                "The system is still running. Stop servers before closing?",
                "Confirm Exit",
                [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
                [System.Windows.Forms.MessageBoxIcon]::Question
            )
            
            if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
                Stop-AllServers
            } elseif ($result -eq [System.Windows.Forms.DialogResult]::Cancel) {
                $e.Cancel = $true
            }
        }
    })

    # Correct way to run a WinForms app
    [System.Windows.Forms.Application]::Run($form)
    } catch {
        # Save full error details to a desktop log and show/open it for debugging.
        try {
            $errText = $_ | Out-String
            $logFile = Join-Path $env:USERPROFILE "Desktop\Learnverse-ControlPanel-error.txt"
            "Date: $(Get-Date -Format o)`r`nError:`r`n$errText" | Out-File -FilePath $logFile -Encoding utf8

            # Try to show a MessageBox (may fail in non-interactive hosts)
            try {
                Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
                [System.Windows.Forms.MessageBox]::Show("Startup error occurred. Details written to:`n$logFile","Learnverse Control Panel - Error",[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
            } catch {}

            # Open the log in Notepad so you see the reason immediately
            Start-Process -FilePath "notepad.exe" -ArgumentList "`"$logFile`""
        } catch {
            # Last-resort: write to temp file and exit
            Write-Error "Fatal startup error and failed to write log: $($_.Exception.Message)"
        }
    }