import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChartIcon, BookOpen, LineChartIcon, Users, TrendingUp, RefreshCw } from 'lucide-react';
import PerformanceOverview from '@/components/analytics/PerformanceOverview';
import QuestionAnalysis from '@/components/analytics/QuestionAnalysis';
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

  // NEW: context needed for section filter + scoping queries
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const bootstrap = async () => {
    setIsLoading(true);
    try {
      // 1) Who is the current professor?
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || null;
      setProfessorId(uid);

      // 2) Check presence of quizzes and analytics data
      const { data: quizzes, error: quizError } = await supabase
        .from('quizzes')
        .select('id')
        .eq('user_id', uid)
        .limit(1);

      if (quizError) {
        console.error("Error checking quizzes:", quizError);
        toast({
          title: "Error connecting to database",
          description: "We couldn't connect to the database. Using demo data instead.",
          variant: "destructive"
        });
        setHasQuizzes(false);
        setHasAnalyticsData(false);
        return;
      }
      setHasQuizzes((quizzes?.length || 0) > 0);

      const { data: analyticsData, error: analyticsError } = await supabase
        .from('analytics_quiz_performance')
        .select('id')
        .limit(1);

      if (analyticsError) {
        console.error("Error checking analytics data:", analyticsError);
        setHasAnalyticsData(false);
      } else {
        setHasAnalyticsData((analyticsData?.length || 0) > 0);
      }

      // 3) Load class sections that have at least one quiz from this professor
      if (uid) {
        const { data: secRows, error: secErr } = await supabase
          .from('class_sections')
          .select('id, code')
          .in(
            'id',
            (
              await supabase
                .from('quiz_sections')
                .select('section_id')
                .in(
                  'quiz_id',
                  (
                    await supabase
                      .from('quizzes')
                      .select('id')
                      .eq('user_id', uid)
                  ).data?.map(q => q.id) || []
                )
            ).data?.map(r => r.section_id) || []
          );

        if (secErr) {
          console.warn('Section load warning:', secErr);
          setSections([]);
        } else {
          // ensure unique, sorted codes
          const uniq = new Map<string, Section>();
          (secRows || []).forEach(s => uniq.set(s.id, s as Section));
          const arr = Array.from(uniq.values()).sort((a, b) => a.code.localeCompare(b.code));
          setSections(arr);
        }
      }

      // 4) Toasts
      if (!quizzes || quizzes.length === 0) {
        toast({
          title: "No quizzes found",
          description: "Create some quizzes first to see real analytics data.",
          variant: "default"
        });
      } else if (!hasAnalyticsData) {
        toast({
          title: "No analytics data found",
          description: "Analytics tables are set up, but no data is present. Click 'Generate Demo Data' to populate with sample data.",
          variant: "default"
        });
      }
    } catch (e) {
      console.error("Unexpected error checking data:", e);
      setHasQuizzes(false);
      setHasAnalyticsData(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDemoData = async () => {
    setIsGeneratingData(true);
    try {
      const { error } = await supabase.rpc('populate_demo_analytics');
      if (error) {
        console.error("Error generating demo data:", error);
        toast({
          title: "Error generating demo data",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Demo data generated",
          description: "Analytics populated with sample data. Refreshing...",
          variant: "default"
        });
        await bootstrap();
        setHasAnalyticsData(true);
      }
    } catch (error) {
      console.error("Unexpected error generating demo data:", error);
      toast({
        title: "Error generating demo data",
        description: "An unexpected error occurred.",
        variant: "destructive"
      });
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
              <h1 className="text-3xl font-bold">Analytics</h1>
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
              {/* NEW: Section filter (optional) */}
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
            <TabsList className="grid grid-cols-5 md:w-[750px]">
              <TabsTrigger value="overview">
                <BarChartIcon className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="questions">
                <BookOpen className="h-4 w-4 mr-2" />
                Questions
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

            <TabsContent value="questions" className="space-y-6">
              <QuestionAnalysis hasAnalyticsData={hasAnalyticsData} />
            </TabsContent>

            <TabsContent value="students" className="space-y-6">
              <StudentProgressChart />
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