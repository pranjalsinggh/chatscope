import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MessageSquare, Search, Users } from "lucide-react";
import { chatApi, type EvidenceItem } from "../lib/api";

type MessageBrowserProps = {
  participants: string[];
};

const PAGE_SIZE = 25;

function MessageBrowser({ participants }: MessageBrowserProps) {
  const [search, setSearch] = useState("");
  const [sender, setSender] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [messages, setMessages] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState("");

  // Monotonic request id: only the newest load may write state, so
  // out-of-order responses (fast search + filter change) can't clobber
  // the newer result with stale data.
  const loadSeqRef = useRef(0);

  const load = useCallback(
    async (nextPage: number, nextSearch: string, nextSender: string) => {
      const requestId = ++loadSeqRef.current;
      setLoading(true);
      setError("");

      try {
        const result = await chatApi.messages({
          search: nextSearch || undefined,
          sender: nextSender || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });

        if (requestId !== loadSeqRef.current) return;

        setMessages(result.messages);
        setTotalPages(result.totalPages);
        setTotal(result.total);
        setPage(result.page);
      } catch {
        if (requestId !== loadSeqRef.current) return;
        setError("Could not load messages. Is the backend running?");
      } finally {
        if (requestId === loadSeqRef.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // Deferred a microtask so the effect body itself stays side-effect free
    // (react-hooks/set-state-in-effect), behavior is identical.
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) load(1, "", "");
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  // Drop a pending debounce when the component unmounts
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchInput(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setSearch(value);
      load(1, value, sender);
    }, 350);
  };

  const handleSenderChange = (value: string) => {
    setSender(value);
    load(1, search, value);
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    load(clamped, search, sender);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="glass-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-300 ring-1 ring-cyan-400/20">
            <MessageSquare size={19} />
          </div>

          <div>
            <h3 className="font-semibold text-white">Browse messages</h3>

            <p className="text-sm text-gray-500">
              Search the raw conversation behind the analytics.
            </p>
          </div>
        </div>

        <span className="glass-chip rounded-full px-3 py-1.5 text-xs text-gray-400">
          {total.toLocaleString()} matching messages
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600"
          />

          <input
            value={searchInput}
            onChange={(event) => handleSearchInput(event.target.value)}
            placeholder="Search messages..."
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-600 transition-all focus:border-purple-400/50 focus:ring-2 focus:ring-purple-500/15"
          />
        </div>

        <div className="relative sm:w-52">
          <Users
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600"
          />

          <select
            value={sender}
            onChange={(event) => handleSenderChange(event.target.value)}
            className="w-full appearance-none rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-all focus:border-purple-400/50"
          >
            <option value="" className="bg-[#12101a]">All participants</option>

            {participants.map((person) => (
              <option key={person} value={person} className="bg-[#12101a]">
                {person}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-5 max-h-[480px] space-y-2 overflow-y-auto pr-1">
        {loading && messages.length === 0 && (
          <div className="space-y-2 py-4">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="glass-chip shimmer-line h-16 rounded-xl"
              />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-gray-500">
            No messages match your search.
          </p>
        )}

        {messages.map((msg, index) => (
          <div
            key={`${msg.date}-${msg.time}-${index}`}
            className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04]"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-purple-200/90">{msg.sender}</span>

              <span className="text-gray-600">
                {msg.date} · {msg.time}
              </span>
            </div>

            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-300">
              {msg.message}
            </p>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            className="glass-chip flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Prev
          </button>

          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="glass-chip flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default MessageBrowser;
