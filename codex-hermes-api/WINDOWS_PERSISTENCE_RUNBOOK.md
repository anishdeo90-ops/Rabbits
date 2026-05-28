# Windows Persistence Runbook

This machine runs Hermes against a local OpenAI-compatible Codex bridge.

## Bridge

- Folder: `C:\Users\admin\Music\Rabbits-main\codex-hermes-api`
- Health URL: `http://127.0.0.1:8010/health`
- OpenAI-compatible base URL: `http://127.0.0.1:8010/v1`
- Model exposed to Hermes: `codex`
- API key: value of `HERMES_API_KEY` in `C:\Users\admin\Music\Rabbits-main\codex-hermes-api\.env`

The bridge is a Python FastAPI server started by:

```powershell
cd C:\Users\admin\Music\Rabbits-main\codex-hermes-api
.\.venv\Scripts\python.exe server.py
```

## Automatic Startup

Windows Task Scheduler task:

```txt
Codex Hermes Bridge
```

The task runs at user logon and executes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\admin\Music\Rabbits-main\codex-hermes-api\start-codex-hermes-bridge.ps1
```

The startup script checks port `8010` first, so repeated task starts do not create duplicate bridge processes.

## Manual Commands

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

Register or repair the startup task:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\register-codex-hermes-startup-task.ps1
```

Remove the startup task:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\unregister-codex-hermes-startup-task.ps1
```

## Logs

Logs are written here:

```txt
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.out.log
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\logs\bridge.err.log
```

The current bridge PID is written here when started by the script:

```txt
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\codex-hermes-bridge.pid
```

## Troubleshooting

Check the scheduled task:

```powershell
Get-ScheduledTask -TaskName "Codex Hermes Bridge"
Get-ScheduledTaskInfo -TaskName "Codex Hermes Bridge"
```

Check whether anything is listening on port `8010`:

```powershell
Get-NetTCPConnection -LocalPort 8010 -State Listen
```

Check bridge Python processes:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*codex-hermes-api*server.py*" } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
```

On Windows, the venv launcher can appear as a parent `python.exe` process and the actual listening Python process as a child. That is expected. Duplicate bridge instances means more than one listener on port `8010` or more than one independent `server.py` process tree.

If the bridge is stale or duplicated, run:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\stop-codex-hermes-bridge.ps1
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\start-codex-hermes-bridge.ps1
```

This local setup is self-contained. Hermes points directly at `http://127.0.0.1:8010/v1`.

## Hermes Config

Hermes config lives at:

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
```

## After Reboot

1. Log in to Windows as `admin`.
2. Task Scheduler should start `Codex Hermes Bridge` automatically.
3. Verify:

```powershell
curl http://127.0.0.1:8010/health
hermes --accept-hooks -z "Reply with exactly: persistent-hermes-ok"
```

If health fails, run:

```powershell
C:\Users\admin\Music\Rabbits-main\codex-hermes-api\restart-codex-hermes-bridge.ps1
```
