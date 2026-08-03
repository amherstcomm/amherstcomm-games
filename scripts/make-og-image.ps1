# Draws public/og.png, the link preview card.
#
# 1200x630 is what Facebook and LinkedIn crop to, so a square logo loses its
# top and bottom there. Twitter's large card trims to 2:1, so everything that
# matters stays inside the middle band.
#
# Run from the repo root:  pwsh scripts/make-og-image.ps1

Add-Type -AssemblyName System.Drawing

$W, $H = 1200, 630
$bmp = New-Object Drawing.Bitmap $W, $H
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.TextRenderingHint = 'AntiAliasGridFit'

function Rgb([string]$hex) {
  [Drawing.ColorTranslator]::FromHtml($hex)
}

# page background — slate-950, the same as the site
$g.Clear((Rgb '#020617'))

# two soft glows so the card isn't a flat rectangle
function Glow($cx, $cy, $r, $color, $alpha) {
  $path = New-Object Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
  $brush = New-Object Drawing.Drawing2D.PathGradientBrush $path
  $brush.CenterColor = [Drawing.Color]::FromArgb($alpha, $color)
  $brush.SurroundColors = @([Drawing.Color]::FromArgb(0, $color))
  $g.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}
Glow 230 315 420 (Rgb '#34d399') 40
Glow 1000 170 400 (Rgb '#fbbf24') 34

# the app icon, with a hairline to lift it off the page
$logo = [Drawing.Image]::FromFile((Resolve-Path 'public/logo.png'))
$g.DrawImage($logo, 110, 175, 280, 280)
$logo.Dispose()
$tile = New-Object Drawing.Drawing2D.GraphicsPath
$r = 62
$tile.AddArc(110, 175, $r, $r, 180, 90)
$tile.AddArc((390 - $r), 175, $r, $r, 270, 90)
$tile.AddArc((390 - $r), (455 - $r), $r, $r, 0, 90)
$tile.AddArc(110, (455 - $r), $r, $r, 90, 90)
$tile.CloseFigure()
$pen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(28, 255, 255, 255)), 1.5
$g.DrawPath($pen, $tile)
$pen.Dispose(); $tile.Dispose()

# text — GenericTypographic drops the padding GDI+ otherwise pads strings with
$fmt = [Drawing.StringFormat]::GenericTypographic
$px = [Drawing.GraphicsUnit]::Pixel

$titleFont = New-Object Drawing.Font 'Georgia', 92, ([Drawing.FontStyle]::Bold), $px
$subFont = New-Object Drawing.Font 'Segoe UI', 33, ([Drawing.FontStyle]::Regular), $px
$gameFont = New-Object Drawing.Font 'Segoe UI Semibold', 25, ([Drawing.FontStyle]::Regular), $px

$g.DrawString('Anagrimoire', $titleFont, (New-Object Drawing.SolidBrush (Rgb '#f8fafc')), 448, 212, $fmt)
$g.DrawString('Word game solvers & daily puzzles', $subFont,
  (New-Object Drawing.SolidBrush (Rgb '#94a3b8')), 452, 325, $fmt)
$g.DrawString('Pattern  ·  Scramble  ·  Hive  ·  Grid  ·  Boxed  ·  Weave', $gameFont,
  (New-Object Drawing.SolidBrush (Rgb '#34d399')), 452, 392, $fmt)

$out = Join-Path (Get-Location) 'public/og.png'
$bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"wrote $out ({0:N0} bytes)" -f (Get-Item $out).Length
