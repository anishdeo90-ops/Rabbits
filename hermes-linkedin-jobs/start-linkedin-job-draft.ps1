param(
  [string]$ProfileName = "default",
  [string]$StartUrl = "https://www.linkedin.com/feed/",
  [string]$CompanyName = "TheBackOfficeCompany",
  [string]$JobTitle = "Payroll Manager",
  [string]$Description = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Split-Path -Parent $Root
$Python = Join-Path $Repo "codex-hermes-api\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = "python"
}

& $Python "$Root\linkedin_job_post.py" --profile-name $ProfileName --start-url $StartUrl --company-name $CompanyName draft --job-title $JobTitle --description $Description
exit $LASTEXITCODE
