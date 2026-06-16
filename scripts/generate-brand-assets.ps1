param(
  [string]$LockupSource = "G:\My Drive\IngenioMetrix\Ingeniometrix arte\logo ingeniometrix.jpg",
  [string]$MarkSource = "G:\My Drive\IngenioMetrix\Ingeniometrix arte\solo logo.png",
  [string]$OutputDir = "public\brand"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-TransparentBitmap {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$WhiteThreshold = 238
  )

  $bitmap = [System.Drawing.Bitmap]::new($Source.Width, $Source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  for ($x = 0; $x -lt $Source.Width; $x++) {
    for ($y = 0; $y -lt $Source.Height; $y++) {
      $pixel = $Source.GetPixel($x, $y)
      $isNearWhite = $pixel.R -ge $WhiteThreshold -and $pixel.G -ge $WhiteThreshold -and $pixel.B -ge $WhiteThreshold

      if ($isNearWhite) {
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
      }
      else {
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $pixel.R, $pixel.G, $pixel.B))
      }
    }
  }

  return $bitmap
}

function Get-NonWhiteBounds {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$WhiteThreshold = 245
  )

  $minX = $Source.Width
  $minY = $Source.Height
  $maxX = -1
  $maxY = -1

  for ($x = 0; $x -lt $Source.Width; $x++) {
    for ($y = 0; $y -lt $Source.Height; $y++) {
      $pixel = $Source.GetPixel($x, $y)
      $isNearWhite = $pixel.R -ge $WhiteThreshold -and $pixel.G -ge $WhiteThreshold -and $pixel.B -ge $WhiteThreshold

      if (-not $isNearWhite) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0 -or $maxY -lt 0) {
    return [System.Drawing.Rectangle]::new(0, 0, $Source.Width, $Source.Height)
  }

  return [System.Drawing.Rectangle]::new(
    $minX,
    $minY,
    ($maxX - $minX + 1),
    ($maxY - $minY + 1)
  )
}

function Get-NonTransparentBounds {
  param(
    [System.Drawing.Bitmap]$Source,
    [byte]$AlphaThreshold = 8
  )

  $minX = $Source.Width
  $minY = $Source.Height
  $maxX = -1
  $maxY = -1

  for ($x = 0; $x -lt $Source.Width; $x++) {
    for ($y = 0; $y -lt $Source.Height; $y++) {
      $pixel = $Source.GetPixel($x, $y)

      if ($pixel.A -gt $AlphaThreshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0 -or $maxY -lt 0) {
    return [System.Drawing.Rectangle]::new(0, 0, $Source.Width, $Source.Height)
  }

  return [System.Drawing.Rectangle]::new(
    $minX,
    $minY,
    ($maxX - $minX + 1),
    ($maxY - $minY + 1)
  )
}

function CropBitmap {
  param(
    [System.Drawing.Bitmap]$Source,
    [System.Drawing.Rectangle]$Bounds
  )

  $target = [System.Drawing.Bitmap]::new($Bounds.Width, $Bounds.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $sourceRect = [System.Drawing.RectangleF]::new($Bounds.X, $Bounds.Y, $Bounds.Width, $Bounds.Height)
  $destRect = [System.Drawing.RectangleF]::new(0, 0, $Bounds.Width, $Bounds.Height)
  $graphics.DrawImage($Source, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()

  return $target
}

function Save-ScaledBitmap {
  param(
    [System.Drawing.Image]$Image,
    [int]$Width,
    [int]$Height,
    [string]$Path
  )

  $target = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Image, 0, 0, $Width, $Height)
  $graphics.Dispose()
  $target.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $target.Dispose()
}

function Save-PaddedSquareBitmap {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Path,
    [double]$InsetRatio = 0.14
  )

  $canvas = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $inset = [int]([Math]::Round($Size * $InsetRatio))
  $targetWidth = $Size - ($inset * 2)
  $targetHeight = [int]([Math]::Round($targetWidth * ($Image.Height / [double]$Image.Width)))
  $top = [int]([Math]::Round(($Size - $targetHeight) / 2))
  $graphics.DrawImage($Image, $inset, $top, $targetWidth, $targetHeight)
  $graphics.Dispose()

  $canvas.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
}

$repoRoot = Resolve-Path "."
$absoluteOutputDir = Join-Path $repoRoot $OutputDir
if (-not (Test-Path $absoluteOutputDir)) {
  New-Item -ItemType Directory -Path $absoluteOutputDir | Out-Null
}

$lockupOriginal = [System.Drawing.Bitmap]::new($LockupSource)
$markOriginal = [System.Drawing.Bitmap]::new($MarkSource)

$lockupCropped = CropBitmap -Source $lockupOriginal -Bounds (Get-NonWhiteBounds -Source $lockupOriginal)
$markCropped = CropBitmap -Source $markOriginal -Bounds (Get-NonWhiteBounds -Source $markOriginal)

$lockupTransparent = New-TransparentBitmap -Source $lockupCropped -WhiteThreshold 244
$markTransparent = New-TransparentBitmap -Source $markCropped -WhiteThreshold 244

$lockupTrimmed = CropBitmap -Source $lockupTransparent -Bounds (Get-NonTransparentBounds -Source $lockupTransparent)
$markTrimmed = CropBitmap -Source $markTransparent -Bounds (Get-NonTransparentBounds -Source $markTransparent)

$outputs = @()

$lockupBase = Join-Path $absoluteOutputDir "ingeniometrix-lockup.png"
$lockupTrimmed.Save($lockupBase, [System.Drawing.Imaging.ImageFormat]::Png)
$outputs += $lockupBase

$markBase = Join-Path $absoluteOutputDir "ingeniometrix-mark.png"
$markTrimmed.Save($markBase, [System.Drawing.Imaging.ImageFormat]::Png)
$outputs += $markBase

foreach ($width in @(320, 640, 960)) {
  $height = [int]([Math]::Round($width * ($lockupTrimmed.Height / [double]$lockupTrimmed.Width)))
  $path = Join-Path $absoluteOutputDir ("ingeniometrix-lockup-{0}.png" -f $width)
  Save-ScaledBitmap -Image $lockupTrimmed -Width $width -Height $height -Path $path
  $outputs += $path
}

foreach ($size in @(32, 64, 180, 192, 512)) {
  $path = Join-Path $absoluteOutputDir ("ingeniometrix-mark-{0}.png" -f $size)
  Save-PaddedSquareBitmap -Image $markTrimmed -Size $size -Path $path -InsetRatio 0.08
  $outputs += $path
}

Copy-Item (Join-Path $absoluteOutputDir "ingeniometrix-mark-512.png") (Join-Path $repoRoot "app\icon.png") -Force
Copy-Item (Join-Path $absoluteOutputDir "ingeniometrix-mark-180.png") (Join-Path $repoRoot "app\apple-icon.png") -Force
$outputs += (Join-Path $repoRoot "app\icon.png")
$outputs += (Join-Path $repoRoot "app\apple-icon.png")

$lockupOriginal.Dispose()
$markOriginal.Dispose()
$lockupCropped.Dispose()
$markCropped.Dispose()
$lockupTransparent.Dispose()
$markTransparent.Dispose()
$lockupTrimmed.Dispose()
$markTrimmed.Dispose()

Write-Output "Brand assets generated:"
$outputs | ForEach-Object { Write-Output $_ }
