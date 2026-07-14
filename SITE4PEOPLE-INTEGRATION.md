# Site4People Integration

## Boost Job Webhook

Give Site4People this production URL:

```text
https://rabbits-xi.vercel.app/api/integrations/site4people/jobs/boost
```

Method:

```text
POST
```

Headers:

```text
Content-Type: application/json
X-API-KEY: <SITE4PEOPLE_API_KEY>
```

The body can be the boost-job payload Site4People already sends, including `job_uid`, `job_id`, `boost_type`, `title`, `description`, salary, location, skills, and `created_at`.

Successful response:

```json
{
  "data": {
    "ats_job_id": "uuid-from-this-ats",
    "job_uid": "JOB-20260314-000067",
    "site4people_job_id": "67",
    "title": "Field Sales Executive / Marketing Executive"
  }
}
```

`job_uid` is idempotent. If Site4People retries the same boost request, this ATS updates the existing job instead of creating a duplicate.

## Full Automation Flow

This integration is meant to work in four steps:

1. Site4People sends a boosted job to this ATS.
2. This ATS stores the job in `jobs` with `external_source = site4people` and `external_job_uid = job_uid`.
3. A Python + Playwright worker running from the laptop/server reads pending boosted jobs from this ATS and posts them to other platforms.
4. When candidates apply on those platforms, the worker sends candidate data back to this ATS. This ATS then sends those candidates back to Site4People.

Current implementation status:

```text
DONE: Site4People -> ATS boost-job webhook
DONE: ATS stores/updates one canonical jobs row
DONE: Pending migration includes job_postings table for posting status tracking
DONE: Google Jobs public job page with JobPosting JSON-LD
DONE: Sitemap and robots routes for public job URLs
DONE: Public job Apply Now button opens linked form when one is attached
DONE: Google Indexing API submit route and admin Submit button
TODO: ATS posting queue API for Python worker
TODO: Python Playwright worker
TODO: Auto-create candidate from public Google Jobs form submission
TODO: Candidate intake API from Python worker
TODO: Candidate callback from ATS -> Site4People
```

Recommended worker flow:

```text
Site4People
  -> POST boost job to ATS
ATS
  -> stores job
  -> creates Google Jobs tracking row
  -> exposes https://rabbits-xi.vercel.app/public/jobs/<ats_job_id>
Python Playwright worker
  -> GET pending jobs from ATS
  -> posts job to Naukri / LinkedIn / other platforms
  -> POST posting result back to ATS
  -> collects applicants from platforms
  -> POST candidates back to ATS
ATS
  -> stores candidates in candidates table
  -> POST candidate details to Site4People callback URL
```

## Google Jobs Publishing

Google Jobs does not receive a browser automation post. Google discovers jobs from crawlable public pages.

For each boosted job, this ATS exposes:

```text
https://rabbits-xi.vercel.app/public/jobs/<ats_job_id>
```

That page includes `JobPosting` JSON-LD and is included in:

```text
https://rabbits-xi.vercel.app/sitemap.xml
```

`robots.txt` allows `/public/jobs/` and points crawlers to the sitemap:

```text
https://rabbits-xi.vercel.app/robots.txt
```

The Site4People boost response includes the public Google Jobs URL:

```json
{
  "data": {
    "ats_job_id": "uuid-from-this-ats",
    "job_uid": "JOB-20260314-000067",
    "site4people_job_id": "67",
    "title": "Field Sales Executive / Marketing Executive",
    "public_job_url": "https://rabbits-xi.vercel.app/public/jobs/uuid-from-this-ats"
  }
}
```

Google Indexing API setup:

```text
1. Enable the Indexing API in Google Cloud.
2. Create a service account and JSON key.
3. Verify the production site in Google Search Console.
4. Add the service account email as a delegated owner in Search Console.
5. Set NEXT_PUBLIC_SITE_URL to the production https domain.
6. Set GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64 from the service account JSON.
```

Admin users submit a job URL to Google from `/jobs`. The button calls:

```text
POST /api/job-postings/google-indexing
Body: { "job_id": "<ats_job_id>", "type": "URL_UPDATED" }
```

Status meanings:

```text
Ready       = Google Jobs tracking is enabled and the public page is ready.
Submitting  = ATS is calling Google's Indexing API.
Submitted   = Google accepted the URL_UPDATED notification.
Failed      = Google rejected the notification; fix setup/content and retry.
Off         = Google Jobs tracking is disabled for this job.
```

Important: `Submitted` means Google accepted the crawl notification. It does not guarantee that the job is already indexed or ranking.

Next Google Jobs step:

```text
Auto-create candidate from public application form submissions.
```

## Public Apply Flow

The public job page shows an `Apply Now` button.

If the job has an active linked form, the button opens:

```text
/f/<form_id>?j=<ats_job_id>
```

Current storage behavior:

```text
Public form submit
  -> inserts form_responses row
  -> stores form_id, job_id, responses, respondent_name, respondent_email
```

If the URL has an existing candidate id:

```text
/f/<form_id>?c=<candidate_id>&j=<ats_job_id>
```

then the API also updates empty mapped fields on that candidate.

If the URL has only a job id:

```text
/f/<form_id>?j=<ats_job_id>
```

then the response is currently saved in `form_responses`, but it does not yet create a new `candidates` row.

Required next implementation:

```text
When form-responses POST receives job_id and no candidate_id:
  -> create candidates row
  -> set candidates.job_id
  -> set application_date and month
  -> map candidate fields from the form
  -> update form_responses.candidate_id
  -> if job.external_source = site4people, send candidate callback to Site4People
```

After this is built, Google Jobs applicants will appear in `/candidates` and be linked to the original Site4People job.

The Python worker should call private ATS API routes using a worker API key. Do not put the Supabase service-role key on the laptop worker.

Suggested next ATS APIs:

```text
GET  /api/integrations/site4people/posting-queue
POST /api/integrations/site4people/posting-results
POST /api/integrations/site4people/candidates
POST /api/integrations/site4people/candidates/callback
```

Posting tracking table included in the pending migration:

```text
job_postings
id
job_id
platform
status: pending | posting | posted | failed | cancelled
external_post_url
external_post_id
error_message
attempt_count
last_attempt_at
posted_at
created_at
updated_at
```

Laptop Playwright is acceptable for an MVP, but posting and applicant sync will stop if the laptop sleeps, loses internet, or browser sessions expire. For production reliability, run the Python worker on a VPS or always-on machine.

## Candidate Callback To Site4People

Ask Site4People to provide a candidate callback URL. This ATS should POST candidates back with this shape:

```json
{
  "job_uid": "JOB-20260314-000067",
  "site4people_job_id": "67",
  "ats_job_id": "uuid-from-this-ats",
  "ats_candidate_id": "uuid-from-this-ats",
  "name": "Candidate Name",
  "mobile": "9999999999",
  "email": "candidate@example.com",
  "current_location": "Ahmedabad",
  "current_designation": "Sales Executive",
  "resume_url": "https://...",
  "status": "new",
  "source_platform": "Naukri",
  "applied_at": "2026-03-14T10:30:00.000Z"
}
```

Configure that URL as:

```text
SITE4PEOPLE_CANDIDATE_CALLBACK_URL=<their-callback-url>
```
