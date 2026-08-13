# =======================================================
# ZENX TOURNAMENT OVERLAY - STREAMER LIVE MATCH BRIDGE
# Real-time In-Game Telemetry Sync for Valorant Matches
# =======================================================

param (
    [string]$TargetServer = ""
)

[Console]::Title = "ZENX TOURNAMENT LIVE BRIDGE (STREAMER PC)"
Write-Host "=======================================================" -ForegroundColor Red
Write-Host "   ZENX VALORANT TOURNAMENT - IN-GAME AUTO-BRIDGE      " -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Red
Write-Host ""

$OverlayServer = "https://zenx.up.railway.app"
if ($TargetServer -ne "") {
    $OverlayServer = $TargetServer
}

# Ensure modern TLS protocols
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'

# Clear any broken PowerShell scriptblock callbacks
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null

# Trust 127.0.0.1 self-signed Riot API certificate using thread-safe compiled C# delegates
try {
    if (-not ([System.Management.Automation.PSTypeName]'ZenxSslBypass').Type) {
        Add-Type -TypeDefinition @"
            using System.Net;
            using System.Net.Security;
            using System.Security.Cryptography.X509Certificates;
            public class ZenxSslBypass {
                public static bool ValidateAll(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors) {
                    return true;
                }
                public static void Enable() {
                    ServicePointManager.ServerCertificateValidationCallback = new RemoteCertificateValidationCallback(ValidateAll);
                }
            }
            public class ZenxTrustAllPolicy : ICertificatePolicy {
                public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int problem) {
                    return true;
                }
            }
"@ -ErrorAction SilentlyContinue
    }
    [ZenxSslBypass]::Enable()
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object ZenxTrustAllPolicy
} catch {}

Write-Host "[Bridge] Target Overlay Server: $OverlayServer" -ForegroundColor Cyan
Write-Host "[Bridge] Connecting to VALORANT / Riot Client..." -ForegroundColor Yellow
Write-Host ""

$agentMap = @{
    "add6443a-41bd-e414-f6ad-e58d267f4e95" = "jett"
    "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc" = "reyna"
    "a3bfb854-4339-1607-696a-29e3c6588b0f" = "reyna"
    "f94c3b30-42be-e959-889c-5aa313dba261" = "raze"
    "f94c3b30-42be-e959-889c-5dab3174297d" = "raze"
    "707eab51-4836-f488-046a-cda6bf494859" = "viper"
    "707eab51-47e6-40e7-a4ff-ff06b04d4760" = "viper"
    "8e253930-4c05-31dd-1b6c-968525494517" = "omen"
    "9f0d8ba9-4140-b941-57d3-a7ad57c6b417" = "brimstone"
    "9f0d8ba9-42c6-b1e3-09c4-fb8d70a39a74" = "brimstone"
    "eb93336a-449b-9c1b-0a54-a891f7921d69" = "phoenix"
    "320b2a48-4d9b-a075-30f1-1f93a9b638fa" = "sova"
    "569fdd95-4d10-43ab-ca70-79becc718b46" = "sage"
    "117ed9e3-49f3-6512-3ccf-0cada7e3823b" = "cypher"
    "1e58de9c-4950-5125-93e9-a0aee9f98746" = "killjoy"
    "5f8d3a7f-467b-97f3-062c-13acf203c006" = "breach"
    "5f8d3d21-4a40-4870-49b0-9c892177457f" = "breach"
    "6f2a04ca-43e0-be17-7f36-b3908627744d" = "skye"
    "6f2a04ca-43e0-be17-7f03-b524940794f2" = "skye"
    "7f94d92c-4234-0a36-9646-3a87eb8b5c89" = "yoru"
    "41fb69c1-4189-7b37-f117-bcaf1e96f1bf" = "astra"
    "41fb69c1-4159-7b64-0fb1-ab73b6328f5c" = "astra"
    "601dbbe7-43ce-be57-2a40-4abd24953621" = "kayo"
    "601db835-4b3b-004e-d273-818bf614580e" = "kayo"
    "22697a3d-45bf-8dd7-4fec-84a9e28c69d7" = "chamber"
    "bb2a4828-46eb-8cd1-e765-15848195d751" = "neon"
    "dade69b4-4f5a-8528-247b-219e5a1facd6" = "fade"
    "95b78ed7-4637-86d9-7e41-71ba8c293152" = "harbor"
    "ea308bf8-4f80-8a0a-bbc7-8a927b9c0340" = "harbor"
    "e370fa57-4757-3604-3648-499e1f642d3f" = "gekko"
    "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235" = "deadlock"
    "cc8e01d3-4f9e-9713-2815-4ba1a22f0761" = "deadlock"
    "0e38b510-41a8-5780-5e8f-568b2a4f2d6c" = "iso"
    "1dbf2edd-4729-0984-3115-daa5eed44993" = "clove"
    "1dbf2edd-4729-0984-3115-ffb15092b56b" = "clove"
    "efba5359-4016-a1e5-7626-b1ae76895940" = "vyse"
    "b444168c-4e35-8076-db47-ef9bf368f384" = "tejo"
    "7c8a4701-4de6-9355-b254-e09bc2a34b72" = "miks"
    "92eeef5d-43b5-1d4a-8d03-b3927a09034b" = "veto"
    "df1cb487-4902-002e-5c17-d28e83e78588" = "waylay"
}

