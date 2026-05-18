import { FileText, HelpCircle, Phone, Scan, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

export type VoiceConsoleTab = "live-call" | "transcript" | "evidence" | "trace";

interface HeaderStatusProps {
  activeTab: VoiceConsoleTab;
  connection: LiveCallViewModel["connection"];
  onTabSelect: (tab: VoiceConsoleTab) => void;
}

const navItems: Array<{
  id: VoiceConsoleTab;
  icon: typeof Phone;
  label: string;
}> = [
  { id: "live-call", icon: Phone, label: "Live Call" },
  { id: "transcript", icon: FileText, label: "Transcript" },
  { id: "evidence", icon: ShieldCheck, label: "Evidence" },
  { id: "trace", icon: Scan, label: "Trace" }
];

const helpStorageKey = "mealplan-voiceops-tester-guide-seen-v1";

const demoProfiles = [
  {
    customerId: "cus_001",
    name: "Maya",
    phoneCue: "phone ending 0001",
    plan: "High Protein",
    why: "Best first run: identity succeeds, payment is failed, and delivery changes create a preview.",
    prompt: '"This is Maya, customer cus_001. Pause my Wednesday delivery."'
  },
  {
    customerId: "cus_002",
    name: "Omar",
    phoneCue: "phone ending 0002",
    plan: "Balanced",
    why: "Useful for locked-date and cutoff checks around delivery changes.",
    prompt: '"This is Omar, customer cus_002. Move my next delivery to Monday."'
  },
  {
    customerId: "cus_003",
    name: "Lina",
    phoneCue: "phone ending 0003",
    plan: "Vegetarian",
    why: "Good for allergy and medical-risk escalation. Allergy changes should not be committed.",
    prompt: '"This is Lina, customer cus_003. Remove sesame from my allergies."'
  },
  {
    customerId: "cus_004",
    name: "Maya Haddad",
    phoneCue: "phone ending 0099",
    plan: "High Protein",
    why: "One of two similar Maya profiles sharing a phone number. The agent should clarify identity.",
    prompt: '"My phone ends 0099. I am Maya Haddad. Pause my Friday delivery."'
  },
  {
    customerId: "cus_005",
    name: "Maya Hadad",
    phoneCue: "phone ending 0099",
    plan: "Balanced",
    why: "The second ambiguous Maya profile, with past-due payment context for payment-policy testing.",
    prompt: '"My phone ends 0099. I am Maya Hadad. Check my payment and pause Thursday."'
  }
] as const;

export function HeaderStatus({
  activeTab,
  connection,
  onTabSelect
}: HeaderStatusProps) {
  const isConnected = connection.status === "connected";
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(helpStorageKey)) return;
      window.localStorage.setItem(helpStorageKey, "true");
      setHelpOpen(true);
    } catch {
      setHelpOpen(true);
    }
  }, []);

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-6">
          <div
            aria-label="MealPlan VoiceOps"
            className="flex items-center font-semibold text-lg text-gray-900"
          >
            <span className="font-bold">
              MealPlan <span className="text-green-600 font-medium">VoiceOps</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-300"}`}
              aria-hidden="true"
            />
            {connectionLabel(connection.status)}
          </div>
        </div>

        <nav
          className="flex space-x-6 list-none text-sm font-medium text-gray-500"
          aria-label="Voice console sections"
          role="tablist"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
              <button
                aria-controls={`${item.id}-panel`}
                aria-selected={selected}
                className={`${selected ? "text-blue-600 font-semibold border-b-2 border-blue-600" : "hover:text-gray-900 border-b-2 border-transparent"} pb-[13px] flex items-center gap-2`}
                id={`${item.id}-tab`}
                key={item.id}
                onClick={() => onTabSelect(item.id)}
                role="tab"
                type="button"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <button
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            aria-label="Help"
            className="text-gray-400 hover:text-gray-600"
            onClick={() => setHelpOpen(true)}
            type="button"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {helpOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-gray-900/20 p-6">
          <div
            aria-labelledby="voice-console-help-title"
            aria-modal="true"
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900" id="voice-console-help-title">
                  Tester guide
                </h2>
                <p className="mt-1 text-sm leading-5 text-gray-600">
                  Start a call, identify one of the mock customers, then ask for a delivery,
                  customization, payment, or allergy change. The agent can propose changes;
                  the application validates policy and owns every commit.
                </p>
              </div>
              <button
                aria-label="Close help"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                onClick={() => setHelpOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    1. Start
                  </p>
                  <p className="mt-1 text-sm text-blue-950">Click Call and speak normally.</p>
                </div>
                <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                    2. Identify
                  </p>
                  <p className="mt-1 text-sm text-green-950">
                    Use a customer ID or phone ending from the seed data.
                  </p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    3. Confirm
                  </p>
                  <p className="mt-1 text-sm text-amber-950">
                    Watch for preview, policy result, and explicit confirmation.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Mock customer profiles</h3>
                <span className="text-xs font-medium text-gray-500">5 seeded profiles</span>
              </div>

              <div className="mt-3 grid gap-3">
                {demoProfiles.map((profile) => (
                  <article
                    className="rounded-lg border border-gray-200 bg-white p-4"
                    key={profile.customerId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">{profile.name}</h4>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                            {profile.customerId}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-gray-500">
                          {profile.phoneCue} / {profile.plan}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500">
                        Demo seed
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-5 text-gray-600">{profile.why}</p>
                    <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm italic leading-5 text-gray-700">
                      {profile.prompt}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function connectionLabel(status: LiveCallViewModel["connection"]["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "connecting") return "Connecting...";
  if (status === "ended") return "Ended";
  if (status === "error") return "Error";
  return "Disconnected";
}
