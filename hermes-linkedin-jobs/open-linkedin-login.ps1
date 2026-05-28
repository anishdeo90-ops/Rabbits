param(
  [string]$ProfileName = "default",
  [string]$Url = "https://www.linkedin.com/feed/"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Split-Path -Parent $Root
$Python = Join-Path $Repo "codex-hermes-api\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = "python"
}

& $Python "$Root\linkedin_job_post.py" --profile-name $ProfileName open-login --url $Url
exit $LASTEXITCODE
