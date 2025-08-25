
// App.tsx - Main application component
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Generator from "./pages/Generator";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import AccountSettings from "./pages/AccountSettings";
import QuizEdit from "./pages/QuizEdit";
import QuizResults from "./pages/QuizResults";
import StudentJoin from "./pages/StudentJoin";
import QuizWaiting from "./pages/QuizWaiting";
import TakeQuiz from "./pages/TakeQuiz";
import Analytics from "./pages/Analytics";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { ThemeProvider } from "./context/ThemeContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/generator" element={
                <ProtectedRoute>
                  <Generator />
                </ProtectedRoute>
              } />
              <Route path="/quiz/edit/:id" element={
                <ProtectedRoute>
                  <QuizEdit />
                </ProtectedRoute>
              } />
              <Route path="/quiz/results/:id" element={
                <ProtectedRoute>
                  <QuizResults />
                </ProtectedRoute>
              } />
              <Route path="/analytics" element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } />
              <Route path="/quiz/waiting/:id" element={<QuizWaiting />} />
              <Route path="/quiz/take/:id" element={<TakeQuiz />} />
              <Route path="/account-settings" element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              } />
              <Route path="/join" element={<StudentJoin />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AnimatePresence>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
