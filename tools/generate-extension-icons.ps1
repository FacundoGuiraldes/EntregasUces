Add-Type -AssemblyName System.Drawing

function New-UcesIcon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $green = [System.Drawing.ColorTranslator]::FromHtml('#007a5a')
    $darkGreen = [System.Drawing.ColorTranslator]::FromHtml('#005c44')
    $white = [System.Drawing.Color]::White

    $borderPen = New-Object System.Drawing.Pen($green, [float][Math]::Max(2, $Size * 0.035))
    $arcPen = New-Object System.Drawing.Pen($green, [float][Math]::Max(1.5, $Size * 0.02))
    $greenBrush = New-Object System.Drawing.SolidBrush($green)
    $darkBrush = New-Object System.Drawing.SolidBrush($darkGreen)
    $whiteBrush = New-Object System.Drawing.SolidBrush($white)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $graphics.FillEllipse($whiteBrush, [float]($Size * 0.04), [float]($Size * 0.04), [float]($Size * 0.92), [float]($Size * 0.92))
    $graphics.DrawEllipse($borderPen, [float]($Size * 0.04), [float]($Size * 0.04), [float]($Size * 0.92), [float]($Size * 0.92))

    $graphics.FillPie($greenBrush, [float]($Size * 0.16), [float]($Size * 0.18), [float]($Size * 0.68), [float]($Size * 0.42), 180, 180)
    $graphics.FillRectangle($greenBrush, [float]($Size * 0.16), [float]($Size * 0.39), [float]($Size * 0.68), [float]($Size * 0.18))
    $graphics.DrawArc($arcPen, [float]($Size * 0.20), [float]($Size * 0.13), [float]($Size * 0.60), [float]($Size * 0.35), 198, 144)

    $ucesFontSize = if ($Size -le 20) { [float]($Size * 0.20) } elseif ($Size -le 48) { [float]($Size * 0.18) } else { [float]($Size * 0.17) }
    $ucesFont = New-Object System.Drawing.Font('Georgia', $ucesFontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.DrawString('UCES', $ucesFont, $whiteBrush, (New-Object System.Drawing.RectangleF([float]0, [float]($Size * 0.30), [float]$Size, [float]($Size * 0.16))), $format)

    if ($Size -ge 32) {
        $subFont = New-Object System.Drawing.Font('Segoe UI', [float]($Size * 0.08), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString('EXTENSIÓN', $subFont, $greenBrush, (New-Object System.Drawing.RectangleF([float]0, [float]($Size * 0.62), [float]$Size, [float]($Size * 0.08))), $format)
        $graphics.DrawString('ACTIVIDADES', $subFont, $greenBrush, (New-Object System.Drawing.RectangleF([float]0, [float]($Size * 0.72), [float]$Size, [float]($Size * 0.08))), $format)
        $graphics.FillPie($darkBrush, [float]($Size * 0.28), [float]($Size * 0.80), [float]($Size * 0.44), [float]($Size * 0.12), 0, 180)
    }
    else {
        $subFont = New-Object System.Drawing.Font('Segoe UI', [float]($Size * 0.11), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString('A', $subFont, $greenBrush, (New-Object System.Drawing.RectangleF([float]0, [float]($Size * 0.67), [float]$Size, [float]($Size * 0.10))), $format)
    }

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $ucesFont.Dispose()
    if ($subFont) { $subFont.Dispose() }
    $borderPen.Dispose()
    $arcPen.Dispose()
    $greenBrush.Dispose()
    $darkBrush.Dispose()
    $whiteBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

New-UcesIcon -Size 16 -Path 'uces-campus-extension/icon16.png'
New-UcesIcon -Size 32 -Path 'uces-campus-extension/icon32.png'
New-UcesIcon -Size 48 -Path 'uces-campus-extension/icon48.png'
New-UcesIcon -Size 128 -Path 'uces-campus-extension/icon128.png'

Get-ChildItem 'uces-campus-extension/icon*.png' | Select-Object Name, Length
