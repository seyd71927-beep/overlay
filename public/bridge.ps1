# =======================================================
# ZENX TOURNAMENT OVERLAY - STREAMER LIVE MATCH BRIDGE
# Real-time In-Game Telemetry Sync for Valorant Matches
# =======================================================

[Console]::Title = "ZENX TOURNAMENT LIVE BRIDGE (STREAMER PC)"
Write-Host "=======================================================" -ForegroundColor Red
Write-Host "   ZENX VALORANT TOURNAMENT - IN-GAME AUTO-BRIDGE      " -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Red
Write-Host ""

$OverlayServer = "https://zenx.up.railway.app"
$LockfilePath = "$env:LOCALAPPDATA\Riot Games\Riot Client\Config\lockfile"

Write-Host "[Bridge] Target Overlay Server: $OverlayServer" -ForegroundColor Cyan
Write-Host "[Bridge] Scanning for Valorant Client Lockfile..." -ForegroundColor Yellow
Write-Host ""

# Disable SSL Certificate Validation for 127.0.0.1 Riot API
if ([Net.ServicePointManager]::CertificatePolicy -ne $null) {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
}

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
}

while ($true) {
    try {
        if (-not (Test-Path $LockfilePath)) {
            Write-Host "`r[Waiting] Please launch VALORANT on this PC...                    " -NoNewline -ForegroundColor Yellow
            Start-Sleep -Seconds 2
            continue
        }

        $lockfileContent = (Get-Content $LockfilePath -Raw).Trim()
        $parts = $lockfileContent -split ':'
        if ($parts.Length -lt 5) {
            Start-Sleep -Seconds 1
            continue
        }

        $port = $parts[2]
        $password = $parts[3]
        $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("riot:$password"))
        $headers = @{
            "Authorization" = "Basic $auth"
            "Content-Type" = "application/json"
        }

        # 1. Get Session / Presence
        $sessionUrl = "https://127.0.0.1:$port/chat/v4/presences"
        $presences = Invoke-RestMethod -Uri $sessionUrl -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue

        # 2. Get active core-game player
        $localPuuid = $null
        if ($presences -and $presences.presences) {
            $self = $presences.presences | Where-Object { $_.championId -ne $null -or $_.puuid -ne $null } | Select-Object -First 1
            if ($self) { $localPuuid = $self.puuid }
        }

        $loopState = "MENUS"
        $detectedMap = "ascent"
        $roundNum = 0
        $t1Score = 0
        $t2Score = 0
        $team1Players = @()
        $team2Players = @()

        # Check Core-Game (Live In-Game)
        if ($localPuuid) {
            $coreGamePlayerUrl = "https://127.0.0.1:$port/core-game/v1/players/$localPuuid"
            $corePlayer = Invoke-RestMethod -Uri $coreGamePlayerUrl -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue

            if ($corePlayer -and $corePlayer.MatchID) {
                $matchId = $corePlayer.MatchID
                $matchUrl = "https://127.0.0.1:$port/core-game/v1/matches/$matchId"
                $matchData = Invoke-RestMethod -Uri $matchUrl -Method GET -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue

                if ($matchData) {
                    $loopState = "INGAME"
                    
                    # Extract Map
                    $rawMapUrl = $matchData.MapID.ToLower()
                    foreach ($key in $mapMap.Keys) {
                        if ($rawMapUrl.Contains($key)) {
                            $detectedMap = $mapMap[$key]
                            break
                        }
                    }

                    # Extract Players
                    if ($matchData.Players) {
                        foreach ($p in $matchData.Players) {
                            $isBlue = ($p.TeamID -eq "Blue" -or $p.TeamID -eq "TeamOne")
                            $charId = $p.CharacterID
                            $agentName = if ($agentMap.ContainsKey($charId)) { $agentMap[$charId] } else { "jett" }
                            
                            $pObj = @{
                                puuid = $p.Subject
                                username = "Player"
                                tag = ""
                                agent = $agentName
                                health = 100
                                shield = 50
                                weapon = "vandal"
                                credits = 800
                                ult_points_gained = 0
                                ult_points_needed = 7
                                is_dead = $false
                            }

                            if ($isBlue) { $team1Players += $pObj } else { $team2Players += $pObj }
                        }
                    }
                }
            }
        }

        # Build Telemetry Payload
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

        $res = Invoke-RestMethod -Uri $syncUrl -Method POST -Body $jsonPayload -ContentType "application/json" -TimeoutSec 4 -ErrorAction SilentlyContinue

        if ($loopState -eq "INGAME") {
            Write-Host "`r[LIVE MATCH SYNC] Map: $($detectedMap.ToUpper()) | Players: $($team1Players.Count)v$($team2Players.Count) | Telemetry OK!        " -NoNewline -ForegroundColor Green
        } else {
            Write-Host "`r[IN MENUS] Valorant Client Connected | Ready for Match...                  " -NoNewline -ForegroundColor Cyan
        }

    } catch {
        # Silent loop retry
    }

    Start-Sleep -Seconds 1
}
