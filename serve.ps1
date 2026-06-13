# serve.ps1 - Native PowerShell HTTP Server for Web Serial API Diagnostic Portal
# Designed to run in a secure context (http://localhost:8080) on Windows without Node/Python.

# ==========================================
# CONFIGURATION
# ==========================================
$Port = 8080
$Address = "http://localhost:$Port/"
$CurrentDir = $PSScriptRoot
if (-not $CurrentDir) { $CurrentDir = Get-Location }

# SMTP Email Configuration (Gmail, Outlook, etc.)
# If left blank, server falls back to Mock Mode (prints OTP to console)
$global:SmtpServer = ""         # e.g., "smtp.gmail.com"
$global:SmtpPort = 587
$global:SmtpUseSsl = $true
$global:SmtpUser = ""           # e.g., "your-email@gmail.com"
$global:SmtpPassword = ""       # e.g., your App Password
$global:SmtpFrom = ""           # e.g., "your-email@gmail.com"

# Admin Dashboard Passcode
$global:AdminPasscode = "admin123"
# ==========================================

# Set security protocol
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Create HTTP listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Address)

# OTP Cache and Sessions DB Setup
$global:OTPTable = @{}
$global:SessionsFile = Join-Path $CurrentDir "logs\sessions.json"

# Helper Functions
function Get-Sessions {
    if (-not (Test-Path $global:SessionsFile)) {
        return @()
    }
    try {
        $content = Get-Content -Raw -Path $global:SessionsFile -ErrorAction SilentlyContinue
        if ([string]::IsNullOrWhiteSpace($content)) {
            return @()
        }
        $sessions = ConvertFrom-Json $content
        if ($null -eq $sessions) {
            return @()
        }
        
        # Heal any nested value properties safely without triggering member enumeration on arrays
        while ($null -ne $sessions -and $sessions -isnot [Array] -and $null -ne $sessions.PSObject.Properties['value']) {
            $sessions = $sessions.value
        }
        
        # Unroll and clean objects
        $clean = @()
        foreach ($s in @($sessions)) {
            if ($null -ne $s -and $null -ne $s.email -and $s.email -like "*@*") {
                $clean += $s
            }
        }
        
        return $clean
    } catch {
        return @()
    }
}

function Save-Sessions($sessions) {
    try {
        $parent = [System.IO.Path]::GetDirectoryName($global:SessionsFile)
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        
        # Unroll and clean sessions list
        $cleanSessions = @()
        foreach ($s in @($sessions)) {
            $item = $s
            while ($null -ne $item -and $item -isnot [Array] -and $null -ne $item.PSObject.Properties['value']) {
                $item = $item.value
            }
            if ($null -ne $item -and $null -ne $item.email -and $item.email -like "*@*") {
                $cleanSessions += $item
            }
        }
        
        $json = ConvertTo-Json -InputObject $cleanSessions -Depth 10 -Compress
        Set-Content -Path $global:SessionsFile -Value $json -Force
    } catch {
        Write-Host "[Error] Saving sessions failed: $_" -ForegroundColor Red
    }
}

function Update-SessionStatuses {
    $sessions = @(Get-Sessions)
    $changed = $false
    $now = Get-Date
    
    foreach ($session in $sessions) {
        if ($session.status -eq "ACTIVE") {
            $lastActiveDt = [DateTime]$session.lastActive
            $diff = $now - $lastActiveDt
            if ($diff.TotalSeconds -gt 30) {
                $session.status = "OFFLINE"
                $changed = $true
            }
        }
    }
    
    if ($changed) {
        Save-Sessions $sessions
    }
    return $sessions
}

