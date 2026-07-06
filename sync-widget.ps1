# Reusable PowerShell script to sync Discord Board Profile Widget stats for CrunchyVerse
# Usage:
#   .\sync-widget.ps1
#   (or double-click to run, then enter your Discord User ID when prompted)

param(
    [Parameter(Mandatory=$false)]
    [string]$UserId
)

# If no User ID was passed, prompt the user interactively
if ([string]::IsNullOrEmpty($UserId)) {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "🎪 CrunchyVerse Board Profile Widget Sync Tool 🎪" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    $UserId = Read-Host "👉 Masukkan Discord User ID kamu (contoh: 661135501226672129)"
    $UserId = $UserId.Trim()
}

if ([string]::IsNullOrEmpty($UserId)) {
    Write-Host "❌ Error: User ID tidak boleh kosong!" -ForegroundColor Red
    Start-Sleep -Seconds 3
    exit
}

$uri = "https://crunchyverse-backend.onrender.com/api/widget/sync"
$body = @{ userId = $UserId } | ConvertTo-Json

Write-Host "`n📡 Menghubungkan ke server CrunchyVerse di Render..." -ForegroundColor Cyan
Write-Host "⏳ Mensinkronisasikan widget untuk ID: $UserId..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body $body
    
    if ($response.success) {
        Write-Host ""
        Write-Host "✅ SINKRONISASI BERHASIL!" -ForegroundColor Green
        Write-Host "--------------------------------------------------------" -ForegroundColor Green
        Write-Host "📊 Stats yang dikirim ke Discord:" -ForegroundColor Green
        Write-Host "   ⭐ Level       : $($response.stats.level)"
        Write-Host "   🔥 Streak      : $($response.stats.streak) Hari"
        Write-Host "   🎙️  Voice Hours : $($response.stats.voice) Jam"
        Write-Host "   🪙  Kekayaan   : Rp $($response.stats.cv_wealth.ToString("N0", (Get-Culture))) (CV$)"
        Write-Host "--------------------------------------------------------" -ForegroundColor Green
        Write-Host "💡 Silakan tekan Ctrl+R pada Discord kamu untuk memuat ulang widget." -ForegroundColor Yellow
        Write-Host "💡 Widget kamu sekarang menampilkan stats terbaru secara live!" -ForegroundColor LightGreen
    } else {
        Write-Host "❌ Gagal menyinkronkan: $($response.error)" -ForegroundColor Red
    }
} catch {
    # Extract detailed error message if available from response body
    $errMsg = $_.Exception.Message
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $rawBody = $reader.ReadToEnd()
            $jsonErr = ConvertFrom-Json $rawBody -ErrorAction SilentlyContinue
            if ($jsonErr -and $jsonErr.error) {
                $errMsg = $jsonErr.error
            } else {
                $errMsg = $rawBody
            }
        } catch {}
    }
    Write-Host ""
    Write-Host "❌ Gagal menghubungi server atau terjadi kesalahan API." -ForegroundColor Red
    Write-Host "⚠️ Detail Error: $errMsg" -ForegroundColor Red
    Write-Host "💡 Pastikan kamu sudah klik tombol 'Otorisasi Stats Widget' di Discord server sebelum melakukan sinkronisasi!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tekan tombol apa saja untuk keluar..."
[void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
