# ==============================================================
# Website DNA Extractor - Release ZIP Builder (v1.2.1+)
# ==============================================================
# Allowlist-only approach: only explicitly listed files are included.
# Prevents logs, secrets, debug images, temp code, build artifacts,
# and Supabase .temp metadata from leaking into the release package.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\zip_code.ps1
#
# Requires: PowerShell 5+, robocopy (built into Windows)
# ==============================================================

$ErrorActionPreference = 'Stop'

$Version = (Get-Content package.json | ConvertFrom-Json).version
$ZipName = "Website_DNA_Extractor_v$Version.zip"

# Safety check: Abort if the GCP service account key file is still present.
$gcpKeyFiles = Get-ChildItem -Path . -Filter "western-verve-*.json" -ErrorAction SilentlyContinue
if ($gcpKeyFiles) {
    Write-Error "SECURITY ABORT: GCP service account key found: $($gcpKeyFiles.Name). Remove it before building a release ZIP."
    exit 1
}

# Warn if .env has real values (it will NOT be included)
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "=\S") {
        Write-Warning ".env contains values - it will NOT be included in the release ZIP."
    }
}

# ── Allowlist of individual root files ────────────────────────────────────────
$allowedFiles = @(
    "package.json",
    "package-lock.json",
    "server.js",
    "extractor.js",
    "dart_api.js",
    "vertex_imagen.js",
    "youtube_extractor.js",
    "ai_verifier.js",
    "gemini_prompter.js",
    "supabaseClient.js",
    "logger.js",
    "cli.js",
    "full_qa_test.js",
    "migration.sql",
    "migration_storage.sql",
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
    ".env.example",
    "netlify.toml",
    "README.md",
    "WEBSITE_DNA_EXTRACTOR.md",
    "eslint.config.js",
    "zip_code.ps1"
)

# ── Allowlist of directories (recursively copied, with exclusions) ─────────────
# NOTE: supabase is included but supabase/.temp is explicitly excluded below.
$allowedDirs = @(
    "config",
    "lib",
    "docs",
    "tests",
    ".github"
)

# Supabase: include only config.toml (not .temp metadata or linked-project.json)
# We handle this manually to avoid including supabase/.temp
$supabaseFiles = @(
    "supabase\config.toml"
)

# ── Frontend: individual files to avoid including dist/ or node_modules/ ──────
$frontendFiles = @(
    "frontend\index.html",
    "frontend\vite.config.js",
    "frontend\package.json",
    "frontend\package-lock.json"
)
$frontendDirs = @(
    "frontend\src"
)

# ── Build temp staging directory ───────────────────────────────────────────────
$TempDir = Join-Path $env:TEMP "WebsiteDNA_Release_$Version"
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

# Copy allowlisted root files
foreach ($file in ($allowedFiles + $supabaseFiles)) {
    if (Test-Path $file) {
        $dest = Join-Path $TempDir $file
        $destDir = Split-Path $dest -Parent
        if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $file $dest -Force
    } else {
        Write-Warning "Allowlist file not found (skipped): $file"
    }
}

# Copy allowlisted frontend individual files
foreach ($file in $frontendFiles) {
    if (Test-Path $file) {
        $dest = Join-Path $TempDir $file
        $destDir = Split-Path $dest -Parent
        if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $file $dest -Force
    } else {
        Write-Warning "Allowlist frontend file not found (skipped): $file"
    }
}

# Copy allowlisted directories (recursively, excluding node_modules, dist, .git, .temp)
$allDirs = $allowedDirs + $frontendDirs
foreach ($dir in $allDirs) {
    $srcPath = $dir
    if (Test-Path $srcPath) {
        $destPath = Join-Path $TempDir $dir
        # /XD excludes directories: node_modules, dist, .git, .temp (Supabase local metadata)
        robocopy $srcPath $destPath /E /XD "node_modules" "dist" ".git" ".temp" /XF "*.log" "*.zip" ".env" > $null
    } else {
        Write-Warning "Allowlist dir not found (skipped): $dir"
    }
}

# Create outputs/.gitkeep so the outputs dir exists but is empty
$outputsDir = Join-Path $TempDir "outputs"
New-Item -ItemType Directory -Path $outputsDir -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $outputsDir ".gitkeep") -Force | Out-Null

# ── Post-build leak validation ─────────────────────────────────────────────────
# Scan the staged directory for files that should never be in a release ZIP.
Write-Host ""
Write-Host "Running post-build leak scan..."

$leakFound = $false

# Files that must not appear in the package
$dangerousPatterns = @(
    @{ Filter = "*.log";                    Label = "Log file" },
    @{ Filter = ".env";                     Label = ".env secret file" },
    @{ Filter = "debug_*.png";              Label = "Debug image" },
    @{ Filter = "western-verve-*.json";     Label = "GCP service account key" },
    @{ Filter = "linked-project.json";      Label = "Supabase linked-project metadata" },
    @{ Filter = "pooler-url";               Label = "Supabase pooler-url metadata" },
    @{ Filter = "project-ref";              Label = "Supabase project-ref metadata" }
)

foreach ($entry in $dangerousPatterns) {
    $hits = Get-ChildItem $TempDir -Recurse -Filter $entry.Filter -ErrorAction SilentlyContinue
    foreach ($hit in $hits) {
        Write-Warning ("LEAK: " + $entry.Label + " found at " + $hit.FullName)
        $leakFound = $true
    }
}

# Check for private_key string inside any JSON file
$jsonFiles = Get-ChildItem $TempDir -Recurse -Filter "*.json" -ErrorAction SilentlyContinue
foreach ($jf in $jsonFiles) {
    if (Select-String -Path $jf.FullName -Pattern "private_key" -Quiet) {
        Write-Warning ("LEAK: private_key found in " + $jf.FullName)
        $leakFound = $true
    }
}

if ($leakFound) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Error "SECURITY ABORT: Leak scan failed. Fix the warnings above before distributing."
    exit 1
} else {
    Write-Host "  Leak scan passed - no sensitive files detected."
}


# ── Create the ZIP ─────────────────────────────────────────────────────────────
if (Test-Path $ZipName) { Remove-Item $ZipName -Force }
Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipName -Force

# Cleanup temp dir
Remove-Item $TempDir -Recurse -Force

# ── Summary ────────────────────────────────────────────────────────────────────
$zipInfo = Get-Item $ZipName
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host ""
Write-Host "======================================================"
Write-Host "  Release ZIP: $ZipName"
Write-Host "  Size: $sizeMB MB  |  Version: $Version"
Write-Host "======================================================"
Write-Host ""
Write-Host "Pre-release checklist:"
Write-Host "  [x] vertex_imagen.js included"
Write-Host "  [x] supabase/.temp excluded"
Write-Host "  [x] tests/ directory included"
Write-Host "  [x] No .env or secret files"
Write-Host "  [x] No GCP service account keys"
Write-Host "  [x] No log files or debug images"
Write-Host "  [x] No frontend/dist build artifacts"
Write-Host "  [ ] DART_API_KEY and HISTORY_API_KEY set in production env (Railway)"
Write-Host "  [ ] VITE_HISTORY_API_KEY set in Netlify env vars"
Write-Host ""
