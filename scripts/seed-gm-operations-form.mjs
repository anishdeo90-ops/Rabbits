// Seeds the "GM Operation & Administration - General Manager Operation & Administration"
// into the forms table (type=assessment).
// Idempotent: existing form with the same name is updated, not duplicated.
// Run with:
//   cd /root/ats-staging && node scripts/seed-gm-operations-form.mjs

import { randomBytes } from 'node:crypto';
import { createAdminClient, upsertFormByName } from './supabase-script-client.mjs';

const FORM_NAME = 'GM Operation & Administration - General Manager Operation & Administration';
const FORM_TYPE = 'assessment';
const FORM_DESC = 'GENERAL MANAGER OPERATIONS AND ADMINISTRATION\n\nNavin Group has diversified business interests in Logistics, Manpower Management, Retail & Ecommerce, Garments, Restaurants & Catering. We are looking for a Operation Manager for our business.\n\nKindly answer all of the below questions truthfully.\n\nwww.navingroup.in';

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
  fld('email',    'Email',                                              { maps_to: 'email' }),
  fld('text',     'Name',                                              { maps_to: 'name' }),
  fld('number',   'Age',                                               { placeholder: 'Years' }),
  fld('phone',    'Mobile No.',                                        { maps_to: 'mobile' }),
  fld('text',     'Total Experience',                                  { placeholder: 'e.g. 12 Years' }),
  fld('select',   'Excel Basic and Advance', {
    options: [
      'Basic Formula',
      'Advanced Formula (V Look, H Look up, Pivot Table etc)',
      "No, I don't know Excel",
    ],
  }),
  fld('text',     'Qualifications — Graduation',                       { placeholder: 'e.g. B.Com, B.Tech' }),
  fld('text',     'Qualifications — Post Graduation',                  { placeholder: 'e.g. MBA, M.Com (leave blank if N/A)', required: false }),
  fld('select',   'Do you have Experience of Costing / Budgeting?',    { options: ['Yes', 'No'] }),
  fld('select',   'Do you have Knowledge of Procurement in General?',  { options: ['Yes', 'No'] }),
  fld('select',   'Do you have Experience of Manpower Recruitment?',   { options: ['Yes', 'No'] }),
  fld('select',   'Do you have Experience of Manpower Planning?',      { options: ['Yes', 'No'] }),
  fld('select',   'Generated MIS Reports and Drawn Analysis?',         { options: ['Yes', 'No'] }),

  // IR — multi-select not supported; textarea lists all options
  fld('textarea', 'Work Undertaken / Knowledge in IR (tick all that apply)', {
    placeholder:
      'List all that apply:\n' +
      '• Liaisoning with Local Authorities & Gov. Bodies\n' +
      '• Conversant with Labour Laws & its Compliance\n' +
      '• Liaison with Labour Department\n' +
      '• Done Negotiation with Union & Contractor\n' +
      '• Experience of Contract Labour Management\n' +
      '• Experience of Handling Court Cases',
  }),
  fld('select',   'Type of Court Cases Handled',                       { options: ['Civil', 'Criminal', 'Labour'], required: false }),

  // HSE — multi-select not supported; textarea lists all options
  fld('textarea', 'Work Undertaken / Knowledge in HSE (tick all that apply)', {
    placeholder:
      'List all that apply:\n' +
      '• Management of Health & Safety Environment\n' +
      '• Formulation of HSE Policies\n' +
      '• Knowledge of All Safety Norms\n' +
      '• Knowledge of Issuing Gate Pass\n' +
      '• Experience in Managing PPE Kits',
  }),

  fld('select',   'Experience of Managing Multiple Locations / Branch Offices from Corporate Office', { options: ['Yes', 'No'] }),
  fld('select',   'Willing to Travel?',                                { options: ['Yes', 'No'] }),
  fld('text',     'Your Current Location',                             { maps_to: 'current_location' }),
  fld('number',   'Present CTC (Per Annum)',                           { maps_to: 'present_salary', placeholder: 'Amount in ₹' }),
  fld('number',   'Expected CTC (Per Annum)',                          { maps_to: 'expected_salary', placeholder: 'Amount in ₹' }),
  fld('number',   'Joining Period (Days)',                             { maps_to: 'notice_period_days', placeholder: 'e.g. 30' }),
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
