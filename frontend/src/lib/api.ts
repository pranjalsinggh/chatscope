import axios from "axios";

// Central API client, override with VITE_API_URL if the backend
// runs somewhere other than localhost:5000.
//
// When the app is opened from another device on the same network
// (e.g. a phone hitting http://<pc-ip>:5173), "localhost:5000" would
// point at the phone itself, so the backend is derived from the
// page's own hostname in that case.
function resolveApiBase(): string {
  const fromEnv = (import.meta as { env?: Record<string, string> }).env
    ?.VITE_API_URL;

  if (fromEnv) return fromEnv;

  const { protocol, hostname, port } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  // Production single-service mode: the backend serves the built
  // frontend on its own port, and tunnels/reverse proxies forward
  // 80/443 — in both cases the API shares the page's origin.
  const servedByBackend =
    port === "" || port === "5000" || port === "80" || port === "443";
  if (servedByBackend) return window.location.origin;

  // LAN dev: the page is a Vite dev server on another machine, so the
  // backend lives on :5000 of the same host.
  return `${protocol}//${hostname}:5000`;
}

const API_BASE = resolveApiBase();

// Session cookies ride along on every request (cross-origin dev setup:
// Vite :5173 → API :5000). Ignored for same-origin/no-cookie flows.
const http = axios.create({ withCredentials: true });

export type EvidenceItem = {
  date: string;
  time: string;
  sender: string;
  message: string;
};

export type Analytics = {
  overview: {
    totalMessages: number;
    totalParticipants: number;
    participants: string[];
    averageMessageLength: number;
    totalCharacters: number;
    totalWords?: number;
    totalLinks: number;
    mediaMessages: number;
    deletedMessages: number;
    dateRange?: {
      firstDate: string | null;
      lastDate: string | null;
      durationDays: number;
    };
  };
  messagesPerPerson: Record<string, number>;
  activity: {
    messagesByDate: Record<string, number>;
    messagesByHour: Record<string, number>;
    messagesByDay: Record<string, number>;
  };
  responseTime: {
    byPerson: Record<
      string,
      {
        totalResponses: number;
        averageResponseMinutes: number;
        medianResponseMinutes?: number | null;
        fastestResponseMinutes: number | null;
      }
    >;
    fastestResponse: {
      responder: string;
      responseMinutes: number;
      previousSender: string;
      previousMessage: string;
      responseMessage: string;
      date: string;
      time: string;
    } | null;
  };
  conversationStarters: {
    totalConversations: number;
    byPerson: { person: string; count: number; percentage: number }[];
    topStarter: { person: string; count: number; percentage: number } | null;
  };
  messageLength: {
    byPerson: {
      person: string;
      totalMessages: number;
      totalCharacters: number;
      averageMessageLength: number;
      longestMessageLength: number;
    }[];
    longestAverageMessageSender: {
      person: string;
      totalMessages: number;
      totalCharacters: number;
      averageMessageLength: number;
      longestMessageLength: number;
    } | null;
  };
  longestMessage: {
    date: string;
    time: string;
    sender: string;
    message: string;
  } | null;
  topEmojis: { emoji: string; count: number }[];
  topWords: { word: string; count: number }[];
  emojisPerPerson?: Record<string, number>;
  interactions?: {
    topPairs: { from: string; to: string; count: number }[];
  };
  monthlyTrends?: { month: string; count: number }[];
  wordsByPerson?: Record<string, { word: string; count: number }[]>;
};

export type AskResult = {
  question: string;
  answer: string;
  confidence?: number | null;
  evidence?: EvidenceItem[];
  source?: "analytics" | "ai";
  cached?: boolean;
};

export type PersonFact = {
  category: string;
  fact: string;
  evidence?: string;
};

export type FactsResponse = {
  status: "idle" | "running" | "ready" | "error" | "unavailable";
  facts: Record<string, PersonFact[]> | null;
  extractedAt?: string | null;
  error?: string | null;
  participants?: string[];
  chatLoaded?: boolean;
};

export type ChatPersona = {
  badge: string;
  line: string;
};

export type PersonaResponse = {
  status: "idle" | "running" | "ready" | "error" | "unavailable";
  persona: ChatPersona | null;
  extractedAt?: string | null;
  error?: string | null;
  chatLoaded?: boolean;
};

export type LibraryEntry = {
  id: string;
  filename: string;
  messageCount: number;
  uploadedAt: string | null;
  participants: string[];
  hasFacts: boolean;
  active: boolean;
  savedAt: string | null;
};

export type LibraryResponse = {
  activeId: string | null;
  chats: LibraryEntry[];
};

