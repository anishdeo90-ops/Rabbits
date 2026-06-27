// Seeds the "BDM Service - Business Development" form into the forms table (type=assessment).
// Idempotent: existing form with the same name is updated, not duplicated.
// Run with:
//   cd /root/ats-staging && node scripts/seed-bdm-service-form.mjs

import { randomBytes } from 'node:crypto';
import { createAdminClient, upsertFormByName } from './supabase-script-client.mjs';

const FORM_NAME = 'BDM Service - Business Development';
const FORM_TYPE = 'assessment';
const FORM_DESC = 'NAVIN GROUP, a 60-year-old business house based in Ahmedabad. We are pleased to inform you that you have been shortlisted. For further scrutiny we request you to fill the form and submit.\n\nTeam HR, Navin Group | www.navingroup.in';

const uid = () => randomBytes(4).toString('hex');

const fld = (type, label, opts = {}) => ({
  id: uid(),
  type,
  label,
  required: opts.required !== false,
  ...(opts.options     ? { options: opts.options }           : {}),
  ...(opts.maps_to     ? { maps_to: opts.maps_to }           : {}),
  ...(opts.placeholder ? { placeholder: opts.placeholder }   : {}),
});

const fields = [
  fld('email',  'Email',                                               { maps_to: 'email' }),
  fld('text',   'Name',                                                { maps_to: 'name' }),
  fld('phone',  'Mobile',                                              { maps_to: 'mobile' }),
  fld('number', 'Age',                                                 { placeholder: 'Years' }),
  fld('text',   'Graduation',                                          { placeholder: 'e.g. B.Com, B.Tech' }),
  fld('text',   'Post Graduation',                                     { placeholder: 'e.g. MBA, M.Com (leave blank if N/A)', required: false }),
  fld('select', 'Experience in Tendering for Govt & Semi Govt Org',    { options: ['Yes', 'No'] }),
  fld('number', 'Experience in BDM Work (In Years)',                   { placeholder: 'e.g. 3' }),
  fld('select', 'Experience of Transport Business Development',        { options: ['Yes', 'No'] }),
  fld('select', 'Liaisoning with Government Officials',                { options: ['Yes', 'No'] }),
  fld('select', 'Experience of Managing Commercial Project',           { options: ['Yes', 'No'] }),
  fld('select', 'Experience in Attending Negotiations with Principals',{ options: ['Yes', 'No'] }),
  fld('select', 'Experience in Costing and Tendering',                 { options: ['Yes', 'No'] }),
  fld('select', 'Knowledge of Port Operations',                        { options: ['Yes', 'No'] }),
  fld('select', 'Knowledge of Generating MIS and Analytics',           { options: ['Yes', 'No'] }),
  fld('select', 'Knowledge of Excel',                                  { options: ["Basic", "Advanced with Formula's (VLookUp, Pivot etc)"] }),
  fld('select', 'Comfortable with Travelling as a Part of Job Role',   { options: ['Yes', 'No'] }),
  fld('text',   'Current Location',                                    { maps_to: 'current_location' }),
  fld('number', 'Current CTC (Per Annum)',                             { maps_to: 'present_salary', placeholder: 'Amount in ₹' }),
  fld('number', 'Expected CTC (Per Annum)',                            { maps_to: 'expected_salary', placeholder: 'Amount in ₹' }),
  fld('number', 'Joining Period (Days)',                               { maps_to: 'notice_period_days', placeholder: 'e.g. 30' }),
];

async function run() {
  const supabase = createAdminClient();
  const result = await upsertFormByName(supabase, {
    name: FORM_NAME,
    type: FORM_TYPE,
    description: FORM_DESC,
    fields,
  });
  console.log(`${result.inserted ? 'Inserted new' : 'Updated existing'} form id=${result.id}`);
}

run().catch(e => { console.error(e); process.exit(1); });
