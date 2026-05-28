# Hermes LinkedIn Job Posting

This is a local Hermes setup for LinkedIn job-posting drafts. Hermes should use the Playwright runner in this repo, not the generic Hermes browser tool and not desktop screenshots/clicking.

## Saved Browser Profile

LinkedIn login state is stored here:

```txt
C:\Users\admin\.hermes\browser-profiles\linkedin-default
```

The runner opens Chrome with that profile, so LinkedIn should stay signed in after the first manual login.

## One-Time Login

Open the saved LinkedIn browser profile:

```powershell
C:\Users\admin\Music\Rabbits-main\hermes-linkedin-jobs\open-linkedin-login.ps1
```

Sign in manually, connect Google if needed, then close that Chrome window.

Check login:

```powershell
C:\Users\admin\Music\Rabbits-main\hermes-linkedin-jobs\check-linkedin-status.ps1
```

Expected:

```txt
status=signed_in
```

## Exact Job Posting Flow

The Playwright runner follows the same visible steps from the screenshots:

```txt
1. Open https://www.linkedin.com/feed/
2. Click TheBackOfficeCompany from the feed/left area
3. Close the LinkedIn promo popup if it appears
4. Click Jobs in the left company sidebar
5. Click Post a job for free
6. Fill the job title
7. Continue through the early screens
8. Click Skip for now on targeting if it appears
9. Stop before final publish
```

It does not use the broken direct `/admin/jobs/` URL.

## Commands

Status check through Hermes/Git Bash:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh status
```

Open only the company Jobs page and report the URL:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh jobs
```

Start a safe job draft:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager"
```

Start a safe job draft with description text:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager" --description "Paste the approved job description here."
```

From a normal PowerShell window, call Git Bash explicitly so Windows does not use WSL bash:

```powershell
& "C:\Program Files\Git\bin\bash.exe" ./hermes-linkedin-jobs/linkedin-playwright.sh status
& "C:\Program Files\Git\bin\bash.exe" ./hermes-linkedin-jobs/linkedin-playwright.sh jobs
& "C:\Program Files\Git\bin\bash.exe" ./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager"
```

PowerShell helper equivalents:

```powershell
C:\Users\admin\Music\Rabbits-main\hermes-linkedin-jobs\check-linkedin-status.ps1
C:\Users\admin\Music\Rabbits-main\hermes-linkedin-jobs\start-linkedin-job-draft.ps1 -JobTitle "Payroll Manager"
```

## Telegram Prompt

You do not need to say "use terminal" every time. Hermes is instructed by `AGENTS.md` to route normal LinkedIn job-posting requests to the Playwright runner automatically.

Natural Telegram examples:

```txt
Post a LinkedIn job for Payroll Manager. Description: full-time payroll role, Excel, MIS, salary 50000 to 60000, Gandhinagar.
```

```txt
Create a LinkedIn job draft for Backend Developer. Description: Python, FastAPI, APIs, database integrations, Ahmedabad, full-time.
```

If Hermes ever ignores the routing and opens the wrong browser path, use this force prompt:

```txt
Use terminal only. Do not use the generic browser tool.
Run: ./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager"
Follow the feed flow only: open LinkedIn feed, click TheBackOfficeCompany, close popup if it appears, click Jobs in the left company sidebar, click Post a job for free, continue the early screens, click Skip for now if shown, and stop before final publish.
Report the final page title and URL.
```

## Safety Rule

The runner prepares drafts only. It must stop before any final public `Post`, `Publish`, paid promotion, or final submission action unless the user explicitly confirms publishing in the current conversation.

## Troubleshooting

If the script says LinkedIn needs login or checkpoint:

```powershell
C:\Users\admin\Music\Rabbits-main\hermes-linkedin-jobs\open-linkedin-login.ps1
```

If the profile is locked, close any Chrome window using this profile, then retry:

```txt
C:\Users\admin\.hermes\browser-profiles\linkedin-default
```

If Hermes keeps opening old command/browser loops:

```powershell
hermes gateway stop
hermes sessions list
hermes sessions delete --yes <stale-session-id>
hermes --accept-hooks gateway start
```

If it lands on LinkedIn global job search, that means Hermes ignored the Playwright runner and used the generic browser tool. Stop it and send the Telegram prompt above again.