export type HealthReport = {
  status: string;
  uptimeSeconds: number;
  chatLoaded: boolean;
  messageCount: number;
  geminiConfigured: boolean;
  groqFallbackConfigured: boolean;
  aiEnabled?: boolean;
  factsStatus: string;
  embeddings: { available: boolean };
};

export type MessagePage = {
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  messages: EvidenceItem[];
};

// ------------------------------------------------
// SETTINGS (backend/data/settings.json via /api/settings)
// ------------------------------------------------

export type AppSettings = {
  aiEnabled: boolean;
  redactPII: boolean;
  aliasMode: boolean;
  evidenceScope: 10 | 30 | 50;
  /** Personalization (signed-in users; null = unset) */
  displayName?: string | null;
  avatarUrl?: string | null;
  accentTone?: AccentTone;
  /** Tone preset for AI answers (validated server-side) */
  askPersona?: string;
};

/** Ask-persona options, ids/labels mirror backend/askPersonas.js (prompts live server-side). */
export const ASK_PERSONA_OPTIONS = [
  { id: "default", label: "Analyst", emoji: "📊", description: "The classic ChatScope voice, precise, neutral, evidence-first." },
  { id: "roast", label: "Roast", emoji: "🔥", description: "Playfully roasts the conversation while staying factual." },
  { id: "therapist", label: "Therapist", emoji: "🧠", description: "Warm, reflective reads on how the conversation feels." },
  { id: "detective", label: "Detective", emoji: "🔍", description: "Interrogates the evidence and surfaces hidden clues." },
  { id: "hype", label: "Hype man", emoji: "🎉", description: "Turns every answer into a celebration of the chat." },
] as const;

// ------------------------------------------------
// PUBLIC WALL (opt-in, anonymized one-line stats)
// ------------------------------------------------

export type WallEntry = {
  id: string;
  statId: string;
  emoji: string;
  text: string;
  createdAt: string;
};

export type WallOption = {
  id: string;
  emoji: string;
  text: string;
};

export type AiLogEntry = {
  timestamp: string;
  chatId: string | null;
  feature: string;
  messagesSent: number;
  provider: string;
};

export type DemoResult = {
  analytics: Analytics;
  messageCount: number;
  filename: string;
  demo: boolean;
  suggestions: string[];
};

export type AccentTone = "purple" | "blue" | "pink" | "emerald";

