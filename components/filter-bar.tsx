"use client";

import { useState } from "react";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import type { Master, Profile } from "@/lib/types";

export interface CandidateFilters {
  search:          string;
  hr_id:           string;
  site_id:         string;
  status:          string;
  designation_id:  string;
  source_id:       string;
  month:           string;
  date_from:       string;
  date_to:         string;
  pi_taken_by:     string;  // manager who took PI
}

const EMPTY: CandidateFilters = {
  search: "", hr_id: "", site_id: "", status: "",
  designation_id: "", source_id: "", month: "",
  date_from: "", date_to: "", pi_taken_by: "",
};

const STATUSES = [
  "Sourced","Applied","Recruiter Screening Done","HR Manager Screening Done",
  "Dept Mgr Screening Done","Mgmt Approved for PI Call","Called for PI",
  "Did Not Attend Interview","PI 1 Done","PI 2 Done","GF Issued","Shortlisted",
  "Shortlisted But Not Offered","Hold","Suitable for Future","Offered But Did Not Join",
  "Offered","Not Interested","Rejected","Appointed","Joined","Joined & Left",
  "Active Employee","Not Yet Processed","Other","Dropped By Candidate",
];

const MONTHS = [
  "April 2025","May 2025","June 2025","July 2025","August 2025","September 2025",
  "October 2025","November 2025","December 2025","January 2026","February 2026",
  "March 2026","April 2026","May 2026","June 2026",
];

interface Props {
  filters:      CandidateFilters;
  onChange:     (f: CandidateFilters) => void;
  sites:        Master[];
  designations: Master[];
  sources:      Master[];
  recruiters:   Profile[];
  isRecruiter:  boolean;
  totalCount:   number;
}

export default function FilterBar({ filters, onChange, sites, designations, sources, recruiters, isRecruiter, totalCount }: Props) {
  const [expanded, setExpanded] = useState(false);

  function set(key: keyof CandidateFilters, val: string) {
    onChange({ ...filters, [key]: val });
  }

  function clear() { onChange({ ...EMPTY }); }

  const activeCount = Object.values(filters).filter(v => v !== "").length;

  const selectClass = "border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white";

  return (
    <div className="bg-white border-b flex-shrink-0">
      {/* ── Primary toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap">

        {/* Search */}
        <input
          placeholder="🔍 Search name, mobile, email…"
          value={filters.search}
          onChange={e => set("search", e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {/* Recruiter — hidden for recruiter role */}
        {!isRecruiter && (
          <select value={filters.hr_id} onChange={e => set("hr_id", e.target.value)} className={selectClass}>
            <option value="">All Recruiters</option>
            {recruiters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}

        {/* Site */}
        <select value={filters.site_id} onChange={e => set("site_id", e.target.value)} className={selectClass}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Status */}
        <select value={filters.status} onChange={e => set("status", e.target.value)} className={selectClass}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Month */}
        <select value={filters.month} onChange={e => set("month", e.target.value)} className={selectClass}>
          <option value="">All Months</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Expand/collapse advanced filters */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            expanded ? "bg-brand-50 border-brand-400 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal size={12} />
          More filters
          {activeCount > 0 && (
            <span className="bg-brand-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
              {activeCount}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        {activeCount > 0 && (
          <button onClick={clear} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
            <X size={12} /> Clear all
          </button>
        )}

        <div className="flex-1" />
        <span className="text-xs text-gray-400 font-medium">{totalCount.toLocaleString()} candidates</span>
      </div>

      {/* ── Advanced filters row ─────────────────────────── */}
      {expanded && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-100 flex-wrap bg-brand-50">
          <span className="text-xs font-semibold text-brand-700 mr-1">Advanced:</span>

          {/* Designation */}
          <select value={filters.designation_id} onChange={e => set("designation_id", e.target.value)} className={selectClass}>
            <option value="">All Designations</option>
            {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Source */}
          <select value={filters.source_id} onChange={e => set("source_id", e.target.value)} className={selectClass}>
            <option value="">All Sources</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* PI taken by (manager filter) */}
          <input
            placeholder="PI taken by (manager name)…"
            value={filters.pi_taken_by}
            onChange={e => set("pi_taken_by", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">App. date:</span>
            <input
              type="date" value={filters.date_from}
              onChange={e => set("date_from", e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date" value={filters.date_to}
              onChange={e => set("date_to", e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
