import { useState } from "react";
import { Settings2, EyeOff, VenetianMask, Loader2 } from "lucide-react";

import { chatApi, type AppSettings } from "../lib/api";
import GlassCard from "./ui/GlassCard";
import GlassSwitch from "./ui/GlassSwitch";
import { useToast } from "../lib/useToast";

type SettingsPanelProps = {
  settings: AppSettings | null;
  onSettingsChange: (next: AppSettings) => void;
};

function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const toast = useToast();

  const [scope, setScope] = useState<number>(30);
  const [lastSyncedScope, setLastSyncedScope] = useState<number | null>(null);
  const [scopeSaving, setScopeSaving] = useState(false);

  // React-recommended: adjust stale state DURING render (no effect)
  if (settings && settings.evidenceScope !== lastSyncedScope) {
    setLastSyncedScope(settings.evidenceScope);
    setScope(settings.evidenceScope);
  }




  const patchSetting = async (
    key: keyof AppSettings,
    value: boolean | number
  ) => {
    if (!settings) return;

    // Optimistic update, revert on failure
    const optimistic = { ...settings, [key]: value } as AppSettings;
    onSettingsChange(optimistic);

    try {
      const saved = await chatApi.updateSettings({ [key]: value } as Partial<AppSettings>);
      onSettingsChange(saved);
    } catch {
      onSettingsChange(settings);
      toast("Could not save that setting.", "error");
    }
  };

  const commitScope = async (value: number) => {
    if (!settings || scopeSaving) return;

    setScopeSaving(true);
    try {
      const saved = await chatApi.updateSettings({
        evidenceScope: value as AppSettings["evidenceScope"],
      });
      onSettingsChange(saved);
      setScope(saved.evidenceScope);
    } catch {
      // Revert the slider to the last value the server actually has
      setScope(settings.evidenceScope);
      toast("Could not save the evidence scope.", "error");
    } finally {
      setScopeSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---------------- AI PRIVACY ---------------- */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/12 text-purple-300 ring-1 ring-purple-400/20">
            <Settings2 size={18} />
          </div>

          <div>
            <h3 className="font-semibold text-white">AI privacy</h3>
            <p className="text-sm text-gray-500">
              Controls what leaves your device for AI features.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Redaction */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                <EyeOff size={13} className="text-purple-300/80" />
                Redact personal data
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Masks phones, emails, OTPs, cards and UPI IDs in AI-bound text.
              </p>
            </div>

            <GlassSwitch
              checked={settings?.redactPII ?? true}
              onChange={(next) => patchSetting("redactPII", next)}
              label="Redact personal data"
              tone="emerald"
            />
          </div>

          {/* Alias mode */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                <VenetianMask size={13} className="text-purple-300/80" />
                Alias names
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                AI sees "Person A / Person B" instead of real names. You still
                see originals.
              </p>
            </div>

            <GlassSwitch
              checked={settings?.aliasMode ?? false}
              onChange={(next) => patchSetting("aliasMode", next)}
              label="Alias names"
              tone="emerald"
            />
          </div>
        </div>

        {/* Evidence scope */}
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200">
                Evidence scope
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                How many retrieved messages are sent to the AI per question.
              </p>
            </div>

            <span className="glass-chip rounded-lg px-3 py-1.5 text-sm font-medium text-purple-200">
              {scope} messages
            </span>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-gray-600">
              <span>Private</span>
              <span>Balanced</span>
              <span>Thorough</span>
            </div>

            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={[10, 30, 50].indexOf(scope) === -1 ? 1 : [10, 30, 50].indexOf(scope)}
              onChange={(event) => {
                const value = [10, 30, 50][Number(event.target.value)];
                setScope(value);
              }}
              onMouseUp={() => commitScope(scope)}
              onTouchEnd={() => commitScope(scope)}
              onKeyUp={() => commitScope(scope)}
              disabled={scopeSaving}
              aria-label="Evidence scope"
              className="mt-2.5 w-full accent-purple-400"
            />

            <div className="flex justify-between text-[0.65rem] text-gray-600">
              <span>10</span>
              <span>30</span>
              <span>50</span>
            </div>

            {scopeSaving && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 size={11} className="animate-spin" />
                Saving...
              </p>
            )}
          </div>
        </div>
      </GlassCard>

    </div>
  );
}

export default SettingsPanel;
