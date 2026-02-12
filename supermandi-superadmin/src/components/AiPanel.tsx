// SA-001: AI floating panel extracted from App.tsx
import { askAi } from "../api/ai";

interface AiPanelProps {
  aiQuestion: string;
  aiAnswer: string;
  aiError: string;
  aiLoading: boolean;
  aiConfigured: boolean | null;
  aiPanelOpen: boolean;
  aiIdleSeconds: number;
  AI_AUTO_COLLAPSE_SECONDS: number;
  setAiQuestion: (v: string) => void;
  setAiAnswer: (v: string) => void;
  setAiError: (v: string) => void;
  setAiLoading: (v: boolean) => void;
  setAiPanelOpen: (v: boolean) => void;
  resetAiIdleTimer: () => void;
}

export function AiPanel({
  aiQuestion, aiAnswer, aiError, aiLoading, aiConfigured,
  aiPanelOpen, aiIdleSeconds, AI_AUTO_COLLAPSE_SECONDS,
  setAiQuestion, setAiAnswer, setAiError, setAiLoading,
  setAiPanelOpen, resetAiIdleTimer,
}: AiPanelProps) {
  return (
    <>
      {!aiPanelOpen && (
        <button
          className={`aiPanelToggle ${aiAnswer ? "hasAnswer" : ""}`}
          onClick={() => setAiPanelOpen(true)}
          title="Open AI Assistant"
        >
          🤖
        </button>
      )}

      <div className={`aiPanel ${aiPanelOpen ? "open" : ""}`}>
        <div className="aiPanelHeader">
          <div className="aiPanelTitle">
            <span className="brandPill">SuperMandi</span>
            AI Copilot
          </div>
          <button className="aiPanelClose" onClick={() => setAiPanelOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="aiPanelBody" onClick={resetAiIdleTimer}>
          <div className="badgeRow">
            <span className={`badge ${aiConfigured ? "badgeOk" : "badgeWarn"}`}>
              {aiConfigured ? "AI configured" : "AI not configured"}
            </span>
          </div>

          <div className="aiQuickActions">
            <button className="aiQuickBtn" onClick={() => { setAiQuestion("Explain the last hour of POS activity. Focus on issues and anomalies."); resetAiIdleTimer(); }}>
              📊 Explain last hour
            </button>
            <button className="aiQuickBtn" onClick={() => { setAiQuestion("Why did payments fail? List likely causes from events and next steps."); resetAiIdleTimer(); }}>
              💳 Payment issues?
            </button>
            <button className="aiQuickBtn" onClick={() => { setAiQuestion("Summarize today: devices active, stores active, and any printer/network problems."); resetAiIdleTimer(); }}>
              📋 Summarize today
            </button>
          </div>

          <textarea
            className="aiTextarea"
            value={aiQuestion}
            onChange={(e) => { setAiQuestion(e.target.value); resetAiIdleTimer(); }}
            placeholder="Ask about POS activity, devices, payments..."
            rows={3}
          />

          <div className="aiActions">
            <button
              className="aiAskBtn"
              onClick={async () => {
                resetAiIdleTimer();
                setAiLoading(true);
                setAiError("");
                setAiAnswer("");
                try {
                  const res = await askAi(aiQuestion);
                  setAiAnswer(res.answer);
                } catch (e: any) {
                  setAiError(e?.message ? String(e.message) : "AI request failed");
                } finally {
                  setAiLoading(false);
                }
              }}
              disabled={aiLoading || !aiQuestion.trim()}
            >
              {aiLoading ? "Thinking..." : "Ask AI"}
            </button>
            <button
              className="aiClearBtn"
              onClick={() => { setAiQuestion(""); setAiAnswer(""); setAiError(""); resetAiIdleTimer(); }}
            >
              Clear
            </button>
            {aiError && <span className="errorText" style={{ fontSize: 12 }}>{aiError}</span>}
          </div>

          {aiAnswer && (
            <div className="aiResponse">
              <div className="aiResponseContent">{aiAnswer}</div>
            </div>
          )}
        </div>

        {aiPanelOpen && (
          <div className="aiIdleTimer">
            Auto-closes in {AI_AUTO_COLLAPSE_SECONDS - aiIdleSeconds}s of inactivity
          </div>
        )}
      </div>
    </>
  );
}
