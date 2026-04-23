import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBrowserClient } from "@/lib/supabase/browser";

export const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // If already authenticated, redirect to admin
  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/admin", { replace: true });
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getBrowserClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch {
      setError("Failed to send magic link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-fw-white px-4">
      <div className="w-full max-w-[380px]">
        <p className="mb-8 text-center text-[13px] font-bold uppercase tracking-[3px] text-fw-ink-faint">
          FOOTBALLWIRE
        </p>

        {sent ? (
          <div className="rounded-xl border border-fw-border bg-fw-card p-8 text-center">
            <p className="mb-2 text-[20px] font-bold text-fw-ink">Check your inbox</p>
            <p className="text-[14px] text-fw-ink-mid">
              A magic link was sent to <strong>{email}</strong>. Click it to sign in.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-fw-border bg-fw-card p-8">
            <h1 className="mb-1 text-[22px] font-bold text-fw-ink">Admin sign in</h1>
            <p className="mb-6 text-[13px] text-fw-ink-muted">
              Enter your email to receive a magic link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-fw-border bg-fw-input-bg px-4 py-3 text-[14px] text-fw-ink placeholder:text-fw-ink-faint focus:border-fw-border-mid focus:outline-none"
              />
              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-[13px] text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#111111] px-4 py-3 text-[13px] font-semibold text-white transition-opacity disabled:opacity-60 hover:opacity-90"
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
};
