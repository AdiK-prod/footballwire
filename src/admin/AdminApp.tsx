import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";
import { SourceQueueTab } from "./SourceQueueTab";
import { ContentPreviewTab } from "./ContentPreviewTab";
import { SubscribersTab } from "./SubscribersTab";

type AdminTab = "sources" | "content" | "subscribers";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "sources", label: "Source Queue" },
  { id: "content", label: "Content Preview" },
  { id: "subscribers", label: "Subscribers" },
];

export const AdminApp = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<AdminTab>("sources");
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = getBrowserClient();

    // Handle magic link hash on arrival
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        navigate("/admin/login", { replace: true });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) {
        navigate("/admin/login", { replace: true });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // Loading state
  if (session === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fw-white">
        <p className="text-[13px] text-fw-ink-muted">Loading…</p>
      </main>
    );
  }

  // Should not render if not authenticated (redirect already fired), but guard anyway
  if (!session) return null;

  const accessToken = session.access_token;

  return (
    <div className="min-h-screen bg-fw-white">
      {/* Top nav */}
      <nav className="sticky top-0 z-10 border-b border-fw-border bg-fw-white">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[3px] text-fw-ink">
            FOOTBALLWIRE <span className="ml-1 text-fw-ink-faint font-normal normal-case tracking-normal">Admin</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-fw-border px-3 py-1.5 text-[12px] text-fw-ink-muted transition-colors hover:border-fw-border-mid hover:text-fw-ink"
          >
            Sign out
          </button>
        </div>

        {/* Tab bar */}
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="flex gap-0.5">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="px-5 py-2.5 text-[13px] font-medium transition-colors"
                  style={{
                    borderBottom: isActive ? "2px solid #111111" : "2px solid transparent",
                    color: isActive ? "#111111" : "#888888",
                    backgroundColor: isActive ? "#e8e8e8" : "transparent",
                    borderRadius: "6px 6px 0 0",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Tab content */}
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        {activeTab === "sources" && <SourceQueueTab accessToken={accessToken} />}
        {activeTab === "content" && <ContentPreviewTab accessToken={accessToken} />}
        {activeTab === "subscribers" && <SubscribersTab accessToken={accessToken} />}
      </main>
    </div>
  );
};
