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
      const response = await fetch("http://localhost:8000/generate-quiz/", {
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
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="time-limit" className="text-sm cursor-pointer">
                            Time Limit
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Set a time limit for completing the quiz
                          </p>
                        </div>
                        <Switch id="time-limit" />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="randomize" className="text-sm cursor-pointer">
                            Randomize Questions
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Present questions in random order
                          </p>
                        </div>
                        <Switch id="randomize" defaultChecked />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="adaptive" className="text-sm cursor-pointer">
                            Adaptive Learning
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Adjust question difficulty based on performance
                          </p>
                        </div>
                        <Switch id="adaptive" defaultChecked />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="certificate" className="text-sm cursor-pointer">
                            Issue Certificate
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Generate completion certificate automatically
                          </p>
                        </div>
                        <Switch id="certificate" />
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