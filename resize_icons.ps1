param (
    [string]$sourcePath = "C:\Users\User\Ai Projects\Apointments Tracker\public\logo.png",
    [string]$destPath192 = "C:\Users\User\Ai Projects\Apointments Tracker\public\icon-192.png",
    [string]$destPath512 = "C:\Users\User\Ai Projects\Apointments Tracker\public\icon-512.png"
)

Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$source,
        [string]$dest,
        [int]$width,
        [int]$height
    )
    $img = [System.Drawing.Image]::FromFile($source)
    $newImg = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($newImg)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $width, $height)
    $newImg.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $newImg.Dispose()
    $img.Dispose()
}

Write-Host "Resizing to 192x192..."
Resize-Image -source $sourcePath -dest $destPath192 -width 192 -height 192

Write-Host "Resizing to 512x512..."
Resize-Image -source $sourcePath -dest $destPath512 -width 512 -height 512

Write-Host "Done!"
