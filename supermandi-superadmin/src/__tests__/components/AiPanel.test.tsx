// SuperAdmin — Test AiPanel component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiPanel } from '../../components/AiPanel';

vi.mock('../../api/ai', () => ({
  askAi: vi.fn(),
}));

function createProps(overrides: Partial<Parameters<typeof AiPanel>[0]> = {}) {
  return {
    aiQuestion: '',
    aiAnswer: '',
    aiError: '',
    aiLoading: false,
    aiConfigured: true,
    aiPanelOpen: true,
    aiIdleSeconds: 0,
    AI_AUTO_COLLAPSE_SECONDS: 120,
    setAiQuestion: vi.fn(),
    setAiAnswer: vi.fn(),
    setAiError: vi.fn(),
    setAiLoading: vi.fn(),
    setAiPanelOpen: vi.fn(),
    resetAiIdleTimer: vi.fn(),
    ...overrides,
  };
}

describe('AiPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders panel title when open', () => {
    render(<AiPanel {...createProps()} />);
    expect(screen.getByText('AI Copilot')).toBeTruthy();
  });

  it('shows toggle button when panel is closed', () => {
    render(<AiPanel {...createProps({ aiPanelOpen: false })} />);
    expect(screen.getByLabelText('Open AI Assistant')).toBeTruthy();
  });

  it('opens panel on toggle click', () => {
    const setOpen = vi.fn();
    render(<AiPanel {...createProps({ aiPanelOpen: false, setAiPanelOpen: setOpen })} />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it('closes panel on close button click', () => {
    const setOpen = vi.fn();
    render(<AiPanel {...createProps({ setAiPanelOpen: setOpen })} />);
    fireEvent.click(screen.getByLabelText('Close AI panel'));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('shows AI configured badge', () => {
    render(<AiPanel {...createProps({ aiConfigured: true })} />);
    expect(screen.getByText('AI configured')).toBeTruthy();
  });

  it('shows AI not configured badge', () => {
    render(<AiPanel {...createProps({ aiConfigured: false })} />);
    expect(screen.getByText('AI not configured')).toBeTruthy();
  });

  it('renders quick action buttons', () => {
    render(<AiPanel {...createProps()} />);
    expect(screen.getByText(/Explain last hour/)).toBeTruthy();
    expect(screen.getByText(/Payment issues/)).toBeTruthy();
    expect(screen.getByText(/Summarize today/)).toBeTruthy();
  });

  it('sets question on quick action click', () => {
    const setQ = vi.fn();
    render(<AiPanel {...createProps({ setAiQuestion: setQ })} />);
    fireEvent.click(screen.getByText(/Explain last hour/));
    expect(setQ).toHaveBeenCalledWith(expect.stringContaining('Explain the last hour'));
  });

  it('renders textarea for question input', () => {
    render(<AiPanel {...createProps()} />);
    expect(screen.getByPlaceholderText('Ask about POS activity, devices, payments...')).toBeTruthy();
  });

  it('shows Ask AI button', () => {
    render(<AiPanel {...createProps({ aiQuestion: 'test' })} />);
    expect(screen.getByText('Ask AI')).toBeTruthy();
  });

  it('disables Ask AI when question is empty', () => {
    render(<AiPanel {...createProps({ aiQuestion: '' })} />);
    const btn = screen.getByText('Ask AI');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows Thinking... when loading', () => {
    render(<AiPanel {...createProps({ aiLoading: true })} />);
    expect(screen.getByText('Thinking...')).toBeTruthy();
  });

  it('shows Clear button', () => {
    render(<AiPanel {...createProps()} />);
    expect(screen.getByText('Clear')).toBeTruthy();
  });

  it('clears state on Clear click', () => {
    const setQ = vi.fn();
    const setA = vi.fn();
    const setE = vi.fn();
    render(<AiPanel {...createProps({ setAiQuestion: setQ, setAiAnswer: setA, setAiError: setE })} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(setQ).toHaveBeenCalledWith('');
    expect(setA).toHaveBeenCalledWith('');
    expect(setE).toHaveBeenCalledWith('');
  });

  it('shows error text', () => {
    render(<AiPanel {...createProps({ aiError: 'AI request failed' })} />);
    expect(screen.getByText('AI request failed')).toBeTruthy();
  });

  it('shows answer when present', () => {
    render(<AiPanel {...createProps({ aiAnswer: 'Here is the analysis...' })} />);
    expect(screen.getByText('Here is the analysis...')).toBeTruthy();
  });

  it('shows auto-close countdown when open', () => {
    render(<AiPanel {...createProps({ aiIdleSeconds: 10, AI_AUTO_COLLAPSE_SECONDS: 120 })} />);
    expect(screen.getByText(/Auto-closes in 110s/)).toBeTruthy();
  });

  it('calls askAi on Ask AI click', async () => {
    const { askAi } = await import('../../api/ai') as any;
    askAi.mockResolvedValue({ answer: 'AI says hello' });
    const setLoading = vi.fn();
    const setAnswer = vi.fn();

    render(<AiPanel {...createProps({ aiQuestion: 'test question', setAiLoading: setLoading, setAiAnswer: setAnswer })} />);
    fireEvent.click(screen.getByText('Ask AI'));

    await waitFor(() => {
      expect(askAi).toHaveBeenCalledWith('test question');
      expect(setAnswer).toHaveBeenCalledWith('AI says hello');
    });
  });

  it('handles askAi error', async () => {
    const { askAi } = await import('../../api/ai') as any;
    askAi.mockRejectedValue(new Error('Network error'));
    const setError = vi.fn();

    render(<AiPanel {...createProps({ aiQuestion: 'test', setAiError: setError })} />);
    fireEvent.click(screen.getByText('Ask AI'));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Network error');
    });
  });
});
