import { Phone } from "lucide-react";
import { AgentActionBanner } from "./AgentActionBanner";
import { CallControls } from "./CallControls";
import { CallMetrics } from "./CallMetrics";
import { ChangeSetPreview } from "./ChangeSetPreview";
import { ConversationTimeline } from "./ConversationTimeline";
import { CurrentAudioStatus } from "./CurrentAudioStatus";
import { CurrentSpeech } from "./CurrentSpeech";
import { CustomerSummary } from "./CustomerSummary";
import { HeaderStatus, type VoiceConsoleTab } from "./HeaderStatus";
import { PolicySummary } from "./PolicySummary";
import { ToolTimeline } from "./ToolTimeline";
import type { CallControlAction, LiveCallViewModel } from "../models/liveCallViewModel";

interface LiveCallViewProps {
  activeTab: VoiceConsoleTab;
  viewModel: LiveCallViewModel;
  onAction: (action: CallControlAction) => void;
  onTabSelect: (tab: VoiceConsoleTab) => void;
}

export function LiveCallView({
  activeTab,
  viewModel,
  onAction,
  onTabSelect
}: LiveCallViewProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white text-gray-900">
      <HeaderStatus
        activeTab={activeTab}
        connection={viewModel.connection}
        onTabSelect={onTabSelect}
      />

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden p-4 lg:p-6 gap-6">
        <div className="flex flex-col lg:w-3/5 h-full">
          <div
            aria-label="Call metrics"
            className="shrink-0 flex justify-between items-center bg-gray-50/50 p-4 rounded-xl border border-gray-100 mb-6"
          >
            <h2 className="flex shrink-0 items-center gap-2 font-medium text-gray-800 whitespace-nowrap">
              <span className="p-1.5 bg-gray-100 rounded-md">
                <Phone className="w-[18px] h-[18px] text-gray-500" />
              </span>
              Live Call
            </h2>
            <CallMetrics
              cost={viewModel.cost}
              elapsedLabel={viewModel.elapsedLabel}
              onTranscriptClick={() => onTabSelect("transcript")}
            />
          </div>

          <div className="flex flex-col gap-6 flex-1 overflow-y-auto min-h-0 pr-2">
            <CurrentAudioStatus agentAudioStatus={viewModel.agentAudioStatus} />
            <ConversationTimeline
              elapsedLabel={viewModel.elapsedLabel}
              timeline={viewModel.timeline}
            />
            <CurrentSpeech speech={viewModel.speech} />
          </div>

          <div className="shrink-0 mt-2 bg-white">
            <CallControls connection={viewModel.connection} onAction={onAction} />
          </div>
        </div>

        <aside
          aria-label="Agent action and safety"
          className="flex flex-col lg:w-2/5 p-5 bg-gray-50/50 rounded-2xl border border-gray-100 h-full"
        >
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 pr-2 pb-2">
            <AgentActionBanner actionBanner={viewModel.actionBanner} />
            <CustomerSummary customer={viewModel.customer} />
            {viewModel.changeSet ? (
              <ChangeSetPreview changeSet={viewModel.changeSet} />
            ) : null}
            <ToolTimeline tools={viewModel.tools} />
          </div>

          <div className="shrink-0 pt-4 mt-2 border-t border-gray-200/60">
            <PolicySummary policy={viewModel.policy} />
          </div>
        </aside>
      </div>
    </div>
  );
}
