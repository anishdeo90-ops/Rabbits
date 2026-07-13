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
TODO: ATS posting queue API for Python worker
TODO: Python Playwright worker
TODO: Candidate intake API from Python worker
TODO: Candidate callback from ATS -> Site4People
```

Recommended worker flow:

```text
Site4People
  -> POST boost job to ATS
ATS
  -> stores job
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