function Send-OtpEmail($email, $otp) {
    if ([string]::IsNullOrWhiteSpace($global:SmtpServer) -or [string]::IsNullOrWhiteSpace($global:SmtpUser)) {
        Write-Host ""
        Write-Host "========================================= MOCK EMAIL =========================================" -ForegroundColor Yellow
        Write-Host " TO:       $email" -ForegroundColor Cyan
        Write-Host " SUBJECT:  L89 GNSS Module Diagnostic & Tester Verification Code" -ForegroundColor White
        Write-Host " CODE:     $otp" -ForegroundColor Green
        Write-Host " EXPIRES:  In 10 Minutes" -ForegroundColor White
        Write-Host "==============================================================================================" -ForegroundColor Yellow
        Write-Host ""
        return $true
    }
    try {
        $smtp = New-Object Net.Mail.SmtpClient($global:SmtpServer, $global:SmtpPort)
        $smtp.EnableSsl = $global:SmtpUseSsl
        $smtp.Credentials = New-Object Net.NetworkCredential($global:SmtpUser, $global:SmtpPassword)
        
        $mail = New-Object Net.Mail.MailMessage
        $mail.From = New-Object Net.Mail.MailAddress($global:SmtpFrom, "L89 GNSS Tester Auth")
        $mail.To.Add($email)
        $mail.Subject = "Your Login Verification OTP: $otp"
        $mail.Body = "Hello,`n`nYour verification OTP for the L89 GNSS Module Diagnostic & Tester portal is: $otp`n`nThis code is valid for 10 minutes. If you did not request this code, please ignore this email.`n`nBest regards,`nL89 Diagnostic Team"
        
        $smtp.Send($mail)
        $mail.Dispose()
        $smtp.Dispose()
        Write-Host "[SMTP] OTP successfully sent to $email" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[SMTP Error] Failed to send email to $email - $_" -ForegroundColor Red
        return $false
    }
}

function Get-RequestBody($request) {
    if ($request.HasEntityBody) {
        $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        return $body
    }
    return ""
}

