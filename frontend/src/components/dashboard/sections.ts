import {
  LayoutDashboard,
  Users,
  Activity,
  Timer,
  MessagesSquare,
  AlignLeft,
  Sparkles,
  Cake,
  Smile,
  Trophy,
  Search,
  Bot,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type DashboardSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
};

/**
 * Single source of truth for dashboard navigation. Each id matches a
 * <section id="..."> rendered by Dashboard.tsx, in page order.
 */
export const DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Overview" },
  { id: "participants", label: "Participants", icon: Users, group: "Overview" },
  { id: "activity", label: "Activity", icon: Activity, group: "Overview" },

  { id: "response-time", label: "Response Time", icon: Timer, group: "Patterns" },
  { id: "starters", label: "Starters", icon: MessagesSquare, group: "Patterns" },
  { id: "message-length", label: "Message Length", icon: AlignLeft, group: "Patterns" },

  { id: "fun-insights", label: "Fun Insights", icon: Sparkles, group: "Insights" },
  { id: "facts", label: "People Facts", icon: Cake, group: "Insights" },
  { id: "words-emojis", label: "Words & Emojis", icon: Smile, group: "Insights" },
  { id: "highlights", label: "Highlights", icon: Trophy, group: "Insights" },

  { id: "explore", label: "Explore Messages", icon: Search, group: "AI Tools" },
  { id: "ask", label: "Ask Your Chat", icon: Bot, group: "AI Tools" },

  { id: "settings", label: "Settings", icon: Settings2, group: "Controls" },
];

export const DASHBOARD_GROUPS = [
  "Overview",
  "Patterns",
  "Insights",
  "AI Tools",
  "Controls",
] as const;
