// Seeds the "Candidate Data Form — Navin Group" into the forms table.
// Idempotent: if a form with the same name already exists, updates its fields
// instead of inserting a duplicate. Run with:
//   cd /root/ats-staging && node scripts/seed-navin-candidate-form.mjs

import { randomBytes } from 'node:crypto';
import { createAdminClient, upsertFormByName } from './supabase-script-client.mjs';

const FORM_NAME = 'Candidate Data Form — Navin Group';
const FORM_DESC = 'Full candidate data form. Fill each section using the tabs above — your answers are linked to your candidate profile automatically.';

const uid = () => randomBytes(4).toString('hex');

const sec = (label) => ({ id: uid(), type: 'section', label, required: false });

const fld = (type, label, opts = {}) => ({
  id: uid(),
  type,
  label,
  required: !!opts.required,
  ...(opts.options ? { options: opts.options } : {}),
  ...(opts.maps_to ? { maps_to: opts.maps_to } : {}),
  ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
});

const fields = [
  // 1. Personal Bio-Data
  sec('Personal Bio-Data'),
  fld('text',     'Post Applied For',           { required: true }),
  fld('text',     'First Name',                 { required: true }),
  fld('text',     'Middle Name'),
  fld('text',     'Last Name',                  { required: true }),
  fld('number',   'Age (Years)',                { required: true }),
  fld('select',   'Marital Status',             { required: true, options: ['Single', 'Married', 'Divorced', 'Widowed'] }),
  fld('select',   'Sex',                        { required: true, options: ['Male', 'Female', 'Other'] }),
  fld('date',     'Date of Birth',              { required: true }),
  fld('email',    'Email',                      { required: true, maps_to: 'email' }),
  fld('phone',    'Phone',                      { required: true, maps_to: 'mobile' }),
  fld('phone',    'Alternate / Landline No.'),

  // 2. Present Address
  sec('Present Address'),
  fld('text',     'Address Line 1',             { required: true }),
  fld('text',     'Address Line 2'),
  fld('text',     'City',                       { required: true, maps_to: 'current_location' }),
  fld('text',     'State / Province / Region',  { required: true }),
  fld('text',     'Postal / Zip Code',          { required: true }),
  fld('text',     'Country',                    { required: true }),

  // 3. Permanent Address
  sec('Permanent Address'),
  fld('text',     'Address Line 1'),
  fld('text',     'Address Line 2'),
  fld('text',     'City'),
  fld('text',     'State / Province / Region'),
  fld('text',     'Postal / Zip Code'),
  fld('text',     'Country'),

  // 4. Other Info (vehicles, LinkedIn, caste/religion)
  sec('Other Info'),
  fld('number',   'Quantity of 2-Wheelers Owned'),
  fld('number',   'Quantity of 4-Wheelers Owned'),
  fld('text',     'LinkedIn Profile URL',       { placeholder: 'https://linkedin.com/in/…' }),
  fld('text',     'Residential Status'),
  fld('text',     'Caste'),
  fld('text',     'Religion'),

  // 5. Education
  sec('Educational Qualification'),
  fld('text',     '10th / Matriculation — Board / University',        { required: true }),
  fld('number',   '10th / Matriculation — Year of Passing',           { required: true }),
  fld('number',   '10th / Matriculation — Percentage / CGPA',         { required: true }),
  fld('text',     '10th / Matriculation — Medium of Instruction'),
  fld('text',     '12th / HSC — Specialization (e.g. Science / Commerce / Arts)'),
  fld('text',     '12th / HSC — Board / University',                  { required: true }),
  fld('number',   '12th / HSC — Year of Passing',                     { required: true }),
  fld('number',   '12th / HSC — Percentage / CGPA',                   { required: true }),
  fld('text',     '12th / HSC — Medium of Instruction'),
  fld('text',     'Graduation — Degree (e.g. B.Com)',                  { required: true }),
  fld('text',     'Graduation — Specialization'),
  fld('text',     'Graduation — University',                           { required: true }),
  fld('number',   'Graduation — Year of Passing',                      { required: true }),
  fld('number',   'Graduation — Percentage / CGPA',                    { required: true }),
  fld('text',     'Graduation — Medium of Instruction'),
  fld('text',     'Post Graduation — Degree (e.g. MBA)',               { required: true }),
  fld('text',     'Post Graduation — Specialization'),
  fld('text',     'Post Graduation — University',                      { required: true }),
  fld('number',   'Post Graduation — Year of Passing',                 { required: true }),
  fld('number',   'Post Graduation — Percentage / CGPA',               { required: true }),
  fld('text',     'Post Graduation — Medium of Instruction'),
  fld('text',     'Diploma / Other Course — Name'),
  fld('text',     'Diploma / Other Course — Specialization'),
  fld('text',     'Diploma / Other Course — University / Institute'),
  fld('number',   'Diploma / Other Course — Year of Passing'),
  fld('number',   'Diploma / Other Course — Percentage / CGPA'),

  // 6. Family Background (3 members)
  sec('Family Background'),
  fld('text',     'Member 1 — Name'),
  fld('text',     'Member 1 — Relationship (e.g. Father / Mother / Spouse)'),
  fld('number',   'Member 1 — Age'),
  fld('text',     'Member 1 — Education'),
  fld('text',     'Member 1 — Occupation'),
  fld('number',   'Member 1 — Monthly Earning (₹)'),
  fld('text',     'Member 2 — Name'),
  fld('text',     'Member 2 — Relationship'),
  fld('number',   'Member 2 — Age'),
  fld('text',     'Member 2 — Education'),
  fld('text',     'Member 2 — Occupation'),
  fld('number',   'Member 2 — Monthly Earning (₹)'),
  fld('text',     'Member 3 — Name'),
  fld('text',     'Member 3 — Relationship'),
  fld('number',   'Member 3 — Age'),
  fld('text',     'Member 3 — Education'),
  fld('text',     'Member 3 — Occupation'),
  fld('number',   'Member 3 — Monthly Earning (₹)'),

  // 7. Present Job
  sec('Present Job Details'),
  fld('text',     'Name of Company'),
  fld('text',     'Name of Immediate Boss'),
  fld('text',     'Post / Designation'),
  fld('text',     'Location'),
  fld('phone',    'Company Phone'),
  fld('text',     'Product / Industry'),
  fld('text',     'Company Turnover'),
  fld('textarea', 'Current Job Description'),
  fld('date',     'Date of Joining'),
  fld('date',     'Date of Leaving (if applicable)'),
  fld('number',   'Starting Salary (₹)'),
  fld('textarea', 'Reason for Leaving (if applicable)'),

  // 8. Current Salary
  sec('Current Salary Break-up'),
  fld('number',   'Monthly Take Home (P.M) (₹)',            { maps_to: 'present_salary' }),
  fld('number',   'Take Home Per Annum (P.A) (₹)'),
  fld('text',     'Take Home Remarks'),
  fld('number',   'Other Allowances P.M (₹)'),
  fld('number',   'Other Allowances Per Annum P.A (₹)'),
  fld('text',     'Allowance Remarks'),

  // 9. Past Experience 1
  sec('Past Experience — 1'),
  fld('text',     'Company Name'),
  fld('text',     'Designation'),
  fld('phone',    'Company Phone'),
  fld('date',     'From'),
  fld('date',     'To'),
  fld('text',     'Business / Turnover'),
  fld('text',     'Address'),
  fld('number',   'Starting Salary (₹)'),
  fld('number',   'Last Salary (₹)'),
  fld('textarea', 'Reason for Leaving'),

  // 10. Past Experience 2
  sec('Past Experience — 2'),
  fld('text',     'Company Name'),
  fld('text',     'Designation'),
  fld('phone',    'Company Phone'),
  fld('date',     'From'),
  fld('date',     'To'),
  fld('text',     'Business / Turnover'),
  fld('text',     'Address'),
  fld('number',   'Starting Salary (₹)'),
  fld('number',   'Last Salary (₹)'),
  fld('textarea', 'Reason for Leaving'),

  // 11. Past Experience 3 (optional)
  sec('Past Experience — 3 (optional)'),
  fld('text',     'Company Name'),
  fld('text',     'Designation'),
  fld('phone',    'Company Phone'),
  fld('date',     'From'),
  fld('date',     'To'),
  fld('text',     'Business / Turnover'),
  fld('text',     'Address'),
  fld('number',   'Starting Salary (₹)'),
  fld('number',   'Last Salary (₹)'),
  fld('textarea', 'Reason for Leaving'),

  // 12. References
  sec('References'),
  fld('text',     'Reference 1 — First Name',   { required: true }),
  fld('text',     'Reference 1 — Last Name',    { required: true }),
  fld('text',     'Reference 1 — Your Relation (e.g. Friend, Ex-Manager — NOT family)', { required: true }),
  fld('text',     'Reference 1 — Occupation'),
  fld('phone',    'Reference 1 — Phone',        { required: true }),
  fld('text',     'Reference 2 — First Name',   { required: true }),
  fld('text',     'Reference 2 — Last Name',    { required: true }),
  fld('text',     'Reference 2 — Your Relation', { required: true }),
  fld('text',     'Reference 2 — Occupation'),
  fld('phone',    'Reference 2 — Phone',        { required: true }),
  fld('select',   'May we contact your current organization for a reference check?', { required: true, options: ['Yes', 'No'] }),

  // 13. Expected Package & Joining
  sec('Expected Package & Joining'),
  fld('number',   'Net Take Home Per Month (₹)', { required: true, maps_to: 'expected_salary' }),
  fld('select',   'Is the expected salary negotiable?', { required: true, options: ['Yes', 'No'] }),
  fld('text',     'Earliest Joining Date (e.g. Immediately, 30 days notice, DD/MM/YYYY)', { required: true }),
  fld('number',   'Years of bond you would agree to (if all your demands are accepted)'),

  // 14. Agreement
  sec('Agreement'),
  fld('checkbox', 'I confirm all information stated above is absolutely true. I understand any improper representation may result in termination of my services without prior notice.', { required: true }),
  fld('date',     'Date',                       { required: true }),
  fld('text',     'Signature (Full Name)',      { required: true }),
];

console.log(`Building form with ${fields.length} entries (${fields.filter(f => f.type === 'section').length} sections, ${fields.filter(f => f.type !== 'section').length} fields)…`);

try {
  const supabase = createAdminClient();
  const result = await upsertFormByName(supabase, {
    name: FORM_NAME,
    type: 'application',
    description: FORM_DESC,
    fields,
  });
  console.log(`${result.inserted ? 'Inserted new' : 'Updated existing'} form id=${result.id}`);
  console.log(`Share base URL: /f/${result.id}  (append ?c=<candidateId> when sending to a candidate)`);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
}
