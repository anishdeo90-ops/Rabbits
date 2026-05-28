# Hermes LinkedIn Automation Guardrails

This repo is configured for local Hermes job-posting work on Windows.

Do not use or reference any removed desktop-control helper. The screenshot/clicking desktop setup is intentionally removed.

For LinkedIn job posting, do not use the generic Hermes browser tool. It can land on LinkedIn's global Jobs search page. Use the deterministic Playwright runner from the terminal instead.

The browser profile is saved at:

```txt
C:\Users\admin\.hermes\browser-profiles\linkedin-default
```

Use these commands:

```bash
./hermes-linkedin-jobs/linkedin-playwright.sh status
./hermes-linkedin-jobs/linkedin-playwright.sh jobs
./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager"
```

When the user asks in normal language to post, create, draft, or submit a LinkedIn job for TheBackOfficeCompany, automatically route the request to this Playwright runner. The user does not need to say "use terminal".

Extract the job title and description from the user's message. If the title is missing, ask for the title. If the description is missing, continue with LinkedIn's generated draft unless the user asked to provide custom details.

Example:

```txt
User: Post a LinkedIn job for Payroll Manager. Description: full-time payroll, Excel, MIS, Gandhinagar.
Action: ./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title "Payroll Manager" --description "full-time payroll, Excel, MIS, Gandhinagar"
```

The runner opens LinkedIn with the saved login state and follows this visible flow:

```txt
https://www.linkedin.com/feed/
click TheBackOfficeCompany
close any LinkedIn page promo popup
click Jobs in the left company sidebar
click Post a job for free
```

If LinkedIn asks for login, checkpoint, or browser verification, stop and tell the user what happened. Do not fall back to desktop screenshots, desktop clicking, coordinate clicking, or the removed desktop-control helper.

For job posting, prepare drafts only unless the user explicitly confirms final publishing in the current conversation. Stop before any final public `Post`, `Publish`, or paid promotion action.
