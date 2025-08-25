import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface TabCustomizeContentProps {
  file: File | null; // <== NEW: file passed from previous step
  onQuizReady: (quizData: any) => void;
}

const TabCustomizeContent = ({
  file,
  onQuizReady,
}: TabCustomizeContentProps) => {
  const [mcqCount, setMcqCount] = useState(5);
  const [tfCount, setTfCount] = useState(5);
  const [saCount, setSaCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  // Additional quiz feature settings
  // Time limit toggle; persists in localStorage under `quiz_time_limit_enabled`.
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('quiz_time_limit_enabled') === 'true';
    }
    return false;
  });
  // Time limit duration in minutes; persists under `quiz_time_limit_minutes`.
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('quiz_time_limit_minutes');
      if (stored) {
        const parsed = parseInt(stored, 10);
        return isNaN(parsed) ? 10 : parsed;
      }
    }
    return 10;
  });
  const [randomizeQuestions, setRandomizeQuestions] = useState(() => {
    // default to true; read previous value from localStorage if present
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('randomize_questions');
      if (stored === 'false') return false;
    }
    return true;
  });
  // Adaptive learning removed per requirements.
  const [issueCertificate, setIssueCertificate] = useState(false);

  // Persist randomization preference in localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('randomize_questions', randomizeQuestions ? 'true' : 'false');
    }
  }, [randomizeQuestions]);

  // Persist time limit enabled flag
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quiz_time_limit_enabled', timeLimitEnabled ? 'true' : 'false');
    }
  }, [timeLimitEnabled]);

  // Persist time limit minutes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Save the minutes only if the timer is enabled; otherwise remove
      if (timeLimitEnabled) {
        localStorage.setItem('quiz_time_limit_minutes', timeLimitMinutes.toString());
      } else {
        localStorage.removeItem('quiz_time_limit_minutes');
      }
    }
  }, [timeLimitMinutes, timeLimitEnabled]);

  const handleGenerateQuiz = async () => {
    if (!file) {
      toast.error("No file uploaded.");
      return;
    }

    setIsGenerating(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mcq_count", mcqCount.toString());
    formData.append("sa_count", saCount.toString());
    formData.append("tf_count", tfCount.toString());

    try {
      // Use environment variable for backend URL when available
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const response = await fetch(`${backendUrl}/generate-quiz/`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate quiz.");
      }

      const quizData = await response.json();
      toast.success("Quiz generated successfully!");
      onQuizReady(quizData); // send quiz to parent
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Customize Quiz Settings</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Set the number of questions by type. We'll generate the quiz based on your preferences.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="mcq">Multiple Choice</Label>
                    <Input
                      id="mcq"
                      type="number"
                      value={mcqCount}
                      onChange={(e) => setMcqCount(parseInt(e.target.value))}
                      min={0}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="tf">True/False</Label>
                    <Input
                      id="tf"
                      type="number"
                      value={tfCount}
                      onChange={(e) => setTfCount(parseInt(e.target.value))}
                      min={0}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sa">Short Answer</Label>
                    <Input
                      id="sa"
                      type="number"
                      value={saCount}
                      onChange={(e) => setSaCount(parseInt(e.target.value))}
                      min={0}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Quiz Features</Label>
                    <div className="space-y-3 mt-2">
                      {/* Timer toggle */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="time-limit" className="text-sm cursor-pointer">
                            Add Timer
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Set a time limit for completing the quiz
                          </p>
                        </div>
                        <Switch
                          id="time-limit"
                          checked={timeLimitEnabled}
                          onCheckedChange={(val: boolean) => setTimeLimitEnabled(val)}
                        />
                      </div>
                      {/* Duration field shown only when timer is enabled */}
                      {timeLimitEnabled && (
                        <div className="flex items-center justify-between mt-3">
                          <Label htmlFor="time-limit-minutes" className="text-sm cursor-pointer">
                            Duration (minutes)
                          </Label>
                          <Input
                            id="time-limit-minutes"
                            type="number"
                            value={timeLimitMinutes}
                            min={1}
                            onChange={(e) => setTimeLimitMinutes(Math.max(1, parseInt(e.target.value)))}
                            className="w-24"
                          />
                        </div>
                      )}
                      <Separator />
                      {/* Randomize questions */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="randomize" className="text-sm cursor-pointer">
                            Randomize Questions
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Present questions in random order
                          </p>
                        </div>
                        <Switch
                          id="randomize"
                          checked={randomizeQuestions}
                          onCheckedChange={(val: boolean) => setRandomizeQuestions(val)}
                        />
                      </div>
                      <Separator />
                      {/* Issue certificate */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="certificate" className="text-sm cursor-pointer">
                            Issue Certificate
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Generate completion certificate automatically
                          </p>
                        </div>
                        <Switch
                          id="certificate"
                          checked={issueCertificate}
                          onCheckedChange={(val: boolean) => setIssueCertificate(val)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="pt-2">
                <Button 
                  onClick={handleGenerateQuiz} 
                  className="w-full"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Quiz...
                    </>
                  ) : (
                    'Generate Quiz'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default TabCustomizeContent;
