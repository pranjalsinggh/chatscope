import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { DASHBOARD_SECTIONS, DASHBOARD_GROUPS } from "./sections";

const COLLAPSE_STORAGE_KEY = "chatscope.sidebar.collapsed";

function NavList({
  activeId,
  onNavigate,
  hiddenIds,
}: {
  activeId: string;
  onNavigate: (id: string) => void;
  hiddenIds?: string[];
}) {
  const visibleSections = DASHBOARD_SECTIONS.filter(
    (section) => !hiddenIds?.includes(section.id)
  );

  return (
    <nav aria-label="Dashboard sections" className="flex flex-col gap-5">
      {DASHBOARD_GROUPS.map((group) => {
        const groupSections = visibleSections.filter((s) => s.group === group);
        if (groupSections.length === 0) return null;

        return (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-gray-600">
              {group}
            </p>

            <ul className="space-y-0.5">
              {groupSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeId === section.id;

                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(section.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.82rem] transition-colors duration-200 ${
                        isActive
                          ? "text-white"
                          : "text-gray-500 hover:bg-white/[0.05] hover:text-gray-200"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          className="absolute inset-0 rounded-xl border border-purple-400/25 bg-gradient-to-r from-purple-500/[0.16] to-blue-500/[0.08]"
                        />
                      )}

                      <Icon
                        size={15.5}
                        className={`relative shrink-0 transition-colors ${
                          isActive
                            ? "text-purple-300"
                            : "text-gray-600 group-hover:text-gray-300"
                        }`}
                      />

                      <span className="relative truncate">{section.label}</span>

                      {isActive && (
                        <span className="relative ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-purple-300 shadow-[0_0_8px_2px_rgba(192,132,252,0.6)]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function DashboardSidebar({ hiddenIds }: { hiddenIds?: string[] }) {
  const [activeId, setActiveId] = useState("overview");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Memoized on the hidden-id list so the IntersectionObserver below is
  // not torn down and rebuilt on every parent re-render during scroll.
  const visibleSections = useMemo(
    () =>
      DASHBOARD_SECTIONS.filter(
        (section) => !hiddenIds?.includes(section.id)
      ),
    [hiddenIds?.join(",")]
  );

  // Track which section is in view → highlight in the sidebar
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );

    for (const section of visibleSections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [visibleSections]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // Private mode, collapse state just won't persist
    }
  }, [collapsed]);

  // Esc closes the mobile drawer
  useEffect(() => {
    if (!drawerOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  const navigate = (id: string) => {
    setActiveId(id);
    setDrawerOpen(false);

    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* ---------------------------------------------- DESKTOP RAIL
           z-[5]: below the content column (z-10) so header dropdowns
           (Library/Share) open OVER the rail, nothing else overlaps
           the rail's area, since content is padded past it. */}
      <motion.aside
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.21, 0.6, 0.35, 1] }}
        className="fixed bottom-5 left-4 top-24 z-[5] hidden w-[236px] lg:block xl:left-6 print:hidden"
      >
        <div
          className={`glass-panel glass-panel--solid flex h-full flex-col rounded-2xl p-3 transition-[width] duration-300 ${
            collapsed ? "w-[64px]" : "w-full"
          }`}
        >
          {/* Brand row */}
          <div
            className={`flex items-center gap-2.5 px-1.5 pb-3 pt-1 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 via-fuchsia-500 to-blue-500 text-white">
              <MessageCircle size={15} />
            </span>

            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight text-white">
                ChatScope
              </span>
            )}
          </div>

          {/* Nav */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {collapsed ? (
              <nav
                aria-label="Dashboard sections"
                className="flex flex-col items-center gap-1"
              >
                {visibleSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeId === section.id;

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => navigate(section.id)}
                      title={section.label}
                      aria-label={section.label}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? "border border-purple-400/25 bg-gradient-to-br from-purple-500/25 to-blue-500/10 text-purple-200"
                          : "text-gray-600 hover:bg-white/[0.05] hover:text-gray-300"
                      }`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </nav>
            ) : (
              <NavList activeId={activeId} onNavigate={navigate} hiddenIds={hiddenIds} />
            )}
          </div>

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`mt-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-white/[0.07] hover:text-gray-300 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen size={14} />
            ) : (
              <>
                <PanelLeftClose size={14} />
                Collapse
              </>
            )}
          </button>
        </div>
      </motion.aside>

      {/* ---------------------------------------------- MOBILE TRIGGER */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open dashboard navigation"
        className="glass-panel fixed bottom-5 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl text-gray-200 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.9)] lg:hidden"
      >
        <PanelLeftOpen size={19} />
      </button>

      {/* ---------------------------------------------- MOBILE DRAWER */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />

            <motion.div
              key="drawer"
              role="dialog"
              aria-label="Dashboard navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="glass-panel fixed bottom-0 left-0 top-0 z-[70] flex w-[264px] flex-col rounded-none rounded-r-3xl p-4 lg:hidden"
            >
              <div className="flex items-center justify-between px-1 pb-4 pt-1">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 via-fuchsia-500 to-blue-500 text-white">
                    <MessageCircle size={15} />
                  </span>

                  <span className="text-sm font-semibold text-white">
                    ChatScope
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList
                  activeId={activeId}
                  onNavigate={(id) => navigate(id)}
                  hiddenIds={hiddenIds}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default DashboardSidebar;
