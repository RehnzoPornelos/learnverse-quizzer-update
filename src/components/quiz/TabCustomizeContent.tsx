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
  file: File | null; // file passed from previous step
  onQuizReady: (quizData: any) => void;
}

const TabCustomizeContent = ({ file, onQuizReady }: TabCustomizeContentProps) => {
  const [mcqCount, setMcqCount] = useState(5);
  const [tfCount, setTfCount] = useState(5);
  const [saCount, setSaCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  // ---- Timer (no leading zeros + clean sync to localStorage) ----
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutesStr, setTimeLimitMinutesStr] = useState<string>(''); // keep as string to control formatting

  // Randomize questions (persisted)
  const [randomizeQuestions, setRandomizeQuestions] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('randomize_questions');
      if (stored === 'false') return false;
    }
    return true;
  });

  // Persist randomization preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('randomize_questions', randomizeQuestions ? 'true' : 'false');
    }
  }, [randomizeQuestions]);

  // Persist timer state + duration (seconds) with strict rules
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const minutes = Math.max(0, parseInt(timeLimitMinutesStr || '0', 10) || 0);

    if (timeLimitEnabled && minutes > 0) {
      localStorage.setItem('quiz_timer_enabled', 'true');
      localStorage.setItem('quiz_duration_seconds', String(minutes * 60));
    } else {
      localStorage.setItem('quiz_timer_enabled', 'false');
      localStorage.removeItem('quiz_duration_seconds');
    }
  }, [timeLimitEnabled, timeLimitMinutesStr]);

  const handleGenerateQuiz = async () => {
    if (!file) {
      toast.error('No file uploaded.');
      return;
    }

    // ⛔ Guard: if timer is on, a positive number of minutes is required
    if (timeLimitEnabled) {
      const minutes = parseInt(timeLimitMinutesStr || '0', 10) || 0;
      if (minutes <= 0) {
        toast.error('Please add a duration in minutes or turn off “Add Timer”.');
        return;
      }
    }

    setIsGenerating(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mcq_count', mcqCount.toString());
    formData.append('sa_count', saCount.toString());
    formData.append('tf_count', tfCount.toString());

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/generate-quiz/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate quiz.');
      }

      const quizData = await response.json();
      toast.success('Quiz generated successfully!');
      onQuizReady(quizData);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
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
                      className="ui-input mt-1"
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
                      className="ui-input mt-1"
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
                      className="ui-input mt-1"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Quiz Features</Label>
                    <div className="space-y-3 mt-2">
                      {/* Timer */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="time-limit" className="text-sm cursor-pointer">
                            Add Timer
                          </Label>
                          <p className="text-muted-foreground text-xs">Specify a time limit for completing the quiz</p>
                        </div>
                        <Switch
                          id="time-limit"
                          checked={timeLimitEnabled}
                          onCheckedChange={(val: boolean) => {
                            setTimeLimitEnabled(val);
                            if (val && (timeLimitMinutesStr === '0' || timeLimitMinutesStr === '')) {
                              // Start with blank to avoid "0" prefix typing -> "025"
                              setTimeLimitMinutesStr('');
                            }
                          }}
                        />
                      </div>

                      {timeLimitEnabled && (
                        <div className="mt-3">
                          <Label htmlFor="time-minutes" className="text-sm">
                            Duration (minutes)
                          </Label>
                          <Input
                            id="time-minutes"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={timeLimitMinutesStr}
                            onChange={(e) => {
                              // keep digits only, strip leading zeros (except single '0')
                              const cleaned = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                              setTimeLimitMinutesStr(cleaned);
                            }}
                            onBlur={() => {
                              // normalize on blur: empty or 0 clears timer persistence
                              const cleaned = (timeLimitMinutesStr || '').replace(/^0+(?=\d)/, '');
                              setTimeLimitMinutesStr(cleaned);
                            }}
                            className="ui-input mt-1 w-36"
                            placeholder="Enter minutes"
                          />
                        </div>
                      )}

                      <Separator />

                      {/* Randomize Questions */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="randomize" className="text-sm cursor-pointer">
                            Randomize Questions
                          </Label>
                          <p className="text-muted-foreground text-xs">Present questions in random order</p>
                        </div>
                        <Switch
                          id="randomize"
                          checked={randomizeQuestions}
                          onCheckedChange={(val: boolean) => setRandomizeQuestions(val)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="pt-2">
                <Button onClick={handleGenerateQuiz} className="w-full" disabled={isGenerating}>
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