export const chatApi = {
  async upload(
    file: File,
    onStage?: (stage: string) => void
  ): Promise<{
    analytics: Analytics;
    messageCount: number;
    filename: string;
    suggestions: string[];
  }> {
    const formData = new FormData();
    formData.append("chat", file);

    // Stage messaging while the request is in flight, the real
    // progress happens server-side, so we communicate phases.
    const stageTimer = setTimeout(() => {
      onStage?.("Reading conversation...");
    }, 400);

    const stageTimer2 = setTimeout(() => {
      onStage?.("Parsing messages...");
    }, 2500);

    const stageTimer3 = setTimeout(() => {
      onStage?.("Calculating analytics...");
    }, 6000);

    try {
      const response = await http.post(
        `${API_BASE}/api/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        }
      );

      if (!response.data?.analytics) {
        throw new Error("The backend did not return analytics.");
      }

      onStage?.("Almost ready...");

      return {
        analytics: response.data.analytics,
        messageCount: response.data.messageCount,
        filename: response.data.filename,
        suggestions: response.data.suggestions || [],
      };
    } finally {
      clearTimeout(stageTimer);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
    }
  },

  async messages(params: {
    search?: string;
    sender?: string;
    page?: number;
    pageSize?: number;
  }): Promise<MessagePage> {
    const response = await http.get(`${API_BASE}/api/messages`, { params });
    return response.data;
  },

  async sendFeedback(
    question: string,
    isPositive: boolean
  ): Promise<boolean> {
    try {
      const response = await http.post(`${API_BASE}/api/feedback`, {
        question,
        isPositive,
      });
      return response.data?.recorded === true;
    } catch {
      return false;
    }
  },

  async ask(question: string): Promise<AskResult> {
    const response = await http.post(`${API_BASE}/api/ask`, { question });
    return response.data;
  },

  /**
   * Per-person fun facts (birthdays, places, milestones...).
   * The backend extracts them with Gemini in the background;
   * poll this endpoint until `status` becomes "ready".
   */
  async facts(retry = false): Promise<FactsResponse> {
    const response = await http.get(`${API_BASE}/api/facts`, {
      params: retry ? { retry: 1 } : undefined,
      timeout: 15000,
    });
    return response.data;
  },

  /** The public wall, anonymous published stats (no auth needed). */
  async wallList(): Promise<{ entries: WallEntry[] }> {
    const response = await http.get(`${API_BASE}/api/wall`, { timeout: 15000 });
    return response.data;
  },

  /** Stats publishable from the caller's active chat. */
  async wallOptions(): Promise<{ options: WallOption[] }> {
    const response = await http.get(`${API_BASE}/api/wall/options`, { timeout: 15000 });
    return response.data;
  },

  /** Publish one stat to the public wall (sends only the stat id). */
  async wallPublish(statId: string): Promise<{ message: string; entry: WallEntry }> {
    const response = await http.post(`${API_BASE}/api/wall/publish`, { statId });
    return response.data;
  },

  /** Saved analyses, switch between previously uploaded chats. */
  async library(): Promise<LibraryResponse> {
    const response = await http.get(`${API_BASE}/api/library`, { timeout: 15000 });
    return response.data;
  },

  /** Make a saved chat the active one; returns the same shape as upload. */
  async selectChat(id: string): Promise<{
    analytics: Analytics;
    chatId: string;
    filename: string;
    messageCount: number;
    suggestions: string[];
  }> {
    const response = await http.post(
      `${API_BASE}/api/library/select`,
      { id },
      { timeout: 30000 }
    );
    return response.data;
  },

  async deleteChat(id: string): Promise<{ ok: boolean }> {
    const response = await http.delete(`${API_BASE}/api/library/${id}`, {
      timeout: 15000,
    });
    return response.data;
  },

  // ------------------------------------------------
  // SETTINGS / PRIVACY / VAULT / DEMO
  // ------------------------------------------------

  async settings(): Promise<AppSettings> {
    const response = await http.get(`${API_BASE}/api/settings`, {
      timeout: 10000,
    });
    return response.data;
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const response = await http.put(`${API_BASE}/api/settings`, patch, {
      timeout: 10000,
    });
    return response.data;
  },

  /** Delete everything under backend/data except settings.json. */
  async purge(): Promise<{ ok: boolean }> {
    const response = await http.post(`${API_BASE}/api/purge`, undefined, {
      timeout: 30000,
    });
    return response.data;
  },

  async aiLog(): Promise<{ entries: AiLogEntry[] }> {
    const response = await http.get(`${API_BASE}/api/ai-log`, {
      timeout: 10000,
    });
    return response.data;
  },



  // ------------------------------------------------
  // DEMO
  // ------------------------------------------------

  async loadDemo(): Promise<DemoResult> {
    const response = await http.post(`${API_BASE}/api/demo`, undefined, {
      timeout: 30000,
    });
    return response.data;
  },

  async health(): Promise<HealthReport> {
    const response = await http.get(`${API_BASE}/health`, { timeout: 10000 });
    return response.data;
  },



  /**
   * Streaming ask (SSE). Falls back to the non-streaming endpoint if the
   * stream fails before producing any event. Pass `signal` (AbortSignal)
   * to cancel — cancellation never triggers the fallback.
   */
  async askStream(
    question: string,
    handlers: {
      onMeta?: (meta: {
        source?: "analytics" | "ai";
        confidence?: number | null;
        evidence?: EvidenceItem[];
        cached?: boolean;
      }) => void;
      onToken?: (text: string) => void;
      onError?: (message: string) => void;
    },
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const signal = options?.signal;

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question }),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      const result = await chatApi.ask(question);
      handlers.onMeta?.({
        source: result.source,
        confidence: result.confidence ?? null,
        evidence: result.evidence || [],
        cached: result.cached,
      });
      handlers.onToken?.(result.answer);
      return;
    }

    if (!response.ok || !response.body) {
      if (signal?.aborted) return;
      const result = await chatApi.ask(question).catch(() => null);
      if (result) {
        handlers.onMeta?.({
          source: result.source,
          confidence: result.confidence ?? null,
          evidence: result.evidence || [],
          cached: result.cached,
        });
        handlers.onToken?.(result.answer);
      } else {
        handlers.onError?.(
          "Failed to get an answer. Please make sure the backend is running."
        );
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processEvent = (raw: string) => {
      const lines = raw.split("\n");
      let event = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }

      if (!data) return;

      try {
        const payload = JSON.parse(data);

        if (event === "meta") {
          handlers.onMeta?.(payload);
        } else if (event === "token") {
          handlers.onToken?.(payload.text || "");
        } else if (event === "error") {
          handlers.onError?.(payload.message || "An error occurred.");
        }
        // "done" needs no handling, the stream simply ends
      } catch {
        // Ignore malformed events
      }
    };

    while (true) {
      // Aborting the signal rejects read() mid-stream, which cancels the
      // backend request instead of draining an answer nobody will see.
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (part.trim()) processEvent(part);
      }
    }

    if (buffer.trim()) processEvent(buffer);
  },
};
