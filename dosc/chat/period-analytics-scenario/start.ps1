$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) {
  & $nodeCommand.Source .\server.mjs
} else {
  $bundledNode = Join-Path $env:LOCALAPPDATA "..\..\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  $bundledNode = [System.IO.Path]::GetFullPath($bundledNode)
  if (-not (Test-Path -LiteralPath $bundledNode)) { throw "Node.js не найден. Установите Node.js или задайте путь к нему в PATH." }
  & $bundledNode .\server.mjs
}

