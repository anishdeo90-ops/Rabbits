// Seeds the "Executive Assistant Form - Executive Assistant Cum PA" into the forms table (type=assessment).
// Idempotent: existing form with the same name is updated, not duplicated.
// Run with:
//   cd /root/ats-staging && node scripts/seed-executive-assistant-form.mjs

import { randomBytes } from 'node:crypto';
import { createAdminClient, upsertFormByName } from './supabase-script-client.mjs';

const FORM_NAME = 'Executive Assistant Form - Executive Assistant Cum PA';
const FORM_TYPE = 'assessment';
const FORM_DESC = 'Navin Group has diversified business interests in Logistics, Manpower Management, Retail & Ecommerce, Garments, Restaurants & Catering. We are looking for Executive Assistant cum Stenographer for our Ahmedabad HO.\n\nLocation: Ahmedabad | www.navingroup.in';

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
  fld('email',    'Email',                            { maps_to: 'email' }),
  fld('text',     'Name',                             { maps_to: 'name' }),
  fld('phone',    'Contact No.',                      { maps_to: 'mobile' }),
  fld('email',    'Email ID',                         { placeholder: 'Your email address' }),
  fld('select',   'Meeting Arrangements',             { options: ['Yes', 'No'] }),
  fld('select',   'Guest Handling',                   { options: ['Yes', 'No'] }),
  fld('select',   'Filing',                           { options: ['Yes', 'No'] }),
  fld('select',   'Travel Booking',                   { options: ['Yes', 'No'] }),
  fld('select',   'Independent Correspondence',       { options: ['English', 'Gujarati', 'Hindi'] }),
  fld('select',   'Typing',                           { options: ['English', 'Gujarati'] }),
  fld('select',   'Executive Works Follow Up',        { options: ['Yes', 'No'] }),
  fld('select',   'MIS Reports',                      { options: ['Yes', 'No'] }),
  fld('textarea', 'Language Knows (Write / Read / Speak)', {
    placeholder: 'For each language, mention your level of Write / Read / Speak.\nExample:\nEnglish – Write: Yes, Read: Yes, Speak: Yes\nGujarati – Write: Yes, Read: Yes, Speak: Yes\nHindi – Write: Yes, Read: Yes, Speak: Yes',
  }),
  fld('select',   'MS-Excel',                         { options: ['Basic (with formulas & charts)', "Advance (VLookup, Hlookup, Pivotal Table)"] }),
  fld('select',   'MS Word',                          { options: ['Basic', 'Advance (with mail merge)'] }),
  fld('text',     'Typing Speed',                     { placeholder: 'e.g. 40 WPM' }),
  fld('text',     'Shorthand Speed',                  { placeholder: 'e.g. 80 WPM' }),
  fld('text',     'Total Experience',                 { placeholder: 'e.g. 5 Years' }),
  fld('number',   'Current CTC (Per Annum)',          { maps_to: 'present_salary', placeholder: 'Amount in ₹' }),
  fld('number',   'Expected CTC (Per Annum)',         { maps_to: 'expected_salary', placeholder: 'Amount in ₹' }),
  fld('number',   'Notice Period (Days)',             { maps_to: 'notice_period_days', placeholder: 'e.g. 30' }),
  fld('text',     'Current Location',                 { maps_to: 'current_location' }),
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
