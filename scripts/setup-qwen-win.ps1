[CmdletBinding()]
param(
  [string]$Model = "qwen3.5:0.8b",
  [string]$Endpoint = "http://127.0.0.1:11434",
  [string]$DbPath = "",
  [string]$UserDataPath = "",
  [switch]$InstallOllama,
  [switch]$PullModel,
  [switch]$PrintConfig,
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
}

function Write-SetupHint {
  Write-Host ""
  Write-Host "Neuronotes Qwen setup is incomplete."
  Write-Host "To install Ollama and pull the default model, run:"
  Write-Host "  npm run setup:qwen:win:install"
  Write-Host ""
  Write-Host "Manual alternative:"
  Write-Host "  irm https://ollama.com/install.ps1 | iex"
  Write-Host "  ollama pull $Model"
}

function Assert-Windows {
  if ($env:OS -ne "Windows_NT") {
    throw "This setup script is for Windows. Use the README manual setup on other platforms."
  }
}

function Normalize-Endpoint {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return "http://127.0.0.1:11434"
  }

  return $Url.Trim().TrimEnd("/")
}

function Resolve-DatabasePath {
  param(
    [string]$ExplicitDbPath,
    [string]$ExplicitUserDataPath
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitDbPath)) {
    return $ExplicitDbPath
  }

  if (-not [string]::IsNullOrWhiteSpace($ExplicitUserDataPath)) {
    return (Join-Path $ExplicitUserDataPath "neuronotes.json")
  }

  if (-not [string]::IsNullOrWhiteSpace($env:NEURONOTES_DB_PATH)) {
    return $env:NEURONOTES_DB_PATH
  }

  if (-not [string]::IsNullOrWhiteSpace($env:NEURONOTES_USER_DATA)) {
    return (Join-Path $env:NEURONOTES_USER_DATA "neuronotes.json")
  }

  return $null
}

function Read-NeuronotesSettings {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    $database = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if (-not $database.settings) {
      return $null
    }

    return [pscustomobject]@{
      Model = [string]$database.settings.model
      Endpoint = [string]$database.settings.ollamaUrl
      Source = $Path
    }
  } catch {
    return $null
  }
}

function Resolve-QwenConfig {
  param(
    [string]$ModelValue,
    [string]$EndpointValue,
    [string]$ExplicitDbPath,
    [string]$ExplicitUserDataPath,
    [bool]$ModelPinned,
    [bool]$EndpointPinned
  )

  $resolvedModel = $ModelValue
  $resolvedEndpoint = $EndpointValue

  if (-not $ModelPinned -and -not [string]::IsNullOrWhiteSpace($env:NEURONOTES_MODEL)) {
    $resolvedModel = $env:NEURONOTES_MODEL
    $ModelPinned = $true
  }

  if (-not $EndpointPinned -and -not [string]::IsNullOrWhiteSpace($env:OLLAMA_URL)) {
    $resolvedEndpoint = $env:OLLAMA_URL
    $EndpointPinned = $true
  }

  $settingsPath = Resolve-DatabasePath -ExplicitDbPath $ExplicitDbPath -ExplicitUserDataPath $ExplicitUserDataPath
  $settings = Read-NeuronotesSettings -Path $settingsPath

  if ($settings) {
    if (-not $ModelPinned -and -not [string]::IsNullOrWhiteSpace($settings.Model)) {
      $resolvedModel = $settings.Model
    }

    if (-not $EndpointPinned -and -not [string]::IsNullOrWhiteSpace($settings.Endpoint)) {
      $resolvedEndpoint = $settings.Endpoint
    }
  }

  if ([string]::IsNullOrWhiteSpace($resolvedModel)) {
    $resolvedModel = "qwen3.5:0.8b"
  }

  return [pscustomobject]@{
    Model = $resolvedModel.Trim()
    Endpoint = Normalize-Endpoint -Url $resolvedEndpoint
    SettingsSource = if ($settings) { $settings.Source } else { $null }
  }
}

function Find-OllamaExecutable {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  $candidates = @(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Ollama\ollama.exe" }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "Ollama\ollama.exe" }),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Ollama\ollama.exe" })
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Test-OllamaEndpoint {
  param([string]$Url)

  try {
    $null = Invoke-RestMethod -Uri "$Url/api/tags" -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Wait-ForOllama {
  param(
    [string]$Url,
    [int]$Seconds
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaEndpoint -Url $Url) {
      return $true
    }
    Start-Sleep -Seconds 2
  }

  return $false
}

function Start-OllamaRuntime {
  param(
    [string]$OllamaPath,
    [string]$Url,
    [int]$Seconds
  )

  if (Test-OllamaEndpoint -Url $Url) {
    Write-Step "Ollama is already responding at $Url"
    return
  }

  Write-Step "Starting Ollama runtime"
  Start-Process -FilePath $OllamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null

  if (-not (Wait-ForOllama -Url $Url -Seconds $Seconds)) {
    throw "Ollama did not respond at $Url after $Seconds seconds."
  }
}

function Install-Ollama {
  Write-Step "Installing Ollama with the official Windows install script"
  $installScript = Invoke-RestMethod -Uri "https://ollama.com/install.ps1" -TimeoutSec 30
  Invoke-Expression $installScript
}

Assert-Windows

$modelPinned = $PSBoundParameters.ContainsKey("Model")
$endpointPinned = $PSBoundParameters.ContainsKey("Endpoint")
$config = Resolve-QwenConfig `
  -ModelValue $Model `
  -EndpointValue $Endpoint `
  -ExplicitDbPath $DbPath `
  -ExplicitUserDataPath $UserDataPath `
  -ModelPinned $modelPinned `
  -EndpointPinned $endpointPinned
$Model = $config.Model
$Endpoint = $config.Endpoint

if ($PrintConfig) {
  $config | ConvertTo-Json -Depth 4
  exit 0
}

Write-Step "Checking Ollama for Neuronotes"
Write-Step "Using model $Model at $Endpoint"
$ollamaPath = Find-OllamaExecutable

if (-not $ollamaPath) {
  if (-not $InstallOllama) {
    Write-SetupHint
    exit 1
  }

  Install-Ollama
  $ollamaPath = Find-OllamaExecutable

  if (-not $ollamaPath) {
    throw "Ollama was installed but the executable was not found. Open a new terminal and run npm run setup:qwen:win:pull."
  }
}

Write-Step "Using Ollama executable: $ollamaPath"
Start-OllamaRuntime -OllamaPath $ollamaPath -Url $Endpoint -Seconds $WaitSeconds

if ($PullModel) {
  Write-Step "Pulling $Model"
  & $ollamaPath pull $Model
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Step "Verifying Neuronotes Qwen runtime"
& node scripts/verify-qwen.mjs --start --json --model $Model --endpoint $Endpoint
exit $LASTEXITCODE
