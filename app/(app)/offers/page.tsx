"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle, Clock, Send, FileText, Users, TrendingUp,
  RefreshCw, Filter, ExternalLink, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OfferRow {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_mobile?: string;
  designation_name?: string;
  site_name?: string;
  creator_name?: string;
  status: string;
  annual_ctc?: number;
  ctc_data?: Record<string, number>;
  ctc_sent_at?: string;
  ctc_confirmed_at?: string;
  ctc_confirm_method?: string;
  offer_sent_at?: string;
  offer_confirmed_at?: string;
  offer_confirm_notes?: string;
  joining_date?: string;
  joined_at?: string;
  designation?: string;
  site?: string;
  notes?: string;
  locked_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const STAGES = [
  { key: "all",              label: "All",              color: "gray"    },
  { key: "draft",            label: "Draft",            color: "gray"    },
  { key: "ctc_sent",         label: "CTC Sent",         color: "blue"    },
  { key: "ctc_confirmed",    label: "CTC Confirmed",    color: "indigo"  },
  { key: "offer_sent",       label: "Offer Sent",       color: "orange"  },
  { key: "offer_confirmed",  label: "Offer Confirmed",  color: "green"   },
  { key: "joined",           label: "Joined",           color: "emerald" },
  { key: "withdrawn",        label: "Withdrawn",        color: "red"     },
];

const STATUS_COLORS: Record<string, string> = {
  draft:           "bg-gray-100 text-gray-600",
  ctc_sent:        "bg-blue-100 text-blue-700",
  ctc_confirmed:   "bg-indigo-100 text-indigo-700",
  offer_sent:      "bg-brand-100 text-brand-700",
  offer_confirmed: "bg-green-100 text-green-700",
  joined:          "bg-emerald-100 text-emerald-700",
  withdrawn:       "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", ctc_sent: "CTC Sent", ctc_confirmed: "CTC Confirmed",
  offer_sent: "Offer Sent", offer_confirmed: "Offer Confirmed",
  joined: "Joined", withdrawn: "Withdrawn",
};

const CONFIRM_METHOD_LABEL: Record<string, string> = {
  physical_sign: "📝 Physical Sign",
  email:         "✉️ Email",
  whatsapp:      "💬 WhatsApp",
  verbal:        "🗣️ Verbal",
};

// ── Confirm CTC modal ─────────────────────────────────────────────────────────
interface CTCConfirmModalProps {
  offer: OfferRow;
  onClose: () => void;
  onConfirm: (method: string, notes: string) => void;
}
function CTCConfirmModal({ offer, onClose, onConfirm }: CTCConfirmModalProps) {
  const [method, setMethod] = useState("email");
  const [notes, setNotes]   = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">CTC Confirmed — {offer.candidate_name}</h3>
        <p className="text-sm text-gray-500">How did the candidate confirm the salary structure?</p>

        <div className="space-y-2">
          {[
            { value: "physical_sign", label: "📝 Signed physical copy" },
            { value: "email",         label: "✉️ Written confirmation via email" },
            { value: "whatsapp",      label: "💬 WhatsApp confirmation" },
            { value: "verbal",        label: "🗣️ Verbal / in-person" },
          ].map(opt => (
            <label key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                method === opt.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
              }`}>
              <input type="radio" name="ctc_method" value={opt.value}
                checked={method === opt.value}
                onChange={() => setMethod(opt.value)}
                className="accent-indigo-500" />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} placeholder="e.g. Signed and returned on 28 Apr, scanned copy in Drive"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => onConfirm(method, notes)}
            className="flex-1 bg-indigo-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-indigo-600">
            Confirm CTC
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-sm text-gray-600 py-2 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Offer confirm modal (written confirmation) ────────────────────────────────
interface OfferConfirmModalProps {
  offer: OfferRow;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}
function OfferConfirmModal({ offer, onClose, onConfirm }: OfferConfirmModalProps) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Offer Accepted — {offer.candidate_name}</h3>
        <p className="text-sm text-gray-500">Record the written confirmation received from the candidate (email reply, signed scan, etc.)</p>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Confirmation Notes *</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Candidate replied via email on 1 May confirming acceptance. Email forwarded to admin@hirerabbits.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <p className="text-xs text-gray-400">This note will be saved against the offer for audit purposes.</p>

        <div className="flex gap-2 pt-1">
          <button onClick={() => onConfirm(notes)}
            className="flex-1 bg-green-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-600">
            Mark Offer Accepted
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-sm text-gray-600 py-2 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OffersPage() {
  const [offers, setOffers]         = useState<OfferRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState("all");
  const [myOnly, setMyOnly]         = useState(false);
  const [ctcModal, setCtcModal]     = useState<OfferRow | null>(null);
  const [offerModal, setOfferModal] = useState<OfferRow | null>(null);
  const [acting, setActing]         = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      if (myOnly) params.set("my", "1");
      const res = await fetch(`/api/offers?${params}`);
      if (res.ok) { const j = await res.json(); setOffers(j.data ?? []); }
    } finally { setLoading(false); }
  }, [tab, myOnly]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  async function patchOffer(candidateId: string, offerId: string, updates: Record<string, unknown>) {
    setActing(offerId);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/offers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, ...updates }),
      });
      if (res.ok) { toast.success("Updated"); fetchOffers(); }
      else { const j = await res.json(); toast.error(j.error ?? "Failed"); }
    } finally { setActing(null); }
  }

  async function handleCTCConfirm(offer: OfferRow, method: string, notes: string) {
    setCtcModal(null);
    await patchOffer(offer.candidate_id, offer.id, {
      status: "ctc_confirmed",
      ctc_confirm_method: method,
      ctc_notes: notes || undefined,
    });
  }

  async function handleOfferConfirm(offer: OfferRow, notes: string) {
    setOfferModal(null);
    await patchOffer(offer.candidate_id, offer.id, {
      status: "offer_confirmed",
      offer_confirm_notes: notes || undefined,
    });
  }

  // KPI counts
  const counts = STAGES.slice(1).reduce((acc, s) => {
    acc[s.key] = offers.filter(o => o.status === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  // Visible offers after tab filter (already server-filtered but tab="all" shows everything)
  const visible = tab === "all" ? offers : offers.filter(o => o.status === tab);

  function fmtCTC(ctc?: number) {
    if (!ctc) return "—";
    return `₹${(ctc / 100000).toFixed(2)}L`;
  }
  function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Offers Pipeline</h1>
            <p className="text-xs text-gray-500 mt-0.5">Track every offer from CTC sent to joining</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)}
                className="accent-brand-500 w-3.5 h-3.5" />
              My offers only
            </label>
            <button onClick={fetchOffers}
              className="flex items-center gap-1.5 border border-gray-200 text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {/* KPI pills */}
        <div className="flex gap-2 flex-wrap mt-4">
          {[
            { key: "ctc_sent",        label: "CTC Sent",        icon: Send,        bg: "bg-blue-50",    text: "text-blue-700"    },
            { key: "ctc_confirmed",   label: "CTC Confirmed",   icon: CheckCircle, bg: "bg-indigo-50",  text: "text-indigo-700"  },
            { key: "offer_sent",      label: "Offer Sent",      icon: FileText,    bg: "bg-brand-50",  text: "text-brand-700"  },
            { key: "offer_confirmed", label: "Offer Confirmed", icon: CheckCircle, bg: "bg-green-50",   text: "text-green-700"   },
            { key: "joined",          label: "Joined",          icon: Users,       bg: "bg-emerald-50", text: "text-emerald-700" },
          ].map(kpi => (
            <button key={kpi.key} onClick={() => setTab(kpi.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${kpi.bg} ${kpi.text} hover:opacity-80 ${tab === kpi.key ? "ring-2 ring-offset-1 ring-current" : ""}`}>
              <kpi.icon size={13} />
              <span>{kpi.label}</span>
              <span className="font-bold text-sm">{counts[kpi.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 px-6 flex gap-0 overflow-x-auto">
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setTab(s.key)}
            className={`text-xs font-medium px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              tab === s.key ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {s.label}
            {s.key !== "all" && <span className="ml-1.5 text-gray-400">({counts[s.key] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading offers…</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <TrendingUp size={32} className="text-gray-200" />
            <p className="text-sm text-gray-400">No offers in this stage</p>
            <p className="text-xs text-gray-300">Open a candidate → Offer tab to create one</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role / Site</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CTC</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timeline</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Action</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(offer => (
                  <tr key={offer.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Candidate */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{offer.candidate_name}</p>
                      {offer.candidate_mobile && (
                        <p className="text-xs text-gray-400">{offer.candidate_mobile}</p>
                      )}
                      {offer.creator_name && (
                        <p className="text-xs text-gray-400 mt-0.5">by {offer.creator_name}</p>
                      )}
                    </td>

                    {/* Role / Site */}
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{offer.designation || offer.designation_name || "—"}</p>
                      <p className="text-xs text-gray-400">{offer.site || offer.site_name || ""}</p>
                    </td>

                    {/* CTC */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{fmtCTC(offer.annual_ctc)}</p>
                      {offer.ctc_data?.net_take_home && (
                        <p className="text-xs text-gray-400">
                          ₹{Math.round(offer.ctc_data.net_take_home).toLocaleString("en-IN")}/mo
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[offer.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[offer.status] ?? offer.status}
                      </span>
                      {offer.ctc_confirm_method && (
                        <p className="text-xs text-gray-400 mt-1">
                          {CONFIRM_METHOD_LABEL[offer.ctc_confirm_method]}
                        </p>
                      )}
                      {offer.offer_confirm_notes && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-[160px] truncate" title={offer.offer_confirm_notes}>
                          📋 {offer.offer_confirm_notes}
                        </p>
                      )}
                    </td>

                    {/* Timeline */}
                    <td className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
                      {offer.ctc_sent_at        && <p>CTC sent: {fmtDate(offer.ctc_sent_at)}</p>}
                      {offer.ctc_confirmed_at   && <p>CTC conf: {fmtDate(offer.ctc_confirmed_at)}</p>}
                      {offer.offer_sent_at      && <p>Offer sent: {fmtDate(offer.offer_sent_at)}</p>}
                      {offer.offer_confirmed_at && <p className="text-green-600">Accepted: {fmtDate(offer.offer_confirmed_at)}</p>}
                      {offer.joined_at          && <p className="text-emerald-600 font-medium">Joined: {offer.joined_at}</p>}
                      {offer.joining_date && !offer.joined_at && (
                        <p className="text-brand-600">Expected: {fmtDate(offer.joining_date)}</p>
                      )}
                    </td>

                    {/* Next Action */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {offer.status === "draft" && (
                          <button
                            disabled={acting === offer.id}
                            onClick={() => patchOffer(offer.candidate_id, offer.id, { status: "ctc_sent" })}
                            className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1">
                            <Send size={10} /> Send CTC
                          </button>
                        )}
                        {offer.status === "ctc_sent" && (
                          <button
                            onClick={() => setCtcModal(offer)}
                            className="text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 flex items-center gap-1">
                            <CheckCircle size={10} /> CTC Confirmed
                          </button>
                        )}
                        {offer.status === "ctc_confirmed" && (
                          <button
                            disabled={acting === offer.id}
                            onClick={() => patchOffer(offer.candidate_id, offer.id, { status: "offer_sent" })}
                            className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-1">
                            <FileText size={10} /> Send Offer Letter
                          </button>
                        )}
                        {offer.status === "offer_sent" && (
                          <button
                            onClick={() => setOfferModal(offer)}
                            className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 flex items-center gap-1">
                            <CheckCircle size={10} /> Mark Accepted
                          </button>
                        )}
                        {offer.status === "offer_confirmed" && (
                          <button
                            disabled={acting === offer.id}
                            onClick={() => patchOffer(offer.candidate_id, offer.id, { status: "joined" })}
                            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                            <Users size={10} /> Mark Joined
                          </button>
                        )}
                        {offer.status === "joined" && (
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle size={11} /> Done
                          </span>
                        )}
                        {!["joined","withdrawn"].includes(offer.status) && (
                          <button
                            disabled={acting === offer.id}
                            onClick={() => patchOffer(offer.candidate_id, offer.id, { status: "withdrawn" })}
                            className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                            Withdraw
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Open candidate */}
                    <td className="px-3 py-3">
                      <a href={`/candidates?open=${offer.candidate_id}&tab=offer`}
                        target="_blank" rel="noopener noreferrer"
                        title="Open candidate detail"
                        className="text-gray-300 hover:text-brand-500 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CTC Confirm modal */}
      {ctcModal && (
        <CTCConfirmModal
          offer={ctcModal}
          onClose={() => setCtcModal(null)}
          onConfirm={(method, notes) => handleCTCConfirm(ctcModal, method, notes)}
        />
      )}

      {/* Offer Accepted modal */}
      {offerModal && (
        <OfferConfirmModal
          offer={offerModal}
          onClose={() => setOfferModal(null)}
          onConfirm={(notes) => handleOfferConfirm(offerModal, notes)}
        />
      )}
    </div>
  );
}
