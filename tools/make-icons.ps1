<#
  Generates Daywise's app icons (PWA, iOS home screen, favicon) into src/DayLog.Web/wwwroot/icons.
  Run from the repo root with Windows PowerShell:  powershell -File tools/make-icons.ps1

  The mark is a "D" monogram holding a sun: white on the app's accent blue.
  It's drawn once on a 64 x 64 design grid and scaled to each size.
  "maskable" icons fill the whole square: Android crops them to its own shape (circle,
  squircle...), so the artwork is shrunk into the central 80% "safe zone".
#>
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\src\DayLog.Web\wwwroot\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

$blue = [System.Drawing.ColorTranslator]::FromHtml('#2a78d6')
$white = [System.Drawing.Color]::White

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# The D, in 64-unit design coordinates: a straight stem on the left and a bowl made of two
# Bezier curves. Horizontally centred on the grid (x 19.5 to 44.5), vertically 16 to 48.
function New-DPath {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddLine(19.5, 16, 19.5, 48)
    $p.AddLine(19.5, 48, 28, 48)
    $p.AddBezier(28, 48, 38.5, 48, 44.5, 41, 44.5, 32)
    $p.AddBezier(44.5, 32, 44.5, 23, 38.5, 16, 28, 16)
    $p.CloseFigure()
    return $p
}

<#
  -FullBleed: background fills the square (maskable / Apple icons; the OS rounds the corners).
  Otherwise: a rounded square on a transparent background (regular "any" icons, favicon).
  -Bold: thicker stroke for tiny sizes, where a thin line turns to mush.
#>
function New-Icon([int]$size, [string]$file, [switch]$FullBleed, [switch]$Bold) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = New-Object System.Drawing.SolidBrush $blue
    if ($FullBleed) {
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $artScale = 0.8   # keep artwork inside the maskable safe zone
    } else {
        $g.FillPath($bg, (New-RoundedRect 0 0 $size $size ($size * 0.22)))
        $artScale = 1.0
    }

    # Map the 64-unit design grid onto this bitmap, scaled about the centre.
    $k = $size / 64 * $artScale
    $g.TranslateTransform($size / 2, $size / 2)
    $g.ScaleTransform($k, $k)
    $g.TranslateTransform(-32, -32)

    $pen = New-Object System.Drawing.Pen $white, ($(if ($Bold) { 6 } else { 4.75 }))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, (New-DPath))

    # The sun, sitting in the D's counter (slightly right of the stem so it looks centred).
    $sunR = $(if ($Bold) { 5.5 } else { 5.25 })
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $white), (31 - $sunR), (32 - $sunR), (2 * $sunR), (2 * $sunR))

    $path = Join-Path $outDir $file
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "wrote $file ($size x $size)"
}

New-Icon 192 'icon-192.png'
New-Icon 512 'icon-512.png'
New-Icon 512 'icon-maskable-512.png' -FullBleed
New-Icon 180 'apple-touch-icon.png' -FullBleed
New-Icon 32 'favicon-32.png' -Bold
