# TypeStorm key-art tile: typographic scene in the game's palette.
# 768x768 PNG. Typography only (DrawString), no drawn shapes beyond the
# single line rule that mirrors the game's THE LINE element.
param([string]$OutPath = "$PSScriptRoot\typestorm-tile.png")

Add-Type -AssemblyName System.Drawing

$SIZE = 768
$bmp = New-Object System.Drawing.Bitmap($SIZE, $SIZE)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$bg      = [System.Drawing.Color]::FromArgb(255, 0x24, 0x1E, 0x18)
$paper   = [System.Drawing.Color]::FromArgb(255, 0xF6, 0xF1, 0xE7)
$terra   = [System.Drawing.Color]::FromArgb(255, 0xC4, 0x47, 0x21)
$olive   = [System.Drawing.Color]::FromArgb(255, 0x6E, 0x75, 0x46)
$mustard = [System.Drawing.Color]::FromArgb(255, 0xE6, 0xA5, 0x18)

$g.Clear($bg)

function DimPaper([int]$alpha) {
  [System.Drawing.Color]::FromArgb($alpha, 0xF6, 0xF1, 0xE7)
}

$mono = "Consolas"

# Falling word rain: real words from the game's bands, dim cream, varied size.
# Fixed layout (no RNG) so the tile is reproducible and tuneable.
$rain = @(
  @{ t = "mist";      x =  36; y =  46; s = 30; a =  72 },
  @{ t = "lantern";   x = 300; y =  30; s = 26; a =  56 },
  @{ t = "dusk";      x = 592; y =  54; s = 32; a =  84 },
  @{ t = "tide";      x = 150; y = 118; s = 26; a =  48 },
  @{ t = "starlight"; x = 404; y = 128; s = 30; a =  66 },
  @{ t = "moss";      x =  70; y = 208; s = 34; a =  92 },
  @{ t = "cascade";   x = 540; y = 216; s = 28; a =  60 },
  @{ t = "seed";      x = 320; y = 236; s = 26; a =  46 },
  @{ t = "twilight";  x =  120; y = 470; s = 30; a =  70 },
  @{ t = "snowdrift"; x = 430; y = 448; s = 32; a =  84 },
  @{ t = "reed";      x =  60; y = 548; s = 28; a =  60 },
  @{ t = "word";      x = 640; y = 350; s = 26; a =  52 },
  @{ t = "page";      x = 236; y = 560; s = 26; a =  48 }
)
foreach ($w in $rain) {
  $f = New-Object System.Drawing.Font($mono, [float]$w.s, [System.Drawing.FontStyle]::Bold)
  $b = New-Object System.Drawing.SolidBrush((DimPaper $w.a))
  $g.DrawString($w.t, $f, $b, [float]$w.x, [float]$w.y)
  $f.Dispose(); $b.Dispose()
}

# The locked focus word: typed half mustard, untyped half cream.
$big = New-Object System.Drawing.Font($mono, 88.0, [System.Drawing.FontStyle]::Bold)
$bMust = New-Object System.Drawing.SolidBrush($mustard)
$bPaper = New-Object System.Drawing.SolidBrush($paper)
$fx = 62.0; $fy = 300.0
$g.DrawString("rain", $big, $bMust, $fx, $fy)
$tf = [System.Drawing.StringFormat]::GenericTypographic
$typedW = $g.MeasureString("rain", $big, [System.Drawing.PointF]::new(0, 0), $tf).Width + 4
$g.DrawString("fall", $big, $bPaper, $fx + $typedW, $fy)
# Caret under the next letter.
$g.DrawString("_", $big, $bMust, $fx + $typedW, $fy + 14)

# A danger word in terra, deep in the fall, just above the line.
$fDanger = New-Object System.Drawing.Font($mono, 40.0, [System.Drawing.FontStyle]::Bold)
$bTerra = New-Object System.Drawing.SolidBrush($terra)
$g.DrawString("gust", $fDanger, $bTerra, 528.0, 596.0)

# THE LINE: the breach rule the whole game defends.
$penLine = New-Object System.Drawing.Pen((DimPaper 96), 4)
$g.DrawLine($penLine, [single]0, [single]668, [single]$SIZE, [single]668)
$fLabel = New-Object System.Drawing.Font($mono, 15.0, [System.Drawing.FontStyle]::Bold)
$bLabel = New-Object System.Drawing.SolidBrush((DimPaper 120))
$g.DrawString("T H E   L I N E", $fLabel, $bLabel, 24.0, 680.0)

# Three olive shield pips, echoing the HUD.
$fShield = New-Object System.Drawing.Font($mono, 26.0, [System.Drawing.FontStyle]::Bold)
$bOlive = New-Object System.Drawing.SolidBrush($olive)
$g.DrawString("# # #", $fShield, $bOlive, 596.0, 700.0)

$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $OutPath $((Get-Item $OutPath).Length) bytes"
