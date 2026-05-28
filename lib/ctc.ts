// ── CTC Computation Engine ─────────────────────────────────────────────────────
// HireRabbits ATS — CTC Structure Definitions & Calculator
// Formats: NGCTC-1 (VJ1 Executive) … NGCTC-5 (VJ3 Unskilled)

export type CTCTemplateId = 'NGCTC-1' | 'NGCTC-2' | 'NGCTC-3' | 'NGCTC-4' | 'NGCTC-5' | string;

export interface CTCBreakdown {
  annual_ctc: number;
  monthly_ctc: number;
  // Earnings (monthly)
  basic_da: number;
  hra: number;
  conveyance: number;
  performance: number;
  special_allowance: number;
  gross_monthly: number;
  // Employer contributions (monthly, part of CTC)
  epf_employer: number;
  esic_employer: number;
  exgratia: number;
  gratuity: number;
  mediclaim: number;       // monthly
  lwf_employer: number;    // annual
  gpa: number;             // annual
  // Employee deductions (monthly)
  epf_employee: number;
  esic_employee: number;
  prof_tax: number;
  total_deductions: number;
  net_take_home: number;
}

export interface CTCTemplateInfo {
  id: CTCTemplateId;
  label: string;
  name: string;
  ctcRange: string;
}

export const CTC_SYSTEM_TEMPLATES: CTCTemplateInfo[] = [
  { id: 'NGCTC-1', label: 'NGCTC-1', name: 'VJ1 Executive',         ctcRange: '>₹12L or Managerial' },
  { id: 'NGCTC-2', label: 'NGCTC-2', name: 'VJ2 Highly Skilled',    ctcRange: '₹6.5L – ₹11.99L' },
  { id: 'NGCTC-3', label: 'NGCTC-3', name: 'VJ3 Skilled',           ctcRange: '₹4L – ₹6.49L' },
  { id: 'NGCTC-4', label: 'NGCTC-4', name: 'VJ3 Semi-Skilled',      ctcRange: 'Semi-skilled roles' },
  { id: 'NGCTC-5', label: 'NGCTC-5', name: 'VJ3 Unskilled / Fresher', ctcRange: 'Minimum wage compliance' },
];

export function computeCTC(annualCTC: number, templateId: CTCTemplateId): CTCBreakdown {
  const monthly = annualCTC / 12;

  // ── Basic + DA ────────────────────────────────────────────────
  let basic: number;
  if      (templateId === 'NGCTC-1') basic = Math.max(monthly * 0.5,  26000);
  else if (templateId === 'NGCTC-2') basic = Math.max(monthly * 0.4,  26000);
  else if (templateId === 'NGCTC-3') basic = Math.max(monthly * 0.4,  23500);
  else if (templateId === 'NGCTC-4') basic = 23500;
  else                               basic = 18000; // NGCTC-5 min wage placeholder
  basic = Math.round(basic);

  // ── Employer contributions ────────────────────────────────────
  const pfBasic      = Math.min(basic, 15000);
  const epfEmployer  = Math.round(pfBasic * 0.13);          // 12% PF + 1% admin
  const exgratia     = Math.round(basic * 0.0833);          // 8.33% of basic
  const gratuity     = Math.round(basic * 0.0481);          // 4.81% of basic
  const mediclaim    = templateId === 'NGCTC-1' ? 1500 : 600; // monthly
  const lwfEmployer  = 50;                                   // annual
  const gpa          = templateId === 'NGCTC-1' ? 75 : 50;  // annual

  const employerBase = epfEmployer + exgratia + gratuity + mediclaim
                     + Math.round(lwfEmployer / 12) + Math.round(gpa / 12);

  // Estimate gross to determine ESIC eligibility (ESIC: gross ≤ 21000)
  const grossEstimate = monthly - employerBase;
  const esicEmployer  = grossEstimate <= 21000 ? Math.round(grossEstimate * 0.0325) : 0;

  const totalEmployerContrib = employerBase + esicEmployer;
  const gross = Math.round(monthly - totalEmployerContrib);

  // ── Gross breakdown ───────────────────────────────────────────
  const hra         = (templateId === 'NGCTC-1' || templateId === 'NGCTC-2')
                       ? Math.round(basic * 0.5) : 0;
  const conveyance  = Math.round(monthly * 0.1);
  const performance = (templateId !== 'NGCTC-4' && templateId !== 'NGCTC-5')
                       ? Math.round(monthly * 0.1) : 0;
  const special     = Math.max(0, gross - basic - hra - conveyance - performance);

  // ── Employee deductions ───────────────────────────────────────
  const epfEmployee  = Math.round(pfBasic * 0.12);
  const esicEmployee = grossEstimate <= 21000 ? Math.round(grossEstimate * 0.0075) : 0;
  const profTax      = 208; // Kerala
  const totalDed     = epfEmployee + esicEmployee + profTax;
  const netTakeHome  = gross - totalDed;

  return {
    annual_ctc:      annualCTC,
    monthly_ctc:     Math.round(monthly),
    basic_da:        basic,
    hra,
    conveyance,
    performance,
    special_allowance: special,
    gross_monthly:   gross,
    epf_employer:    epfEmployer,
    esic_employer:   esicEmployer,
    exgratia,
    gratuity,
    mediclaim,
    lwf_employer:    lwfEmployer,
    gpa,
    epf_employee:    epfEmployee,
    esic_employee:   esicEmployee,
    prof_tax:        profTax,
    total_deductions: totalDed,
    net_take_home:   netTakeHome,
  };
}

