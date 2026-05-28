# Hermes Local Setup

This setup is fully local on the Windows laptop.

Hermes does not call the VPS. Hermes calls a local OpenAI-compatible bridge at `127.0.0.1:8010`, and that bridge calls the local Codex CLI installed on this machine.

## Architecture

```txt
Hermes Agent
  -> http://127.0.0.1:8010/v1
  -> local Codex Hermes bridge
  -> local Codex CLI
  -> OpenAI Codex subscription auth already present in Codex CLI
```

No ngrok tunnel is required. No VPS process is required.

## Current Paths

- ATS repo: `C:\Users\admin\Music\Rabbits-main`
- Bridge folder: `C:\Users\admin\Music\Rabbits-main\codex-hermes-api`
- Bridge server: `C:\Users\admin\Music\Rabbits-main\codex-hermes-api\server.py`
- Bridge env: `C:\Users\admin\Music\Rabbits-main\codex-hermes-api\.env`
- Hermes config: `C:\Users\admin\.hermes\config.yaml`
- Hermes env: `C:\Users\admin\.hermes\.env`
- Persistence runbook: `C:\Users\admin\Music\Rabbits-main\codex-hermes-api\WINDOWS_PERSISTENCE_RUNBOOK.md`

## Bridge Endpoint

- Health URL: `http://127.0.0.1:8010/health`
- OpenAI-compatible base URL: `http://127.0.0.1:8010/v1`
- Model name exposed to Hermes: `codex`
- API key source: `HERMES_API_KEY` in `C:\Users\admin\Music\Rabbits-main\codex-hermes-api\.env`

Current bridge `.env` shape:

```txt
HERMES_API_KEY=<local-secret>
HERMES_MODEL_NAME=codex
CODEX_COMMAND=C:\Users\admin\AppData\Roaming\npm\codex.cmd
CODEX_TIMEOUT_SECONDS=600
CODEX_WORKDIR=C:\Users\admin\Music\Rabbits-main
HOST=127.0.0.1
PORT=8010
```

## Hermes Config

Hermes reads:

```txt
C:\Users\admin\.hermes\config.yaml
```

Current model config:

```yaml
model:
  default: codex
  provider: custom
  base_url: http://127.0.0.1:8010/v1
  api_key: <same value as HERMES_API_KEY in bridge .env>

terminal:
  backend: local
  cwd: /c/Users/admin/Music/Rabbits-main
  timeout: 600

hooks_auto_accept: true
```

The Hermes `api_key` must match `HERMES_API_KEY` in the bridge `.env`.

On Windows, Hermes terminal tools run through Git Bash. The matching environment setting lives in `C:\Users\admin\.hermes\.env`:

```env
HERMES_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe
```

## Manual Bridge Commands

Start:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\start-codex-hermes-bridge.ps1
```

Stop:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\stop-codex-hermes-bridge.ps1
```

Restart:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\restart-codex-hermes-bridge.ps1
```

Check health:

```powershell
curl http://127.0.0.1:8010/health
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\check-codex-hermes-bridge.ps1
```

Direct bridge command if the helper scripts are unavailable:

```powershell
cd C:\Users\admin\Music\Rabbits-main\codex-hermes-api
.\.venv\Scripts\python.exe server.py
```

## Windows Startup Persistence

Windows Task Scheduler task:

```txt
Codex Hermes Bridge
```

The task is registered for user logon and runs:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\admin\Music\Rabbits-main\codex-hermes-api\start-codex-hermes-bridge.ps1"
```

Register or repair the startup task:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\register-codex-hermes-startup-task.ps1
```

Remove the startup task:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\unregister-codex-hermes-startup-task.ps1
```

Check task status:

```powershell
Get-ScheduledTask -TaskName "Codex Hermes Bridge"
Get-ScheduledTaskInfo -TaskName "Codex Hermes Bridge"
schtasks.exe /Query /TN "Codex Hermes Bridge" /V /FO LIST
```

The task uses `MultipleInstances=IgnoreNew`, and the startup script checks port `8010`, so repeated starts do not create duplicate listening bridge servers.

## Verification

Check Codex CLI:

```powershell
codex --version
codex exec --skip-git-repo-check --ephemeral --sandbox read-only --color never "Reply with exactly: codex-local-ok"
```

Check bridge health:

```powershell
curl http://127.0.0.1:8010/health
```

Expected:

```json
{"status":"ok","service":"codex-hermes-api","model":"codex"}
```

