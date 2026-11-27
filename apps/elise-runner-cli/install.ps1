$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = 'mrpotatodip/ts-mrpotato-lab'
$tagPrefix = 'elise-runner-v'
$asset = 'elise-runner-windows-x64.exe'

function Fail([string]$message) {
  Write-Host "elise install: $message" -ForegroundColor Red
  exit 1
}

$dir = $env:ELISE_RUNNER_INSTALL_DIR
if ([string]::IsNullOrEmpty($dir)) {
  if ([string]::IsNullOrEmpty($env:LOCALAPPDATA)) { Fail 'LOCALAPPDATA is not set. Set ELISE_RUNNER_INSTALL_DIR to a folder you can write to.' }
  $dir = Join-Path $env:LOCALAPPDATA 'elise-runner\bin'
}

$arch = $env:PROCESSOR_ARCHITEW6432
if ([string]::IsNullOrEmpty($arch)) { $arch = $env:PROCESSOR_ARCHITECTURE }
if ($arch -eq 'ARM64') {
  Write-Host 'Windows on ARM: the Runner supports only x64 natively. The x64 build runs under emulation, so it is installed anyway.'
} elseif ($arch -ne 'AMD64') {
  Fail "unsupported CPU $arch. The Runner supports x64 on Windows (ARM64 runs it under emulation)."
}

$tag = $env:ELISE_RUNNER_VERSION
if ([string]::IsNullOrEmpty($tag)) {
  try {
    $releases = Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/releases?per_page=100" -Headers @{ 'User-Agent' = 'elise-install' }
  } catch {
    Fail "could not list releases from the GitHub API (a rate limit, HTTP 403, or no network). Wait a few minutes and run this again, or skip the lookup: `$env:ELISE_RUNNER_VERSION='${tagPrefix}X.Y.Z' (a tag from https://github.com/$repo/releases) and run this again"
  }
  $match = @($releases) | Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name.StartsWith($tagPrefix) } | Select-Object -First 1
  if (-not $match) { Fail "no published $tagPrefix* release found at https://github.com/$repo/releases" }
  $tag = $match.tag_name
}

$url = "https://github.com/$repo/releases/download/$tag/$asset"
try {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
} catch {
  Fail "cannot create $dir. Set ELISE_RUNNER_INSTALL_DIR to a folder you can write to."
}

$tmp = Join-Path $dir ('.elise.' +[Guid]::NewGuid().ToString('N') + '.tmp')
try {
  Write-Host "Downloading $asset from release $tag"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp -Headers @{ 'User-Agent' = 'elise-install' }
  } catch {
    Fail "download failed: $url"
  }
  Move-Item -Force -Path $tmp -Destination (Join-Path $dir 'elise.exe')
} catch {
  Fail "cannot write to $dir. A running elise.exe blocks the replacement: close it and run this again. ($($_.Exception.Message))"
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -Force -LiteralPath $tmp }
}

Write-Host "Installed elise ($tag) to $(Join-Path $dir 'elise.exe')"
$old = Join-Path $dir 'elise-runner.exe'
if (Test-Path -LiteralPath $old) {
  try {
    Remove-Item -Force -LiteralPath $old
    Write-Host "Removed the old $old: the command is now elise."
  } catch {
    Write-Host "Could not remove the old $old (is it running?). Delete it by hand: the command is now elise."
  }
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $userPath) { $userPath = '' }
$entries = $userPath -split ';' | Where-Object { $_ -ne '' }
if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $dir.TrimEnd('\') })) {
  $newPath = (@($entries) + $dir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Host "Added $dir to your user PATH. Open a new terminal to pick it up."
}
if (-not (($env:Path -split ';') | Where-Object { $_.TrimEnd('\') -ieq $dir.TrimEnd('\') })) {
  $env:Path = "$env:Path;$dir"
}

Write-Host 'The Runner needs Git for Windows (git and its bash): https://gitforwindows.org'
Write-Host 'Next, run: elise login'
Write-Host 'Then run: elise doctor'
