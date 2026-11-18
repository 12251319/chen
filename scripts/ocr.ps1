param(
    [Parameter(Mandatory = $true)][string]$ListFile,
    [Parameter(Mandatory = $true)][string]$OutFile
)
# 用 Windows 自带 OCR（Windows.Media.Ocr）批量识别课件图片。
# 输入：ListFile 每行一个图片绝对路径（UTF-8）
# 输出：OutFile，每行「路径<TAB>识别文本」
# 需要 Windows 10/11 且已安装对应语言的 OCR 语言包（中文：zh-Hans-CN）。

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    Write-Error "没有可用的 OCR 引擎（需要安装 Windows OCR 语言包）"
    exit 1
}

$sw = New-Object System.IO.StreamWriter($OutFile, $false, (New-Object System.Text.UTF8Encoding($false)))
$lines = [System.IO.File]::ReadAllLines($ListFile, [System.Text.Encoding]::UTF8)
$i = 0
$t0 = Get-Date
foreach ($p in $lines) {
    $i++
    try {
        $bytes = [System.IO.File]::ReadAllBytes($p)
        $ms = New-Object System.IO.MemoryStream
        $ms.Write($bytes, 0, $bytes.Length)
        $ms.Position = 0
        $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $txt = $result.Text -replace "`r?`n", " "
        $sw.WriteLine($p + "`t" + $txt)
        $bitmap.Dispose()
        $ms.Dispose()
    } catch {
        $sw.WriteLine($p + "`t[OCR_ERROR] " + $_.Exception.Message)
    }
    if ($i % 50 -eq 0) {
        $sw.Flush()
        Write-Output ("progress " + $i + " / " + $lines.Count)
    }
}
$sw.Flush()
$sw.Close()
Write-Output ("DONE " + $i)
