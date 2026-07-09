$base = 'http://localhost:3000'

function Step($label, $cmd) {
    Write-Host ""
    Write-Host "=== $label ===" -ForegroundColor Cyan
    try {
        & $cmd
    } catch {
        Write-Host "[err] $_"
    }
}

# 1) root
Step 'root GET /' {
    $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $r.Content
}

# 2) health
Step 'health GET /health' {
    $r = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $r.Content
}

# 3) auth guest
$token = $null
$userId = $null
Step 'auth POST /api/auth/guest' {
    $r = Invoke-WebRequest -Uri "$base/api/auth/guest" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content
    $json = $r.Content | ConvertFrom-Json
    $script:token = $json.data.token
    $script:userId = $json.data.user.id
}

# 4) market quote QDN
Step 'market GET /api/market/QDN' {
    $r = Invoke-WebRequest -Uri "$base/api/market/QDN" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 4)
}

# 5) market stocks list
Step 'market GET /api/market/stocks' {
    $r = Invoke-WebRequest -Uri "$base/api/market/stocks" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $j = $r.Content | ConvertFrom-Json
    Write-Host "  共 $($j.data.Count) 只股票, 前 3 只: $($j.data[0..2] | ForEach-Object { $_.symbol } | Join-String ', ')"
}

# 6) market indicators
Step 'market GET /api/market/QDN/indicators' {
    $r = Invoke-WebRequest -Uri "$base/api/market/QDN/indicators" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $r.Content
}

# 7) market orderbook
Step 'market GET /api/market/QDN/orderbook' {
    $r = Invoke-WebRequest -Uri "$base/api/market/QDN/orderbook" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $r.Content
}

# 8) lobby
Step 'lobby GET /api/lobby' {
    $r = Invoke-WebRequest -Uri "$base/api/lobby" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    $r.Content
}

# 9) match create-room
$roomCode = $null
Step 'match POST /api/match/create-room' {
    $body = @{ hostId = $userId } | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "$base/api/match/create-room" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content
    $j = $r.Content | ConvertFrom-Json
    $script:roomCode = $j.data.code
}

# 10) match join-room
$matchId = $null
Step 'match POST /api/match/join-room' {
    $body = @{ userId = 'fake_guest_2'; code = $roomCode } | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "$base/api/match/join-room" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content
    $j = $r.Content | ConvertFrom-Json
    $script:matchId = $j.data.matchId
}

# 11) trade buy
Step 'trade POST /api/trade/buy (QDN 100 @ 95)' {
    $body = @{ matchId = $matchId; userId = $userId; symbol = 'QDN'; price = 95; quantity = 100 } | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "$base/api/trade/buy" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 4)
}

# 12) portfolio
Step 'trade GET /api/trade/portfolio' {
    $r = Invoke-WebRequest -Uri "$base/api/trade/portfolio?matchId=$matchId&userId=$userId" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 4)
}

# 13) dealer resources
Step 'dealer GET /api/dealer/resources' {
    $r = Invoke-WebRequest -Uri "$base/api/dealer/resources?matchId=$matchId&userId=$userId" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content
}

# 14) dealer action pump
Step 'dealer POST /api/dealer/action (pump power=20)' {
    $body = @{ matchId = $matchId; userId = $userId; type = 'pump'; power = 20; symbol = 'QDN' } | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "$base/api/dealer/action" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 4)
}

# 15) regulator alerts
Step 'regulator GET /api/regulator/alerts' {
    $r = Invoke-WebRequest -Uri "$base/api/regulator/alerts?matchId=$matchId" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3)
}

# 16) replay
Step 'replay GET /api/replay' {
    $r = Invoke-WebRequest -Uri "$base/api/replay" -UseBasicParsing -TimeoutSec 5
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host ($r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3)
}

Write-Host ""
Write-Host "==== END ====" -ForegroundColor Cyan
