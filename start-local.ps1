$ErrorActionPreference = 'Stop'
$goodjobDirectory = $PSScriptRoot
# Start and configure your MySQL service separately before using this local launcher.
if (-not (Test-Path -LiteralPath (Join-Path $goodjobDirectory '.env'))) {
    throw 'Create a local .env using .env.example and configure your database and secrets first.'
}
Set-Location -LiteralPath $goodjobDirectory
node start-local.mjs
