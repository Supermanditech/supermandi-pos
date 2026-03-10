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
          aria-label="Open AI Assistant"
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
          <button className="aiPanelClose" onClick={() => setAiPanelOpen(false)} title="Close" aria-label="Close AI panel">
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
            <button className="aiQuickBtn" disabled={aiLoading} onClick={async () => { if (aiLoading) return; const q = "Explain the last hour of POS activity. Focus on issues and anomalies."; setAiQuestion(q); resetAiIdleTimer(); setAiLoading(true); setAiError(""); setAiAnswer(""); try { const res = await askAi(q); setAiAnswer(res.answer); } catch (e: unknown) { setAiError(e instanceof Error ? e.message : "AI request failed"); } finally { setAiLoading(false); } }}>
              📊 Explain last hour
            </button>
            <button className="aiQuickBtn" disabled={aiLoading} onClick={async () => { if (aiLoading) return; const q = "Why did payments fail? List likely causes from events and next steps."; setAiQuestion(q); resetAiIdleTimer(); setAiLoading(true); setAiError(""); setAiAnswer(""); try { const res = await askAi(q); setAiAnswer(res.answer); } catch (e: unknown) { setAiError(e instanceof Error ? e.message : "AI request failed"); } finally { setAiLoading(false); } }}>
              💳 Payment issues?
            </button>
            <button className="aiQuickBtn" disabled={aiLoading} onClick={async () => { if (aiLoading) return; const q = "Summarize today: devices active, stores active, and any printer/network problems."; setAiQuestion(q); resetAiIdleTimer(); setAiLoading(true); setAiError(""); setAiAnswer(""); try { const res = await askAi(q); setAiAnswer(res.answer); } catch (e: unknown) { setAiError(e instanceof Error ? e.message : "AI request failed"); } finally { setAiLoading(false); } }}>
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
                } catch (e: unknown) {
                  setAiError(e instanceof Error ? e.message : "AI request failed");
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
            {aiError && <span className="errorText sa-text-sm">{aiError}</span>}
          </div>

          {aiAnswer && (
            <div className="aiResponse">
              {/* STG-805: SAFETY-CRITICAL ORDER — HTML entity escaping MUST run before markdown→HTML transforms.
                  Chain: escape(&<>") → then inject safe HTML tags (h2/h3/h4/strong/li).
                  Do NOT reorder these .replace() calls. Do NOT add new .replace() before the first 4 escapes. */}
              <div className="aiResponseContent" dangerouslySetInnerHTML={{ __html: aiAnswer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px">$1</h4>').replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:15px">$1</h3>').replace(/^# (.+)$/gm, '<h2 style="margin:12px 0 6px;font-size:16px">$1</h2>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>').replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px">$1. $2</li>') }} />
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
