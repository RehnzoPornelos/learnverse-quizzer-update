import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { QuizQuestion } from '@/services/quizService';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface TabPreviewContentProps {
  quizTitle: string;
  onBack: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  onQuestionsUpdated: (questions: QuizQuestion[]) => void;
  initialQuestions?: QuizQuestion[];
  /** Optional initial duration in seconds for quizzes with timers */
  initialDurationSeconds?: number;
  /** Callback when duration is updated (seconds). Use undefined or 0 for no timer */
  onDurationUpdated?: (seconds: number) => void;
  /** Hide internal header buttons (Back/Publish) when embedding within QuizEdit */
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

  // ---- Timer (read explicit flag from localStorage; no leading zeros) ----
  const [timerEnabled, setTimerEnabled] = useState<boolean>(false);
  const [durationMinutesStr, setDurationMinutesStr] = useState<string>(''); // string for formatting control

  // guard to hydrate timer ONCE to avoid any flicker/loop
  const timerHydratedRef = useRef(false);

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
        base.choices = base.choices && Array.isArray(base.choices) ? base.choices : ['', '', '', ''];
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
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // Initialize questions
  useEffect(() => {
    if (!hasInitialized && initialQuestions.length > 0) {
      const normalized = initialQuestions.map((q: any, index) => {
        const id = q.id || `question-${Date.now()}-${index}`;
        const type = q.type === 'essay' ? 'short_answer' : q.type;
        const base: any = { ...q, id, type, order_position: index };

        if (type === 'mcq' && base.answer) {
          const choices: string[] = Array.isArray(base.choices) ? base.choices : [];
          const ansRaw = String(base.answer).trim();
          let normalizedAns = '';

          const numericIndex = parseInt(ansRaw);
          if (!isNaN(numericIndex)) {
            const idx = numericIndex - 1;
            if (idx >= 0 && idx < choices.length) {
              normalizedAns = choices[idx];
            }
          }
          if (!normalizedAns) {
            const letterIndex = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(ansRaw.toUpperCase());
            if (letterIndex >= 0 && letterIndex < choices.length) {
              normalizedAns = choices[letterIndex];
            }
          }
          if (!normalizedAns) {
            const found = choices.find((c) => c.trim().toLowerCase() === ansRaw.toLowerCase());
            if (found) normalizedAns = found;
          }
          base.answer = normalizedAns || ansRaw;
        }

        if (type === 'true_false' && base.answer !== undefined) {
          if (typeof base.answer === 'boolean') {
            base.answer = base.answer ? 'True' : 'False';
          }
        }
        return base;
      });

      const randomize = localStorage.getItem('randomize_questions') === 'true';
      const ordered = randomize ? shuffleArray(normalized) : normalized;
      setQuestions(ordered);
      onQuestionsUpdated(ordered);
      setHasInitialized(true);
    }
  }, [initialQuestions, hasInitialized, onQuestionsUpdated]);

  // Initialize timer ONCE (prevents any on/off flicker loop)
  useEffect(() => {
    if (timerHydratedRef.current) return; // already hydrated once

    let enabled: boolean | null = null;
    let seconds: number | null = null;

    if (typeof window !== 'undefined') {
      const flag = localStorage.getItem('quiz_timer_enabled');
      if (flag === 'true') enabled = true;
      if (flag === 'false') enabled = false;

      const stored = localStorage.getItem('quiz_duration_seconds');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) seconds = parsed;
      }
    }

    // fall back to prop only when we have no explicit flag
    if (enabled === null && typeof initialDurationSeconds === 'number') {
      if (initialDurationSeconds > 0) {
        enabled = true;
        seconds = initialDurationSeconds;
      } else {
        enabled = false;
        seconds = null;
      }
    }

    if (enabled && seconds && seconds > 0) {
      setTimerEnabled(true);
      setDurationMinutesStr(String(Math.ceil(seconds / 60))); // no leading zeros
    } else {
      setTimerEnabled(false);
      setDurationMinutesStr('');
    }

    timerHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // <-- run once only

  // Persist timer changes back to localStorage + parent callback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const minutes = Math.max(0, parseInt(durationMinutesStr || '0', 10) || 0);

    if (timerEnabled && minutes > 0) {
      localStorage.setItem('quiz_timer_enabled', 'true');
      localStorage.setItem('quiz_duration_seconds', String(minutes * 60));
      if (onDurationUpdated) onDurationUpdated(minutes * 60);
    } else {
      localStorage.setItem('quiz_timer_enabled', 'false');
      localStorage.removeItem('quiz_duration_seconds');
      if (onDurationUpdated) onDurationUpdated(0);
    }
  }, [timerEnabled, durationMinutesStr, onDurationUpdated]);

  useEffect(() => {
    if (hasInitialized) onQuestionsUpdated(questions);
  }, [questions, hasInitialized, onQuestionsUpdated]);

  const handlePublishClick = () => {
    // ⛔ Guard: if timer is on, a positive number of minutes is required
    if (timerEnabled) {
      const minutes = parseInt(durationMinutesStr || '0', 10) || 0;
      if (minutes <= 0) {
        toast.error('Please add a duration in minutes or turn off “Add Timer”.');
        return;
      }
    }
    onQuestionsUpdated(questions);
    onPublish();
  };

  return (
    <div className="space-y-6">
      {/* Header with quiz title and actions */}
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
            <Button onClick={handlePublishClick} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Publish Quiz'}
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Timer settings */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="quiz-timer" className="text-sm cursor-pointer">
              Add Timer
            </Label>
            <p className="text-muted-foreground text-xs">Set a time limit for completing the quiz</p>
          </div>
          <Switch
            id="quiz-timer"
            checked={timerEnabled}
            onCheckedChange={(val: boolean) => {
              setTimerEnabled(val);
              if (val && (durationMinutesStr === '0' || durationMinutesStr === '')) {
                setDurationMinutesStr('');
              }
            }}
          />
        </div>

        {timerEnabled && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="ui-input w-24"
              value={durationMinutesStr}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                setDurationMinutesStr(cleaned);
              }}
              onBlur={() => {
                const cleaned = (durationMinutesStr || '').replace(/^0+(?=\d)/, '');
                setDurationMinutesStr(cleaned);
              }}
              placeholder="Minutes"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
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
                    className="ui-select mt-1 text-sm"
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
                    className="ui-input mt-1"
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
                          className="ui-input"
                        />
                      ))}
                    </div>
                    <div className="mt-2">
                      <Label className="text-sm">Correct Answer</Label>
                      <select
                        className="ui-select mt-1 text-sm"
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
                      className="ui-select mt-1 text-sm"
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
                      className="ui-input mt-1"
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
