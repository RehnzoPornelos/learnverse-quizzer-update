import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { QuizQuestion } from '@/services/quizService';

interface TabPreviewContentProps {
  quizTitle: string;
  onBack: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  onQuestionsUpdated: (questions: QuizQuestion[]) => void;
  initialQuestions?: QuizQuestion[];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const TabPreviewContent = ({
  quizTitle,
  onBack,
  onPublish,
  isPublishing,
  onQuestionsUpdated,
  initialQuestions = []
}: TabPreviewContentProps) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!hasInitialized && initialQuestions.length > 0) {
      const normalized = initialQuestions.map((q, index) => {
        const id = q.id || `question-${Date.now()}-${index}`;
        const type = q.type === 'essay' ? 'short_answer' : q.type;
        return {
          ...q,
          id,
          type,
          order_position: index
        };
      });

      const randomize = localStorage.getItem('randomize_questions') === 'true';
      const ordered = randomize ? shuffleArray(normalized) : normalized;

      setQuestions(ordered);
      onQuestionsUpdated(ordered);
      setHasInitialized(true);
    }
  }, [initialQuestions, hasInitialized, onQuestionsUpdated]);

  return (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">{quizTitle}</h2>
        <p className="text-muted-foreground mt-1">Raw Quiz JSON Preview</p>
      </div>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
    </div>

    <Separator />

    <div className="bg-muted/30 rounded-md p-4 max-h-[600px] overflow-auto text-sm font-mono whitespace-pre-wrap">
      <pre>{JSON.stringify(initialQuestions, null, 2)}</pre>
    </div>
  </div>
);
};

export default TabPreviewContent;