// ── Offer Letter Generator ─────────────────────────────────────────────────────
// Generates a professional offer letter WITHOUT CTC details
export function generateOfferLetterHTML(params: {
  candidateName: string;
  designation: string;
  site: string;
  joiningDate: string;
  offerDate?: string;
  reportingTo?: string;
  probationMonths?: number;
}): string {
  const {
    candidateName,
    designation,
    site,
    joiningDate,
    offerDate,
    reportingTo     = 'HR Manager',
    probationMonths = 6,
  } = params;

  const fmt = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
      : '_______________';

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.75; color: #1a1a1a; margin: 0; padding: 48px 64px; }
  .header { text-align: center; border-bottom: 3px solid #FF2D87; padding-bottom: 18px; margin-bottom: 32px; }
  .logo-text { font-size: 26px; font-weight: 900; color: #FF2D87; letter-spacing: 1px; }
  .logo-sub  { font-size: 12px; color: #888; margin-top: 2px; }
  .meta      { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 12px; color: #555; }
  h2         { text-align: center; font-size: 15px; text-decoration: underline; letter-spacing: 0.5px; margin: 24px 0 20px; }
  p          { margin: 10px 0; text-align: justify; }
  ul         { margin: 8px 0 12px 20px; }
  li         { margin-bottom: 4px; }
  .sig-block { margin-top: 56px; }
  .acceptance{ margin-top: 44px; border-top: 1px solid #ddd; padding-top: 18px; }
  .footer    { margin-top: 48px; border-top: 1px solid #eee; padding-top: 12px; font-size: 10px; color: #aaa; text-align: center; }
  strong     { color: #111; }
</style>
</head>
<body>

<div class="header">
  <div class="logo-text">HIRERABBITS</div>
  <div class="logo-sub">Human Resources Department</div>
</div>

<div class="meta">
  <div>Date: <strong>${offerDate ? fmt(offerDate) : today}</strong></div>
  <div><em>Private &amp; Confidential</em></div>
</div>

<p>To,<br><strong>${candidateName}</strong></p>

<h2>LETTER OF OFFER</h2>

<p>Dear <strong>${candidateName}</strong>,</p>

<p>We are pleased to inform you that after your interactions with us, the Management has decided to offer you the position of <strong>${designation}</strong> at our <strong>${site}</strong> facility, subject to the terms and conditions mentioned herein.</p>

<p>Your appointment will be on a probationary basis for a period of <strong>${probationMonths} (${numberToWords(probationMonths)}) months</strong> commencing from your date of joining. Your performance will be reviewed during this period, and upon satisfactory completion, you will be confirmed in the role.</p>

<p>You will report to <strong>${reportingTo}</strong> or such other person as may be designated by the Management from time to time.</p>

<p><strong>Date of Joining:</strong> You are requested to report for duty on or before <strong>${fmt(joiningDate)}</strong>.</p>

<p>Please report to the HR Department on your date of joining with the following documents (originals and one set of attested photocopies):</p>
<ul>
  <li>All educational qualification certificates (10th, 12th, Diploma/Degree)</li>
  <li>Experience / Relieving letters from previous employers</li>
  <li>Last 3 months' salary slips</li>
  <li>Aadhaar Card and PAN Card</li>
  <li>2 recent passport-size photographs</li>
  <li>Bank account details (cancelled cheque / passbook copy)</li>
  <li>Any other documents as communicated</li>
</ul>

<p>This offer of employment is contingent upon satisfactory results of background and reference verification. The employment shall be governed by the Company's applicable policies, standing orders, and applicable laws in force from time to time.</p>

<p>We look forward to welcoming you to the HireRabbits family and are confident you will make a significant contribution to our organisation.</p>

<div class="sig-block">
  <p>Yours sincerely,</p>
  <br><br>
  <p><strong>_________________________________</strong></p>
  <p>Authorised Signatory<br>Human Resources<br><strong>HireRabbits</strong></p>
</div>

<div class="acceptance">
  <p><strong>Acceptance of Offer</strong></p>
  <p>I, <strong>${candidateName}</strong>, hereby accept the above offer of employment and confirm that I will report for duty on or before the date mentioned above. I have read and understood the terms outlined herein.</p>
  <br>
  <table style="width:100%; font-size:12px;">
    <tr>
      <td>Signature: _________________________</td>
      <td>Date: _____________________</td>
    </tr>
  </table>
</div>

<div class="footer">
  This document is confidential and intended solely for the named recipient. &nbsp;|&nbsp; HireRabbits
</div>

</body>
</html>`;
}

function numberToWords(n: number): string {
  const words: Record<number, string> = {
    1:'One',2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',
    7:'Seven',8:'Eight',9:'Nine',10:'Ten',11:'Eleven',12:'Twelve',
  };
  return words[n] ?? String(n);
}
