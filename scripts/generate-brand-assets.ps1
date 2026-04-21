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

$lockupTransparent = New-TransparentBitmap -Source $lockupOriginal
$markTransparent = New-TransparentBitmap -Source $markOriginal

$outputs = @()

$lockupBase = Join-Path $absoluteOutputDir "ingeniometrix-lockup.png"
$lockupTransparent.Save($lockupBase, [System.Drawing.Imaging.ImageFormat]::Png)
$outputs += $lockupBase

$markBase = Join-Path $absoluteOutputDir "ingeniometrix-mark.png"
$markTransparent.Save($markBase, [System.Drawing.Imaging.ImageFormat]::Png)
$outputs += $markBase

foreach ($width in @(320, 640, 960)) {
  $height = [int]([Math]::Round($width * ($lockupTransparent.Height / [double]$lockupTransparent.Width)))
  $path = Join-Path $absoluteOutputDir ("ingeniometrix-lockup-{0}.png" -f $width)
  Save-ScaledBitmap -Image $lockupTransparent -Width $width -Height $height -Path $path
  $outputs += $path
}

foreach ($size in @(32, 64, 180, 192, 512)) {
  $path = Join-Path $absoluteOutputDir ("ingeniometrix-mark-{0}.png" -f $size)
  Save-PaddedSquareBitmap -Image $markTransparent -Size $size -Path $path
  $outputs += $path
}

Copy-Item (Join-Path $absoluteOutputDir "ingeniometrix-mark-512.png") (Join-Path $repoRoot "app\icon.png") -Force
Copy-Item (Join-Path $absoluteOutputDir "ingeniometrix-mark-180.png") (Join-Path $repoRoot "app\apple-icon.png") -Force
$outputs += (Join-Path $repoRoot "app\icon.png")
$outputs += (Join-Path $repoRoot "app\apple-icon.png")

$lockupOriginal.Dispose()
$markOriginal.Dispose()
$lockupTransparent.Dispose()
$markTransparent.Dispose()

Write-Output "Brand assets generated:"
$outputs | ForEach-Object { Write-Output $_ }