$mapMap = @{
    "ascent" = "ascent"
    "bonsai" = "split"
    "canyon" = "fracture"
    "duality" = "bind"
    "foxtrot" = "breeze"
    "triad" = "haven"
    "port" = "icebox"
    "jam" = "lotus"
    "pitt" = "pearl"
    "juliett" = "sunset"
    "infinity" = "abyss"
    "hurm" = "district"
    "kasbah" = "kasbah"
    "drift" = "drift"
    "pia" = "glitch"
}

function Get-RiotClientCredentials {
    # 1. Direct environment and user profile paths
    $pathsToCheck = @()

    $localApp = [Environment]::GetFolderPath('LocalApplicationData')
    if ($localApp) {
        $pathsToCheck += (Join-Path $localApp 'Riot Games\Riot Client\Config\lockfile')
    }
    if ($env:LOCALAPPDATA) {
        $pathsToCheck += "$env:LOCALAPPDATA\Riot Games\Riot Client\Config\lockfile"
    }
    if ($env:USERPROFILE) {
        $pathsToCheck += "$env:USERPROFILE\AppData\Local\Riot Games\Riot Client\Config\lockfile"
    }
    if ($env:PROGRAMDATA) {
        $pathsToCheck += "$env:PROGRAMDATA\Riot Games\Metadata\valorant.live\lockfile"
    }

    # Search all user accounts on drives C, D, E, F
    foreach ($drive in @("C", "D", "E", "F")) {
        $usersDir = "$drive`:\Users"
        if (Test-Path $usersDir) {
            $userFolders = Get-ChildItem -Path $usersDir -Directory -ErrorAction SilentlyContinue
            if ($userFolders) {
                foreach ($u in $userFolders) {
                    $candidate = Join-Path $u.FullName 'AppData\Local\Riot Games\Riot Client\Config\lockfile'
                    $pathsToCheck += $candidate
                }
            }
        }
    }

    foreach ($path in $pathsToCheck) {
        if (Test-Path $path) {
            $rawContent = $null
            try {
                $fileStream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $sr = New-Object System.IO.StreamReader($fileStream)
                $rawContent = $sr.ReadToEnd().Trim()
                $sr.Close()
                $fileStream.Close()
            } catch {
                try {
                    $rawContent = (Get-Content -Path $path -Raw -ErrorAction SilentlyContinue).Trim()
                } catch {}
            }

            if ($rawContent) {
                $parts = $rawContent -split ':'
                if ($parts.Length -ge 5) {
                    return @{
                        Port = $parts[2]
                        Password = $parts[3]
                        Source = "Lockfile ($path)"
                    }
                }
            }
        }
    }

    # 2. Direct Process Inspection Fallback (WMI / CIM)
    $procQuery = "SELECT Name, CommandLine FROM Win32_Process WHERE Name LIKE '%Riot%' OR Name LIKE '%VALORANT%'"
    $procs = @()
    try {
        $procs = Get-CimInstance -Query $procQuery -ErrorAction SilentlyContinue
    } catch {
        try {
            $procs = Get-WmiObject -Query $procQuery -ErrorAction SilentlyContinue
        } catch {}
    }

    if ($procs) {
        foreach ($proc in $procs) {
            $cmd = $proc.CommandLine
            if ($cmd) {
                $foundPort = $null
                $foundToken = $null

                if ($cmd -match '--riotclient-app-port=(\d+)' -or $cmd -match '--app-port=(\d+)' -or $cmd -match '-riotclient-app-port=(\d+)') {
                    $foundPort = $Matches[1]
                }
                if ($cmd -match '--riotclient-auth-token=([a-zA-Z0-9_\-]+)' -or $cmd -match '--remoting-auth-token=([a-zA-Z0-9_\-]+)' -or $cmd -match '-riotclient-auth-token=([a-zA-Z0-9_\-]+)') {
                    $foundToken = $Matches[1]
                }

                if ($foundPort -and $foundToken) {
                    return @{
                        Port = $foundPort
                        Password = $foundToken
                        Source = "Process ($($proc.Name))"
                    }
                }
            }
        }
    }

    return $null
}

