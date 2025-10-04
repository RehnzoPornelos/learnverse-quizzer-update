import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
// No Navbar here on purpose (trap user in recovery flow)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [allowPage, setAllowPage] = useState(false); // allow only if recovery is detected
  const [ready, setReady] = useState(false);

  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const valid = newPassword.length >= 8 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const confirmFilled = confirm.length > 0; // <-- NEW

  // 1) Try to detect the recovery via URL hash (before Supabase clears it)
  const { hasAccessToken, isRecoveryType } = useMemo(() => {
    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    const params = new URLSearchParams(raw);
    return {
      hasAccessToken: !!params.get("access_token"),
      isRecoveryType: (params.get("type") || "").toLowerCase() === "recovery",
    };
  }, [location.hash]);

  // 2) Also listen for Supabase's PASSWORD_RECOVERY event (fires when the link is valid)
  const sawRecoveryEvent = useRef(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sawRecoveryEvent.current = true;
        setAllowPage(true);
        setReady(true);
      }
    });

    if (hasAccessToken && isRecoveryType) {
      setAllowPage(true);
      setReady(true);
    }

    const guardTimer = setTimeout(async () => {
      if (!sawRecoveryEvent.current && !(hasAccessToken && isRecoveryType)) {
        toast.error("Password reset link is missing or invalid.");
        navigate("/login", { replace: true });
      } else {
        setReady(true);
      }
    }, 400);

    return () => {
      clearTimeout(guardTimer);
      subscription.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccessToken, isRecoveryType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Block if confirm not filled
    if (!confirmFilled) {
      toast.error("Please confirm your new password.");
      return;
    }
    if (!valid) {
      toast.error("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (mismatch) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (!allowPage) {
      toast.error("Password reset link is missing or invalid.");
      return;
    }

    try {
      setSubmitting(true);

      // Update password using the recovery session
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message || "Failed to update password.");
        return;
      }

      // Clean exit: end recovery session and send them to Login
      await supabase.auth.signOut();

      toast.success("Password updated! Please sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }} className="min-h-screen bg-muted/10"
    >
      {/* Navbar intentionally hidden */}
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Set a New Password</CardTitle>
            </CardHeader>
            <CardContent>
              {!ready ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
                </div>
              ) : allowPage ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 chars, include a number"
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showNew ? "Hide password" : "Show password"}
                      >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters and include a letter and a number.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm"
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Re-enter new password"
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mismatch && (
                      <p className="text-sm text-red-600 mt-1">New password and confirmation don’t match.</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    // Now also requires confirm to be filled:
                    disabled={submitting || !valid || mismatch || !confirmFilled}
                  >
                    {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</>) : "Update Password"}
                  </Button>
                </form>
              ) : (
                <div className="text-sm text-muted-foreground">Redirecting…</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </motion.div>
  );
};

export default ResetPassword;
