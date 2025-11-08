<#
.SYNOPSIS
    Learnverse Quiz System - Control Panel (XAMPP-style)
.DESCRIPTION
    Replaces the two terminal windows with a single control panel
#>

# Set working directory to script location
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

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

function Get-LocalIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.InterfaceAlias -notlike "*Loopback*" -and 
            $_.IPAddress -like "192.168.*"
        } | Select-Object -First 1).IPAddress
        if ($ip) { return $ip }
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
        
        # Get local IP
        $localIP = Get-LocalIP
        $script:frontendURL = "http://localhost:8080"
        $script:networkURL = "http://${localIP}:8080"
        
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
    
    if ($script:backendProcess -and -not $script:backendProcess.HasExited) {
        try {
            # Kill the process tree (includes child processes)
            Stop-Process -Id $script:backendProcess.Id -Force -ErrorAction SilentlyContinue
            $backendStatusLabel.Text = "Status: Stopped"
            $backendStatusLabel.ForeColor = [System.Drawing.Color]::Red
        } catch {
            Update-StatusBar "Warning: Could not stop backend process"
        }
    }
    
    if ($script:frontendProcess -and -not $script:frontendProcess.HasExited) {
        try {
            # Kill the process tree (includes child processes)
            Stop-Process -Id $script:frontendProcess.Id -Force -ErrorAction SilentlyContinue
            $frontendStatusLabel.Text = "Status: Stopped"
            $frontendStatusLabel.ForeColor = [System.Drawing.Color]::Red
            $frontendLocalLabel.Text = "Local: (not running)"
            $frontendNetworkLabel.Text = "Network: (not running)"
            $openBrowserButton.Enabled = $false
        } catch {
            Update-StatusBar "Warning: Could not stop frontend process"
        }
    }
    
    # Also kill any orphaned python and node processes related to our servers
    try {
        Get-Process | Where-Object {$_.ProcessName -eq "python" -or $_.ProcessName -eq "node"} | ForEach-Object {
            $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
            if ($cmdLine -like "*uvicorn*socket_app*" -or $cmdLine -like "*vite*") {
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
    
    $script:backendProcess = $null
    $script:frontendProcess = $null
    Update-StatusBar "All servers stopped."
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

# Show the form
[void]$form.ShowDialog()