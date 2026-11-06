param(
  [ValidateRange(1,8)][int]$Workers = 2,
  [ValidateRange(1024,65535)][int]$Port = 4176,
  [switch]$Dpr2,
  [switch]$PrepareOnly,
  [switch]$Smoke
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $projectRoot ("work\vision-regression-{0}-{1}" -f $stamp,([guid]::NewGuid().ToString('N').Substring(0,8)))
New-Item -ItemType Directory -Path $runRoot | Out-Null
foreach ($folder in @('src','tests','public','prototypes')) {
  $source = Join-Path $projectRoot $folder
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $runRoot $folder) -Recurse }
}
# Some legacy focused tests assume these empty output containers already exist.
Get-ChildItem -LiteralPath (Join-Path $runRoot 'tests') -Recurse -Filter '*.ts' | ForEach-Object {
  $testText = Get-Content -LiteralPath $_.FullName -Raw
  foreach ($match in [regex]::Matches($testText, 'outputs/[A-Za-z0-9._-]+')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $runRoot $match.Value) | Out-Null
  }
}
Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Name -like '*.config.ts' -or $_.Name -in @('package.json','package-lock.json','tsconfig.json','index.html') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $runRoot }
# This test consumes a file by filesystem path rather than package resolution.
$fontRelative = 'node_modules\playwright-core\lib\vite\traceViewer\codicon.DCmgc-ay.ttf'
$fontSource = Join-Path $projectRoot $fontRelative
if (Test-Path -LiteralPath $fontSource) {
  $fontTarget = Join-Path $runRoot $fontRelative
  New-Item -ItemType Directory -Force -Path (Split-Path $fontTarget -Parent) | Out-Null
  Copy-Item -LiteralPath $fontSource -Destination $fontTarget
}
foreach ($ratio in @(1,2)) {
  @"
import base from './playwright.manual.config';
export default { ...base, testDir: './tests', use: { ...base.use, baseURL: 'http://127.0.0.1:$Port' }, outputDir: './artifacts-dpr$ratio', reporter: [['list'], ['json', { outputFile: './results-dpr$ratio.json' }]] };
"@ | Set-Content -Encoding utf8 -LiteralPath (Join-Path $runRoot "vision-dpr$ratio.config.ts")
}
$inventory = Get-ChildItem -LiteralPath (Join-Path $runRoot 'src') -Recurse -File | ForEach-Object { @{path=$_.FullName.Substring($runRoot.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName).Hash} }
@{created=(Get-Date).ToString('o');root=$projectRoot;workers=$Workers;port=$Port;head=(& git -C $projectRoot rev-parse HEAD);status=@(& git -C $projectRoot status --short);source=$inventory} | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $runRoot 'snapshot.json')
Write-Host "Regression evidence: $runRoot"
if ($PrepareOnly) { return }
$probe = [Net.Sockets.TcpClient]::new()
try { $available = -not $probe.ConnectAsync('127.0.0.1',$Port).Wait(300) } catch { $available = $true } finally { $probe.Dispose() }
if (-not $available) { throw "Port $Port is already in use. Choose another -Port; no existing process has been stopped." }
$nodePath = (Get-Command node.exe).Source
$vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$serverConfig = Join-Path $projectRoot 'vite.validation.config.ts'
$cliPath = Join-Path $projectRoot 'node_modules\@playwright\test\cli.js'
$server = $null
$previousChannel = $env:GUI_BROWSER_CHANNEL
$previousCaptures = $env:HYBRID_CAPTURE_DIR
$previousThemeShots = $env:BENTO1_SHOTS
$previousCanvasShots = $env:BENTO3_SHOTS
$exitCode = 0
try {
  $server = Start-Process -FilePath $nodePath -ArgumentList @(('"{0}"' -f $vitePath),'--host','127.0.0.1','--port',"$Port",'--strictPort','--config',('"{0}"' -f $serverConfig)) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'vite.log') -RedirectStandardError (Join-Path $runRoot 'vite-error.log')
  $ready = $false
  for ($attempt=0; $attempt -lt 50; $attempt++) {
    if ($server.HasExited) { throw 'Vite exited; inspect vite-error.log.' }
    try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -TimeoutSec 1 -UseBasicParsing; $ready=$true; break } catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $ready) { throw 'Vite did not become ready.' }
  $env:GUI_BROWSER_CHANNEL = 'chrome'
  $env:HYBRID_CAPTURE_DIR = 'outputs/HybridCaptures-dpr1'
  $env:BENTO1_SHOTS = 'outputs/Theme-dpr1'
  $env:BENTO3_SHOTS = 'outputs/Canvas-dpr1'
  Push-Location $runRoot
  try {
    if ($Smoke) {
      & $nodePath $cliPath test --config vision-dpr1.config.ts tests/canvas-chrome-theme.spec.ts --grep 'konva chrome' --project chromium-dpr1 --workers $Workers
    } else {
      & $nodePath $cliPath test --config vision-dpr1.config.ts --project chromium-dpr1 --workers $Workers
    }
    $exitCode = $LASTEXITCODE
    if ($Dpr2 -and -not $Smoke) {
      $env:HYBRID_CAPTURE_DIR = 'outputs/HybridCaptures-dpr2'
      $env:BENTO1_SHOTS = 'outputs/Theme-dpr2'
      $env:BENTO3_SHOTS = 'outputs/Canvas-dpr2'
      & $nodePath $cliPath test --config vision-dpr2.config.ts tests/canvas-chrome-theme.spec.ts tests/h3-responsive.spec.ts tests/h3-interactions.spec.ts tests/h3-behavior-draft.spec.ts tests/hybrid-hover.spec.ts tests/sidebar-resizer-drag.spec.ts tests/blockly-workspace.spec.ts tests/workspace-layout.spec.ts --project chromium-dpr2 --workers $Workers
      if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
    }
    @{finished=(Get-Date).ToString('o');exitCode=$exitCode} | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $runRoot 'completion.json')
  } finally { Pop-Location }
} finally {
  $env:GUI_BROWSER_CHANNEL = $previousChannel
  $env:HYBRID_CAPTURE_DIR = $previousCaptures
  $env:BENTO1_SHOTS = $previousThemeShots
  $env:BENTO3_SHOTS = $previousCanvasShots
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id; $server.WaitForExit() }
  Write-Host "Reports retained in $runRoot"
}
exit $exitCode