$lastStatusMsg = ""
function Show-Status($msg, $color = "Yellow") {
    if ($global:lastStatusMsg -ne $msg) {
        $global:lastStatusMsg = $msg
        $timeStr = (Get-Date).ToString("HH:mm:ss")
        Write-Host "[$timeStr] $msg" -ForegroundColor $color
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    Write-Host "[Info] Running in Admin mode. Note: Standard PowerShell (Win+R -> powershell) is also supported." -ForegroundColor DarkGray
}

while ($true) {
    try {
        $creds = Get-RiotClientCredentials

        if (-not $creds) {
            $procCount = (Get-Process -Name "VALORANT-Win64-Shipping", "RiotClientServices", "VALORANT", "Riot Client" -ErrorAction SilentlyContinue).Count
            if ($procCount -gt 0) {
                Show-Status "[VALORANT Active] Game/Riot process found. Waiting for login..." "Cyan"
            } else {
                Show-Status "[Waiting] Riot Client / VALORANT is not detected. Please start Riot Client or VALORANT..." "Yellow"
            }
            Start-Sleep -Seconds 2
            continue
        }

        $port = $creds.Port
        $password = $creds.Password
        $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("riot:$password"))
        $headers = @{
            "Authorization" = "Basic $auth"
            "Content-Type" = "application/json"
        }

        # 1. Fetch Local Streamer Session to get exact PUUID
        $localPuuid = $null
        $localGameName = ""
        try {
            $session = Invoke-RestMethod -Uri "https://127.0.0.1:$port/chat/v1/session" -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($session -and $session.puuid) {
                $localPuuid = $session.puuid
                if ($session.game_name) {
                    $localGameName = "$($session.game_name)#$($session.game_tag)"
                }
            }
        } catch {}

        # 2. Query Local Riot Client Chat Presences
        $sessionUrl = "https://127.0.0.1:$port/chat/v4/presences"
        $presences = $null
        $isLoggedOut = $false

        try {
            $presences = Invoke-RestMethod -Uri $sessionUrl -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction Stop
        } catch {
            if ($_.Exception.Response -and ($_.Exception.Response.StatusCode.value__ -eq 404 -or $_.Exception.Response.StatusCode.value__ -eq 401 -or $_.Exception.Response.StatusCode.value__ -eq 503)) {
                $isLoggedOut = $true
            }
        }

        if ($isLoggedOut -or (-not $presences -or -not $presences.presences)) {
            $valProc = Get-Process -Name "VALORANT-Win64-Shipping", "VALORANT" -ErrorAction SilentlyContinue
            if ($valProc) {
                Show-Status "[VALORANT Launching] Game is starting up. Loading player session..." "Yellow"
            } else {
                Show-Status "[Riot Client Open] Please SIGN IN to your Riot Account and launch VALORANT to begin sync..." "Yellow"
            }
            Start-Sleep -Seconds 2
            continue
        }

        $loopState = "MENUS"
        $detectedMap = "ascent"
        $roundNum = 1
        $t1Score = 0
        $t2Score = 0
        $team1Players = @()
        $team2Players = @()
        $foundValorantPresence = $false

        # 3. Direct Core-Game Check (Live In-Game Match Inspection)
        if ($localPuuid) {
            try {
                $corePlayer = Invoke-RestMethod -Uri "https://127.0.0.1:$port/core-game/v1/players/$localPuuid" -Method GET -Headers $headers -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($corePlayer -and $corePlayer.MatchID) {
                    $loopState = "INGAME"
                    $matchData = Invoke-RestMethod -Uri "https://127.0.0.1:$port/core-game/v1/matches/$($corePlayer.MatchID)" -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue
                    if ($matchData) {
                        if ($matchData.MapID) {
                            $rawMap = $matchData.MapID.ToString().ToLower()
                            foreach ($key in $mapMap.Keys) {
                                if ($rawMap.Contains($key)) {
                                    $detectedMap = $mapMap[$key]
                                    break
                                }
                            }
                        }

                        if ($matchData.Players) {
                            $allPuuids = @()
                            foreach ($p in $matchData.Players) {
                                if ($p.Subject) { $allPuuids += $p.Subject }
                            }

                            $nameMap = @{}
                            if ($allPuuids.Count -gt 0) {
                                try {
                                    $nameJson = $allPuuids | ConvertTo-Json -Compress
                                    $namesRes = Invoke-RestMethod -Uri "https://127.0.0.1:$port/name-service/v2/players" -Method PUT -Body $nameJson -Headers $headers -ContentType "application/json" -TimeoutSec 3 -ErrorAction SilentlyContinue
                                    if ($namesRes) {
                                        foreach ($n in $namesRes) {
                                            if ($n.Subject -and $n.GameName) {
                                                $nameMap[$n.Subject] = "$($n.GameName)"
                                            }
                                        }
                                    }
                                } catch {}
                            }

                            foreach ($p in $matchData.Players) {
                                $isBlue = ($p.TeamID -eq "Blue" -or $p.TeamID -eq "TeamOne")
                                $charId = if ($p.CharacterID) { $p.CharacterID.ToString().ToLower() } else { "" }
                                $agentName = if ($agentMap.ContainsKey($charId)) { $agentMap[$charId] } else { "jett" }
                                $pIgn = if ($nameMap.ContainsKey($p.Subject)) { $nameMap[$p.Subject] } else { "Player" }
                                
                                $pObj = @{
                                    puuid = $p.Subject
                                    username = $pIgn
                                    name = $pIgn
                                    tag = ""
                                    agent = $agentName
                                    health = 100
                                    shield = 50
                                    weapon = "vandal"
                                    credits = 3900
                                    ult_points_gained = 4
                                    ult_points_needed = 7
                                    is_dead = $false
                                }
                                if ($isBlue) { $team1Players += $pObj } else { $team2Players += $pObj }
                            }
                        }
                    }
                }
            } catch {}
        }

        # 4. Check Presences for Scores and Map (Modern Riot presence schema support)
        if ($presences -and $presences.presences) {
            foreach ($p in $presences.presences) {
                if ($p.product -eq "valorant" -and $p.private) {
                    $foundValorantPresence = $true
                    $isSelf = ($localPuuid -ne $null -and $p.puuid -eq $localPuuid)
                    
                    try {
                        $rawPriv = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p.private))
                        $priv = $rawPriv | ConvertFrom-Json
                        
                        $stateStr = ""
                        if ($priv.matchPresenceData -and $priv.matchPresenceData.sessionLoopState) {
                            $stateStr = $priv.matchPresenceData.sessionLoopState.ToString().ToUpper()
                        } elseif ($priv.partyPresenceData -and $priv.partyPresenceData.partyOwnerSessionLoopState) {
                            $stateStr = $priv.partyPresenceData.partyOwnerSessionLoopState.ToString().ToUpper()
                        } elseif ($priv.sessionLoopState) {
                            $stateStr = $priv.sessionLoopState.ToString().ToUpper()
                        }

                        if ($stateStr -eq "INGAME") {
                            if ($loopState -ne "INGAME" -or $isSelf) {
                                $loopState = "INGAME"
                                
                                if ($priv.partyOwnerMatchScoreAllyTeam -ne $null) {
                                    $t1Score = [int]$priv.partyOwnerMatchScoreAllyTeam
                                } elseif ($priv.partyPresenceData -and $priv.partyPresenceData.partyOwnerMatchScoreAllyTeam -ne $null) {
                                    $t1Score = [int]$priv.partyPresenceData.partyOwnerMatchScoreAllyTeam
                                } elseif ($priv.partyOwnerMatchScore -ne $null) {
                                    $t1Score = [int]$priv.partyOwnerMatchScore
                                }

                                if ($priv.partyOwnerMatchScoreEnemyTeam -ne $null) {
                                    $t2Score = [int]$priv.partyOwnerMatchScoreEnemyTeam
                                } elseif ($priv.partyPresenceData -and $priv.partyPresenceData.partyOwnerMatchScoreEnemyTeam -ne $null) {
                                    $t2Score = [int]$priv.partyPresenceData.partyOwnerMatchScoreEnemyTeam
                                } elseif ($priv.partyOwnerMatchScoreEnemy -ne $null) {
                                    $t2Score = [int]$priv.partyOwnerMatchScoreEnemy
                                }

                                $roundNum = $t1Score + $t2Score + 1

                                $rawMap = ""
                                if ($priv.matchPresenceData -and $priv.matchPresenceData.matchMap) {
                                    $rawMap = $priv.matchPresenceData.matchMap.ToString().ToLower()
                                } elseif ($priv.partyPresenceData -and $priv.partyPresenceData.partyOwnerMatchMap) {
                                    $rawMap = $priv.partyPresenceData.partyOwnerMatchMap.ToString().ToLower()
                                } elseif ($priv.matchMap) {
                                    $rawMap = $priv.matchMap.ToString().ToLower()
                                }

                                foreach ($key in $mapMap.Keys) {
                                    if ($rawMap.Contains($key)) {
                                        $detectedMap = $mapMap[$key]
                                        break
                                    }
                                }
                            }
                        } elseif ($stateStr -eq "PREGAME" -and $loopState -ne "INGAME") {
                            $loopState = "PREGAME"
                        }
                    } catch {}
                }
            }
        }

        if (-not $foundValorantPresence) {
            Show-Status "[Riot Connected] Signed in! Please launch VALORANT on this PC..." "Cyan"
            Start-Sleep -Seconds 2
            continue
        }

        # 5. Build Telemetry Payload
        $payload = @{
            phase = $loopState
            inGame = ($loopState -eq "INGAME")
            map = $detectedMap
            round_number = $roundNum
            team_1_score = $t1Score
            team_2_score = $t2Score
            switch_sides = (($roundNum -gt 12 -and $roundNum -le 24) -or ($roundNum -gt 24 -and ($roundNum % 2) -eq 0))
            team_1_players = $team1Players
            team_2_players = $team2Players
        }

        $jsonPayload = $payload | ConvertTo-Json -Depth 5 -Compress
        $syncUrl = "$OverlayServer/api/bridge/sync_match"

        try {
            $res = Invoke-RestMethod -Uri $syncUrl -Method POST -Body $jsonPayload -ContentType "application/json" -TimeoutSec 4 -ErrorAction SilentlyContinue
        } catch {}

        if ($loopState -eq "INGAME") {
            $accountLabel = if ($localGameName) { " ($localGameName)" } else { "" }
            Show-Status "[LIVE SYNC ACTIVE]$accountLabel Map: $($detectedMap.ToUpper()) | Round $roundNum ($t1Score-$t2Score) | Streaming to $OverlayServer" "Green"
        } elseif ($loopState -eq "PREGAME") {
            Show-Status "[AGENT SELECT] In Match Agent Select Lobby | Connected to $OverlayServer" "Magenta"
        } else {
            $accountLabel = if ($localGameName) { " ($localGameName)" } else { "" }
            Show-Status "[CONNECTED] VALORANT Online$accountLabel (In Menus/Lobby) | Connected to $OverlayServer" "Cyan"
        }

    } catch {
        # Catch unexpected error and continue
    }

    Start-Sleep -Seconds 1
}
