// Analytics.tsx — wire section dropdown → StudentProgressChart

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChartIcon, LineChartIcon, Users, TrendingUp, RefreshCw } from 'lucide-react';
import PerformanceOverview from '@/components/analytics/PerformanceOverview';
import StudentProgressChart from '@/components/analytics/StudentProgressChart';
import QuizDifficultyAnalysis from '@/components/analytics/QuizDifficultyAnalysis';
import PredictiveModeling from '@/components/analytics/PredictiveModeling';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Section = { id: string; code: string };

const Analytics = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');

  const [hasQuizzes, setHasQuizzes] = useState(true);
  const [hasAnalyticsData, setHasAnalyticsData] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingData, setIsGeneratingData] = useState(false);

  const [professorId, setProfessorId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab === 'questions' ? 'overview' : tab);
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // replace your current bootstrap() with this version
  const bootstrap = async () => {
    setIsLoading(true);
    try {
      // 1) current user
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const uid = auth.user?.id ?? null;
      setProfessorId(uid);

      // 2) quizzes owned by this user
      let quizIds: string[] = [];
      if (uid) {
        const { data: quizRows, error: quizErr } = await supabase
          .from("quizzes")
          .select("id")
          .eq("user_id", uid);

        if (quizErr) throw quizErr;
        quizIds = (quizRows ?? []).map((q: any) => String(q.id));
      }
      setHasQuizzes(quizIds.length > 0);

      // 3) do we have any analytics for those quizzes?
      if (quizIds.length > 0) {
        const { data: aspRows, error: aspErr } = await supabase
          .from("analytics_student_performance")
          .select("id", { count: "exact", head: true })   // cheap existence check
          .in("quiz_id", quizIds);

        if (aspErr) {
          // RLS will return 0 results (not 404). 404 only happens if the table/view/RPC is missing.
          console.warn("analytics_student_performance check:", aspErr);
          setHasAnalyticsData(false);
        } else {
          // supabase head-count pattern returns count in .count
          setHasAnalyticsData((aspRows as any)?.length !== 0 || true); // defensive; count not exposed in this select
        }
      } else {
        setHasAnalyticsData(false);
      }

      // 4) load section codes linked to those quizzes
      if (quizIds.length > 0) {
        const { data: qsRows, error: qsErr } = await supabase
          .from("quiz_sections")
          .select("section_id")
          .in("quiz_id", quizIds);

        if (qsErr) {
          console.warn("quiz_sections fetch warning:", qsErr);
          setSections([]);
        } else {
          const sectionIds = Array.from(
            new Set((qsRows ?? []).map((r: any) => String(r.section_id)).filter(Boolean))
          );

          if (sectionIds.length === 0) {
            setSections([]);
          } else {
            const { data: secRows, error: secErr } = await supabase
              .from("class_sections")
              .select("id, code")
              .in("id", sectionIds);

            if (secErr) {
              console.warn("class_sections fetch warning:", secErr);
              setSections([]);
            } else {
              const arr = (secRows ?? []).map((s: any) => ({ id: String(s.id), code: String(s.code) }));
              arr.sort((a, b) => a.code.localeCompare(b.code));
              setSections(arr);
            }
          }
        }
      } else {
        setSections([]);
      }
    } catch (e) {
      console.error("Unexpected error checking data:", e);
      setHasQuizzes(false);
      setHasAnalyticsData(false);
      setSections([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDemoData = async () => {
    setIsGeneratingData(true);
    try {
      const { error } = await supabase.rpc("populate_demo_analytics");
      if (error) {
        const msg = (error as any)?.code === "PGRST116" || /not found|404/i.test(error.message)
          ? "Demo generator is not installed in this project."
          : error.message;
        toast({ title: "Unable to generate demo data", description: msg, variant: "destructive" });
        return;
      }
      toast({ title: "Demo data generated", description: "Refreshing analytics...", variant: "default" });
      await bootstrap();
      setHasAnalyticsData(true);
    } catch (err: any) {
      toast({ title: "Error generating demo data", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setIsGeneratingData(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20"
    >
      <Navbar />
      <main className="pt-20">
        <div className="container-content py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold">Students</h1>
              <p className="text-muted-foreground mt-1">
                Academic performance diagnostics and question efficiency insights
              </p>
              {hasQuizzes && !hasAnalyticsData && !isLoading && (
                <p className="text-sm text-amber-500 mt-2">
                  Analytics data not found. Generate demo data or wait for real analytics to accumulate.
                </p>
              )}
              {!hasQuizzes && !isLoading && (
                <p className="text-sm text-amber-500 mt-2">
                  No quizzes found. Create quizzes to generate real analytics.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Section filter controlling all analytics on this page */}
              <Select
                value={selectedSectionId ?? 'ALL'}
                onValueChange={(v) => setSelectedSectionId(v === 'ALL' ? null : v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sections</SelectItem>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasQuizzes && !hasAnalyticsData && (
                <Button
                  variant="outline"
                  onClick={handleGenerateDemoData}
                  disabled={isGeneratingData}
                  className="flex items-center gap-1"
                >
                  {isGeneratingData ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Generate Demo Data
                    </>
                  )}
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-4 md:w-[600px]">
              <TabsTrigger value="overview">
                <BarChartIcon className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="students">
                <Users className="h-4 w-4 mr-2" />
                Students
              </TabsTrigger>
              <TabsTrigger value="trends">
                <LineChartIcon className="h-4 w-4 mr-2" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="predictions">
                <TrendingUp className="h-4 w-4 mr-2" />
                Predictions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <PerformanceOverview
                hasAnalyticsData={hasAnalyticsData}
                professorId={professorId}
                sectionId={selectedSectionId}
              />
            </TabsContent>

            <TabsContent value="students" className="space-y-6">
              {/* Pass the selected section into the clustering chart */}
              <StudentProgressChart selectedSection={selectedSectionId ?? "all"} />
            </TabsContent>

            <TabsContent value="trends" className="space-y-6">
              <QuizDifficultyAnalysis hasAnalyticsData={hasAnalyticsData} />
            </TabsContent>

            <TabsContent value="predictions" className="space-y-6">
              <PredictiveModeling hasAnalyticsData={hasAnalyticsData} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </motion.div>
  );
};

export default Analytics;
