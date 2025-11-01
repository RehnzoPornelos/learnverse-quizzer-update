// Analytics.tsx — wire section dropdown → StudentProgressChart

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChartIcon,
  Lightbulb,
  Users,
  RefreshCw,
  Sparkle,
} from "lucide-react";
import PerformanceOverview from "@/components/analytics/PerformanceOverview";
import StudentProgressChart from "@/components/analytics/StudentProgressChart";
import QuizDifficultyAnalysis from "@/components/analytics/QuizDifficultyAnalysis";
import PredictiveModeling from "@/components/analytics/PredictiveModeling";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Section = { id: string; code: string };

const Analytics = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");
  const hideSectionFilter =
    activeTab === "insights";

  const [hasQuizzes, setHasQuizzes] = useState(true);
  const [hasAnalyticsData, setHasAnalyticsData] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingData, setIsGeneratingData] = useState(false);

  const [professorId, setProfessorId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [sectionSelectOpen, setSectionSelectOpen] = useState(false);

  // build label for the button: list up to 3 selected codes, else show "A, B, C +N"
  const selectedSectionLabel = (() => {
    if (!selectedSectionIds || selectedSectionIds.length === 0)
      return "All Sections";
    const labels = selectedSectionIds.map(
      (id) => sections.find((s) => s.id === id)?.code ?? id
    );
    if (labels.length <= 3) return labels.join(", ");
    return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
  })();

  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
    const tab = searchParams.get("tab");
    if (tab) {
      // Legacy aliases → current tab ids
      let canonical = tab;
      if (canonical === "questions") canonical = "overview";
      if (canonical === "predictions") canonical = "recommendations";
      setActiveTab(canonical);
    }
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
          .select("id", { count: "exact", head: true }) // cheap existence check
          .in("quiz_id", quizIds);

        if (aspErr) {
          console.warn("analytics_student_performance check:", aspErr);
          setHasAnalyticsData(false);
        } else {
          setHasAnalyticsData((aspRows as any)?.length !== 0 || true);
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
            new Set(
              (qsRows ?? [])
                .map((r: any) => String(r.section_id))
                .filter(Boolean)
            )
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
              const arr = (secRows ?? []).map((s: any) => ({
                id: String(s.id),
                code: String(s.code),
              }));
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
        const msg =
          (error as any)?.code === "PGRST116" ||
          /not found|404/i.test(error.message)
            ? "Demo generator is not installed in this project."
            : error.message;
        toast({
          title: "Unable to generate demo data",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Demo data generated",
        description: "Refreshing analytics...",
        variant: "default",
      });
      await bootstrap();
      setHasAnalyticsData(true);
    } catch (err: any) {
      toast({
        title: "Error generating demo data",
        description: String(err?.message || err),
        variant: "destructive",
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
              <h1 className="text-3xl font-bold">Students</h1>
              <p className="text-muted-foreground mt-1">
                Academic performance diagnostics and question efficiency
                insights
              </p>
              {hasQuizzes && !hasAnalyticsData && !isLoading && (
                <p className="text-sm text-amber-500 mt-2">
                  Analytics data not found. Generate demo data or wait for real
                  analytics to accumulate.
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
              {!hideSectionFilter && (
                <Popover
                  open={sectionSelectOpen}
                  onOpenChange={setSectionSelectOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={sectionSelectOpen}
                      className="w-[320px] justify-between gap-2"
                    >
                      <div className="truncate text-left">
                        {selectedSectionLabel}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-[320px] p-0">
                    <Command>
                      <div className="p-2">
                        <CommandInput
                          placeholder="Search sections..."
                          className="w-full border rounded px-2 py-1"
                        />
                      </div>

                      <CommandList>
                        <CommandGroup className="max-h-64 overflow-auto">
                          <CommandItem
                            value="__select_all__"
                            onSelect={(val: string) => {
                              if (
                                selectedSectionIds.length === sections.length
                              ) {
                                setSelectedSectionIds([]);
                              } else {
                                setSelectedSectionIds(
                                  Array.isArray(sections)
                                    ? sections.map((s) => s.id)
                                    : []
                                );
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Check
                                className={cn(
                                  "h-4 w-4",
                                  selectedSectionIds.length === sections.length
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <span className="font-medium">Select All</span>
                            </div>
                          </CommandItem>

                          {Array.isArray(sections) &&
                            sections.map((section) => (
                              <CommandItem
                                key={section.id}
                                value={section.id}
                                onSelect={(val: string) => {
                                  const sid = String(val);
                                  setSelectedSectionIds((prev) =>
                                    prev.includes(sid)
                                      ? prev.filter((id) => id !== sid)
                                      : [...prev, sid]
                                  );
                                }}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      selectedSectionIds.includes(section.id)
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <span className="flex-1">{section.code}</span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

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
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid grid-cols-4 md:w-[700px]">
              <TabsTrigger value="overview">
                <BarChartIcon className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="students">
                <Users className="h-4 w-4 mr-2" />
                Students
              </TabsTrigger>
              <TabsTrigger value="recommendations">
                <Sparkle className="h-4 w-4 mr-2" />
                Recommendations
              </TabsTrigger>
              <TabsTrigger value="insights">
                <Lightbulb className="h-4 w-4 mr-2" />
                Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <PerformanceOverview
                hasAnalyticsData={hasAnalyticsData}
                professorId={professorId}
                sectionId={
                  selectedSectionIds.length === 1 ? selectedSectionIds[0] : null
                }
              />
            </TabsContent>

            <TabsContent value="students" className="space-y-6">
              <StudentProgressChart
                selectedSection={
                  selectedSectionIds.length > 0 ? selectedSectionIds : null
                }
              />
            </TabsContent>

            <TabsContent value="insights" className="space-y-6">
              {/* Insights content goes here */}
              <QuizDifficultyAnalysis />
            </TabsContent>

            <TabsContent value="recommendations" className="space-y-6">
              <PredictiveModeling
                selectedSectionIds={
                  selectedSectionIds.length > 0 ? selectedSectionIds : null
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </motion.div>
  );
};

export default Analytics;
