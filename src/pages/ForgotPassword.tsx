import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Loader2, ArrowLeft } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Frontend base URL for redirects (dev: 8080, lab: 172.16.28.128:8080)
  // pick the password site first (8080), then fall back to backend or current origin
  const APP_URL =
    import.meta.env.VITE_PASSWORD_URL ||
    window.location.origin;

  // ensure no trailing slash, then add /reset-password
  const base = APP_URL.replace(/\/$/, "");

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/reset-password`,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password reset email sent! Check your inbox.");
        setEmailSent(true);
      }
    } catch (err) {
      console.error("Reset password error:", err);
      toast.error("Failed to send reset email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/10"
    >
      <Navbar />
      <main className="pt-32 pb-16">
        <div className="container-content max-w-md mx-auto">
          <div className="flex flex-col items-center mb-8">
            <BookOpen className="h-12 w-12 text-primary mb-4" />
            <h1 className="text-3xl font-bold">Forgot Password</h1>
            <p className="text-muted-foreground text-center mt-2">
              {emailSent
                ? "Check your email for reset instructions"
                : "Enter your email to receive a password reset link"}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {emailSent ? "Email Sent" : "Reset Password"}
              </CardTitle>
              <CardDescription>
                {emailSent
                  ? "We've sent you a link to reset your password. Check your email and follow the instructions."
                  : "Enter the email address associated with your account and we'll send you a link to reset your password."}
              </CardDescription>
            </CardHeader>

            {!emailSent && (
              <form onSubmit={handleResetPassword}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="professor@university.edu"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col">
                  <Button className="w-full" disabled={isLoading} type="submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </CardFooter>
              </form>
            )}

            {emailSent && (
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setEmailSent(false)}
                >
                  Send Another Email
                </Button>
              </CardFooter>
            )}

            <CardFooter className="pt-0">
              <Link
                to="/login"
                className="flex items-center text-sm text-primary hover:underline mx-auto"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to Login
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>
    </motion.div>
  );
};

export default ForgotPassword;
