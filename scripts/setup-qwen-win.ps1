[CmdletBinding()]
param(
  [string]$Model = "qwen3.5:0.8b",
  [string]$Endpoint = "http://127.0.0.1:11434",
  [switch]$InstallOllama,
  [switch]$PullModel,
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

Write-Step "Checking Ollama for Neuronotes"
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