function Send-JsonResponse($response, $statusCode, $object) {
    $json = ConvertTo-Json -InputObject $object -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " L89 GNSS Tester Local Server Running                    " -ForegroundColor Green
    Write-Host " Serving from: $CurrentDir" -ForegroundColor White
    Write-Host " Listening on: $Address" -ForegroundColor Yellow
    Write-Host " Press Ctrl+C in this window to stop the server." -ForegroundColor Magenta
    Write-Host "==========================================================" -ForegroundColor Cyan

    # Launch browser automatically
    Start-Process "http://localhost:$Port"

    # Infinite loop to handle requests
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.RawUrl
        # Remove query strings if any
        $filePath = $rawUrl.Split('?')[0]

        # Default to index.html
        if ($filePath -eq "/" -or $filePath -eq "") {
            $filePath = "/index.html"
        }

        # Decode URL-encoded paths (e.g., spaces as %20)
        $filePath = [uri]::UnescapeDataString($filePath)
        $localPath = Join-Path $CurrentDir $filePath.Substring(1)

        Write-Host "[Request] $($request.HttpMethod) $rawUrl" -ForegroundColor Cyan

        # Handle API Routes
        if ($filePath.StartsWith("/api/")) {
            Update-SessionStatuses | Out-Null
            
            if ($request.HttpMethod -eq "POST" -and $filePath -eq "/api/login-email") {
                $body = Get-RequestBody $request
                $data = $body | ConvertFrom-Json
                $email = $data.email
                
                if ([string]::IsNullOrWhiteSpace($email)) {
                    Send-JsonResponse $response 400 @{ success = $false; message = "Email is required" }
                } else {
                    $token = [guid]::NewGuid().ToString()
                    $nowStr = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
                    $newSession = @{
                        token = $token
                        email = $email
                        loginTime = $nowStr
                        lastActive = $nowStr
                        duration = 0
                        status = "ACTIVE"
                    }
                    
                    $sessions = @(Get-Sessions) + @([PSCustomObject]$newSession)
                    Save-Sessions $sessions
                    
                    Send-JsonResponse $response 200 @{ success = $true; token = $token; email = $email }
                }
            }
            elseif ($request.HttpMethod -eq "POST" -and $filePath -eq "/api/send-otp") {
                $body = Get-RequestBody $request
                $data = $body | ConvertFrom-Json
                $email = $data.email
                
                if ([string]::IsNullOrWhiteSpace($email)) {
                    Send-JsonResponse $response 400 @{ success = $false; message = "Email is required" }
                } else {
                    $otp = (Get-Random -Minimum 100000 -Maximum 999999).ToString()
                    $expiry = (Get-Date).AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:sszzz")
                    $global:OTPTable[$email] = @{ otp = $otp; expiry = $expiry }
                    
                    $sent = Send-OtpEmail $email $otp
                    $isMock = [string]::IsNullOrEmpty($global:SmtpServer)
                    
                    Send-JsonResponse $response 200 @{ success = $true; mock = $isMock }
                }
            }
            elseif ($request.HttpMethod -eq "POST" -and $filePath -eq "/api/verify-otp") {
                $body = Get-RequestBody $request
                $data = $body | ConvertFrom-Json
                $email = $data.email
                $otp = $data.otp
                
                if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($otp)) {
                    Send-JsonResponse $response 400 @{ success = $false; message = "Email and OTP are required" }
                } else {
                    $record = $global:OTPTable[$email]
                    if ($record -and $record.otp -eq $otp) {
                        $expiryDt = [DateTime]::Parse($record.expiry)
                        if ((Get-Date) -lt $expiryDt) {
                            $global:OTPTable.Remove($email)
                            
                            $token = [guid]::NewGuid().ToString()
                            $nowStr = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
                            $newSession = @{
                                token = $token
                                email = $email
                                loginTime = $nowStr
                                lastActive = $nowStr
                                duration = 0
                                status = "ACTIVE"
                            }
                            
                            $sessions = @(Get-Sessions) + @([PSCustomObject]$newSession)
                            Save-Sessions $sessions
                            
                            Send-JsonResponse $response 200 @{ success = $true; token = $token; email = $email }
                        } else {
                            Send-JsonResponse $response 400 @{ success = $false; message = "OTP has expired" }
                        }
                    } else {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid OTP" }
                    }
                }
            }
            elseif ($request.HttpMethod -eq "POST" -and $filePath -eq "/api/heartbeat") {
                $body = Get-RequestBody $request
                $data = $body | ConvertFrom-Json
                $token = $data.token
                
                if ([string]::IsNullOrWhiteSpace($token)) {
                    Send-JsonResponse $response 400 @{ success = $false; message = "Token is required" }
                } else {
                    $sessions = @(Get-Sessions)
                    $session = $sessions | Where-Object { $_.token -eq $token }
                    if ($session) {
                        $now = Get-Date
                        $loginDt = [DateTime]$session.loginTime
                        
                        $session.lastActive = $now.ToString("yyyy-MM-ddTHH:mm:sszzz")
                        $session.duration = [int]($now - $loginDt).TotalSeconds
                        $session.status = "ACTIVE"
                        
                        Save-Sessions $sessions
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Session not found" }
                    }
                }
            }
            elseif ($request.HttpMethod -eq "POST" -and $filePath -eq "/api/logout") {
                $body = Get-RequestBody $request
                $data = $body | ConvertFrom-Json
                $token = $data.token
                
                if ([string]::IsNullOrWhiteSpace($token)) {
                    Send-JsonResponse $response 400 @{ success = $false; message = "Token is required" }
                } else {
                    $sessions = @(Get-Sessions)
                    $session = $sessions | Where-Object { $_.token -eq $token }
                    if ($session) {
                        $session.status = "OFFLINE"
                        $session.lastActive = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
                        
                        Save-Sessions $sessions
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Session not found" }
                    }
                }
            }
            elseif ($filePath -eq "/api/admin-logs") {
                $passcode = ""
                if ($request.HttpMethod -eq "POST") {
                    $body = Get-RequestBody $request
                    if (![string]::IsNullOrEmpty($body)) {
                        $data = $body | ConvertFrom-Json
                        $passcode = $data.passcode
                    }
                } else {
                    $passcode = $request.QueryString["passcode"]
                }
                
                if ($passcode -eq $global:AdminPasscode) {
                    $sessions = @(Update-SessionStatuses)
                    Send-JsonResponse $response 200 @{ success = $true; sessions = $sessions }
                } else {
                    Send-JsonResponse $response 401 @{ success = $false; message = "Invalid admin passcode" }
                }
            }
            else {
                Send-JsonResponse $response 404 @{ success = $false; message = "API endpoint not found" }
            }
            
            $response.OutputStream.Close()
            continue
        }

        # Serve Static Files
        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".svg"  { "image/svg+xml; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".ico"  { "image/x-icon" }
                Default { "application/octet-stream" }
            }

            $response.ContentType = $mime
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "  -> 200 OK ($mime)" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            $errText = "404 Not Found: $filePath"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($errText)
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "  -> 404 Not Found ($localPath)" -ForegroundColor Red
        }

        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Server Error: $_" -ForegroundColor Red
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