Check bridge models:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\check-codex-hermes-bridge.ps1
```

Expected:

```txt
health  : ok
service : codex-hermes-api
model   : codex
models  : codex
```

Check Hermes through the bridge:

```powershell
hermes --accept-hooks -z "Reply with exactly: persistent-hermes-ok"
```

Expected:

```txt
persistent-hermes-ok
```

## Telegram Gateway

Telegram is configured through Hermes Gateway.

Telegram config lives in:

```txt
C:\Users\admin\.hermes\.env
```

Required values:

```env
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_ALLOWED_USERS=<your-numeric-telegram-user-id>
```

Current bot:

```txt
@Officehermes269bot
```

Start gateway:

```powershell
hermes gateway start --all
```

Run gateway in foreground for debugging:

```powershell
hermes gateway run --accept-hooks -v
```

Check gateway:

```powershell
hermes gateway status --deep
```

Stop gateway:

```powershell
hermes gateway stop
```

Restart gateway after `.env` changes:

```powershell
hermes --accept-hooks gateway restart
```

View gateway logs:

```powershell
Get-Content C:\Users\admin\.hermes\logs\gateway.log -Tail 100
```

Windows login startup entry:

```txt
C:\Users\admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Hermes_Gateway.cmd
```

Hermes attempted a Scheduled Task install, but Windows denied that operation, so it installed the Startup-folder fallback instead. This still starts the gateway after Windows user login.

## Logs And PID

Logs:

```txt
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.out.log
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.err.log
```

PID file:

```txt
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\codex-hermes-bridge.pid
```

On Windows, the venv launcher can appear as a parent `python.exe` process and the real listening Python runtime can appear as its child. That parent-child pair is normal.

## Duplicate Process Checks

Check the single listener on port `8010`:

```powershell
Get-NetTCPConnection -LocalPort 8010 -State Listen
```

Check bridge Python processes:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*codex-hermes-api*server.py*" } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
```

Healthy state:

- Exactly one listener on `127.0.0.1:8010`.
- One Windows venv parent-child Python process tree is acceptable.
- More than one listener, or more than one independent `server.py` process tree, should be cleaned up with the stop/start scripts.

Cleanup:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\stop-codex-hermes-bridge.ps1
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\start-codex-hermes-bridge.ps1
```

## After Reboot Or Logout/Login

1. Log in to Windows as `admin`.
2. Task Scheduler should start `Codex Hermes Bridge` automatically.
3. Verify:

```powershell
curl http://127.0.0.1:8010/health
hermes --accept-hooks -z "Reply with exactly: persistent-hermes-ok"
```

If the health check fails:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\restart-codex-hermes-bridge.ps1
```

Then check logs:

```powershell
Get-Content C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.err.log -Tail 100
Get-Content C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.out.log -Tail 100
```

## API Key Rotation

Generate a new local secret:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
```

Update both files with the same value:

```txt
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\.env
C:\Users\admin\.hermes\config.yaml
```

Then restart and verify:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\restart-codex-hermes-bridge.ps1
curl http://127.0.0.1:8010/health
hermes --accept-hooks -z "Reply with exactly: persistent-hermes-ok"
```

## LinkedIn Job Posting Runner

LinkedIn job posting uses the local Playwright runner, not the generic Hermes browser tool and not desktop screenshot/click automation.

Saved Chrome profile:

```txt
C:\Users\admin\.hermes\browser-profiles\linkedin-default
```

Hermes terminal commands:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh status
./hermes-linkedin-jobs/linkedin-playwright.sh jobs
./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager"
```

Normal Telegram job requests should also work. Hermes is instructed in `AGENTS.md` to route messages like this to the Playwright runner automatically:

```txt
Post a LinkedIn job for Payroll Manager. Description: full-time payroll, Excel, MIS, Gandhinagar.
```

The runner follows the visible LinkedIn flow:

```txt
https://www.linkedin.com/feed/
click TheBackOfficeCompany
close any popup
click Jobs in the left company sidebar
click Post a job for free
continue the draft flow
stop before final publish
```

Full runbook:

```txt
C:\Users\admin\Music\Rabbits-main\HERMES_LINKEDIN_JOB_POSTING.md
```

## What This Setup Does Not Use

This local setup does not depend on:

- VPS SSH
- ngrok
- tmux
- `/root/codex-hermes-api`
- remote Hermes gateway sessions

Those were part of the older remote handoff and are not part of the active Windows local setup.
