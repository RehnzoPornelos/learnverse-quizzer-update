import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft } from 'lucide-react';
import { QuizQuestion } from '@/services/quizService';

interface TabPreviewContentProps {
  quizTitle: string;
  onBack: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  onQuestionsUpdated: (questions: QuizQuestion[]) => void;
  initialQuestions?: QuizQuestion[];
  /**
   * Initial duration of the quiz in seconds. If provided, the timer will be
   * enabled and set to this value on mount. If undefined, the component will
   * read duration settings from localStorage (used during quiz creation).
   */
  initialDurationSeconds?: number;
  /**
   * Callback to notify parent when the duration (in seconds) changes. When
   * timer is disabled, this will be invoked with 0.
   */
  onDurationUpdated?: (durationSeconds: number) => void;
  /**
   * If true, hides the internal header actions (Back & Publish buttons) to
   * allow parent components like QuizEdit to provide their own actions.
   */
  hideHeaderActions?: boolean;
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
  initialQuestions = [],
  initialDurationSeconds,
  onDurationUpdated,
  hideHeaderActions = false,
}: TabPreviewContentProps) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Timer state: whether the timer is enabled and its duration in minutes.
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(10);

  const updateQuestions = (updated: QuizQuestion[]) => {
    setQuestions(updated);
    onQuestionsUpdated(updated);
  };

  const handleQuestionFieldChange = (index: number, field: string, value: any) => {
    const updated = questions.map((q, i) => {
      if (i !== index) return q;
      const updatedQuestion: any = { ...q };
      updatedQuestion[field] = value;
      return updatedQuestion;
    });
    updateQuestions(updated);
  };

  const handleChoiceChange = (questionIndex: number, choiceIndex: number, value: string) => {
    const updated = questions.map((q, i) => {
      if (i !== questionIndex) return q;
      const choices = Array.isArray((q as any).choices)
        ? ([...(q as any).choices] as string[])
        : ['', '', '', ''];
      choices[choiceIndex] = value;
      return { ...q, choices } as any;
    });
    updateQuestions(updated);
  };

  const handleTypeChange = (index: number, newType: string) => {
    const updated = questions.map((q, i) => {
      if (i !== index) return q;
      const base = { ...q, type: newType } as any;
      if (newType === 'mcq') {
        base.choices = base.choices && Array.isArray(base.choices)
          ? base.choices
          : ['', '', '', ''];
        base.answer = base.answer || '';
      } else if (newType === 'true_false') {
        base.answer = base.answer === 'False' ? 'False' : 'True';
        delete base.choices;
      } else if (newType === 'short_answer') {
        base.answer = '';
        delete base.choices;
      }
      return base;
    });
    updateQuestions(updated);
  };

  const handleDeleteQuestion = (index: number) => {
    const updated = questions.filter((_, i) => i !== index);
    updateQuestions(updated);
  };

  const handleAddQuestion = () => {
    const newQuestion: any = {
      id: `question-${Date.now()}`,
      type: 'mcq',
      question: '',
      choices: ['', '', '', ''],
      answer: '',
    };
    const updated = [...questions, newQuestion];
    updateQuestions(updated);
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  };

  // Normalize correct answers for MCQ questions. If the answer is specified
  // as a letter (A-D), a number (1-4), or a case-insensitive match of the
  // option, convert it to the actual choice string so the dropdown selects
  // the correct option instead of "Select answer".
  const normalizeCorrectAnswer = (question: any) => {
    if (question.type === 'mcq' && question.answer) {
      const choices: string[] = Array.isArray(question.choices) ? question.choices : [];
      let ans: any = question.answer;
      if (typeof ans === 'string') {
        const trimmed = ans.trim();
        // Check for alphabetical letter (A, B, C, ...)
        const letterIndex = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(trimmed.toUpperCase());
        if (letterIndex >= 0 && letterIndex < choices.length) {
          ans = choices[letterIndex];
        } else {
          // Check for numeric string (1, 2, ...)
          const numIndex = parseInt(trimmed, 10);
          if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= choices.length) {
            ans = choices[numIndex - 1];
          } else {
            // Check for case-insensitive match to one of the choices
            const match = choices.find((c) => c.trim().toLowerCase() === trimmed.toLowerCase());
            if (match) ans = match;
          }
        }
      } else if (typeof ans === 'number') {
        const idx = ans;
        if (idx >= 0 && idx < choices.length) {
          ans = choices[idx];
        }
      }
      return { ...question, answer: ans };
    }
    return question;
  };

  useEffect(() => {
    if (!hasInitialized && initialQuestions.length > 0) {
      const normalized = initialQuestions.map((q: any, index) => {
        const id = q.id || `question-${Date.now()}-${index}`;
        const type = q.type === 'essay' ? 'short_answer' : q.type;
        // Normalize correct answer for MCQ questions to ensure proper dropdown selection
        const normalizedQuestion = normalizeCorrectAnswer({ ...q, id, type, order_position: index });
        return normalizedQuestion;
      });
      const randomize = localStorage.getItem('randomize_questions') === 'true';
      const ordered = randomize ? shuffleArray(normalized) : normalized;
      setQuestions(ordered);
      onQuestionsUpdated(ordered);
      setHasInitialized(true);
    }
  }, [initialQuestions, hasInitialized, onQuestionsUpdated]);

  useEffect(() => {
    if (hasInitialized) {
      onQuestionsUpdated(questions);
    }
  }, [questions]);

  // Initialize timer settings based on props or localStorage when creating a new quiz.
  useEffect(() => {
    // If initialDurationSeconds is provided (editing existing quiz), use that value
    if (initialDurationSeconds !== undefined) {
      if (initialDurationSeconds > 0) {
        setTimerEnabled(true);
        // Round up seconds to minutes for display
        setDurationMinutes(Math.ceil(initialDurationSeconds / 60));
      } else {
        setTimerEnabled(false);
      }
      return;
    }
    // Otherwise, read from localStorage for new quiz creation
    if (typeof window !== 'undefined') {
      const enabled = localStorage.getItem('quiz_time_limit_enabled') === 'true';
      setTimerEnabled(enabled);
      if (enabled) {
        const minutesStr = localStorage.getItem('quiz_time_limit_minutes');
        const minutes = minutesStr ? parseInt(minutesStr, 10) : 10;
        setDurationMinutes(isNaN(minutes) ? 10 : minutes);
      }
    }
  }, [initialDurationSeconds]);

  // Persist timer settings and notify parent when they change
  useEffect(() => {
    if (!timerEnabled) {
      // Timer disabled
      if (typeof window !== 'undefined') {
        localStorage.setItem('quiz_time_limit_enabled', 'false');
        localStorage.removeItem('quiz_time_limit_minutes');
      }
      if (onDurationUpdated) onDurationUpdated(0);
    } else {
      // Timer enabled
      if (typeof window !== 'undefined') {
        localStorage.setItem('quiz_time_limit_enabled', 'true');
        localStorage.setItem('quiz_time_limit_minutes', durationMinutes.toString());
      }
      if (onDurationUpdated) onDurationUpdated(durationMinutes * 60);
    }
  }, [timerEnabled, durationMinutes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{quizTitle}</h2>
          <p className="text-muted-foreground mt-1">Review and edit your quiz</p>
        </div>
        {!hideHeaderActions && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => { onQuestionsUpdated(questions); onPublish(); }} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Publish Quiz'}
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Timer controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="quiz-timer" className="text-sm cursor-pointer">
              Quiz Timer
            </Label>
            <p className="text-muted-foreground text-xs">
              Enable a time limit for this quiz
            </p>
          </div>
          <Switch
            id="quiz-timer"
            checked={timerEnabled}
            onCheckedChange={(val: boolean) => setTimerEnabled(val)}
          />
        </div>
        {timerEnabled && (
          <div className="flex items-center justify-between">
            <Label htmlFor="quiz-duration" className="text-sm cursor-pointer">
              Duration (minutes)
            </Label>
            <Input
              id="quiz-duration"
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, parseInt(e.target.value)))}
              className="w-24"
            />
          </div>
        )}
      </div>

      <Separator />

      <div ref={scrollRef} className="space-y-4 max-h-[500px] overflow-auto pr-2">
        {questions.map((q, index) => (
          <Card key={q.id || index} className="border rounded-md">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Question {index + 1}</span>
                <Button variant="outline" size="sm" onClick={() => handleDeleteQuestion(index)}>
                  Delete
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <Label className="text-sm">Type</Label>
                  <select
                    className="mt-1 block w-full border rounded-md p-2 text-sm bg-white text-black dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                    value={q.type as any}
                    onChange={(e) => handleTypeChange(index, e.target.value)}
                  >
                    <option value="mcq">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                    <option value="short_answer">Short Answer</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm">Question</Label>
                  <Input
                    className="mt-1"
                    value={(q as any).question ?? ''}
                    onChange={(e) => handleQuestionFieldChange(index, 'question', e.target.value)}
                    placeholder="Enter question text"
                  />
                </div>
                {q.type === 'mcq' && (
                  <div className="space-y-2">
                    <Label className="text-sm">Choices</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {((q as any).choices || ['', '', '', '']).map((choice: string, cIndex: number) => (
                        <Input
                          key={cIndex}
                          value={choice}
                          onChange={(e) => handleChoiceChange(index, cIndex, e.target.value)}
                          placeholder={`Choice ${String.fromCharCode(65 + cIndex)}`}
                          className="mt-0"
                        />
                      ))}
                    </div>
                    <div className="mt-2">
                      <Label className="text-sm">Correct Answer</Label>
                      <select
                        className="mt-1 block w-full border rounded-md p-2 text-sm bg-white text-black dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                        value={(q as any).answer ?? ''}
                        onChange={(e) => handleQuestionFieldChange(index, 'answer', e.target.value)}
                      >
                        <option value="">Select answer</option>
                        {((q as any).choices || []).map((choice: string, cIndex: number) => (
                          <option key={cIndex} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {q.type === 'true_false' && (
                  <div className="mt-2">
                    <Label className="text-sm">Answer</Label>
                    <select
                      className="mt-1 block w-full border rounded-md p-2 text-sm bg-white text-black dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                      value={(q as any).answer ?? ''}
                      onChange={(e) => handleQuestionFieldChange(index, 'answer', e.target.value)}
                    >
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </select>
                  </div>
                )}
                {q.type === 'short_answer' && (
                  <div className="mt-2">
                    <Label className="text-sm">Answer</Label>
                    <Input
                      className="mt-1 bg-white text-black dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:placeholder-gray-400"
                      value={(q as any).answer ?? ''}
                      onChange={(e) => handleQuestionFieldChange(index, 'answer', e.target.value)}
                      placeholder="Enter answer"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="pt-2">
        <Button variant="outline" onClick={handleAddQuestion} className="w-full">
          Add Question
        </Button>
      </div>
    </div>
  );
};

export default TabPreviewContent;