$ErrorActionPreference = "Stop"

$repository = if ($env:TWO_N_REPOSITORY) { $env:TWO_N_REPOSITORY } else { "plannotator/2n" }
$version = if ($env:TWO_N_VERSION) { $env:TWO_N_VERSION } else { "latest" }
$installDirectory = if ($env:TWO_N_INSTALL_DIR) {
    $env:TWO_N_INSTALL_DIR
} else {
    Join-Path $env:LOCALAPPDATA "Programs\2n"
}

$architecture = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x64" }
    "ARM64" { "arm64" }
    default { throw "2n does not provide a Windows release for CPU $env:PROCESSOR_ARCHITECTURE." }
}

$asset = "2n-windows-$architecture"
$archive = "$asset.zip"
$releaseUrl = if ($version -eq "latest") {
    "https://github.com/$repository/releases/latest/download"
} else {
    $tag = if ($version.StartsWith("v")) { $version } else { "v$version" }
    "https://github.com/$repository/releases/download/$tag"
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "2n-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
    $archivePath = Join-Path $temporaryDirectory $archive
    $checksumsPath = Join-Path $temporaryDirectory "checksums.txt"
    Invoke-WebRequest "$releaseUrl/$archive" -OutFile $archivePath
    Invoke-WebRequest "$releaseUrl/checksums.txt" -OutFile $checksumsPath

    $checksumLine = Get-Content $checksumsPath | Where-Object { $_ -match "\s+$([regex]::Escape($archive))\s*$" } | Select-Object -First 1
    if (-not $checksumLine) {
        throw "The release checksum for $archive is missing."
    }
    $expectedChecksum = ($checksumLine.Trim() -split "\s+")[0].ToLowerInvariant()
    $actualChecksum = (Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedChecksum -ne $actualChecksum) {
        throw "The downloaded $archive failed checksum verification."
    }

    Expand-Archive $archivePath -DestinationPath $temporaryDirectory
    New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
    Copy-Item (Join-Path $temporaryDirectory "$asset.exe") (Join-Path $installDirectory "2n.exe") -Force
    Copy-Item (Join-Path $temporaryDirectory "LICENSE.md") (Join-Path $installDirectory "LICENSE.md") -Force

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathEntries = if ($userPath) { $userPath -split ";" } else { @() }
    if ($pathEntries -notcontains $installDirectory) {
        $updatedPath = (@($pathEntries) + $installDirectory | Where-Object { $_ }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $updatedPath, "User")
        $env:Path = "$env:Path;$installDirectory"
    }

    Write-Host "Installed 2n to $installDirectory\2n.exe"
    Write-Host "Open a new terminal, then run: 2n"
} finally {
    Remove-Item $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
