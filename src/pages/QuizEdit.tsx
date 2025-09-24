// src/pages/QuizEdit.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import Navbar from '@/components/layout/Navbar';
import { getQuizWithQuestions, saveQuiz } from '@/services/quizService';
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import TabPreviewContent from '@/components/quiz/TabPreviewContent';
import { Switch } from '@/components/ui/switch';

// ⬇️ sections service helpers
import {
  getQuizSectionCodes,
  updateQuizSectionsByCodes,
} from '@/services/quizService';

// ⬇️ NEW: editor in controlled mode
import ClassSectionsEditor from '@/components/quiz/ClassSectionsEditor';

const QuizEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quizDurationSeconds, setQuizDurationSeconds] = useState<number | null>(null);

  // Activation toggle state (LOCAL ONLY until Save)
  const [isCodeActive, setIsCodeActive] = useState<boolean>(false);
  const [activationDirty, setActivationDirty] = useState<boolean>(false);

  // ⬇️ NEW: sections state owned by QuizEdit so we can save with the quiz
  const [sectionCodes, setSectionCodes] = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(true);

  // Allow editing the quiz title locally
  const handleTitleChange = (e: any) => {
    const newTitle = e.target.value;
    setQuiz((prev: any) => (prev ? { ...prev, title: newTitle } : prev));
  };

  useEffect(() => {
    window.scrollTo(0, 0);

    const fetchQuiz = async () => {
      try {
        if (!id) return;
        const quizData = await getQuizWithQuestions(id);
        setQuiz(quizData);

        // Normalize questions for editor
        const uiQuestions = (quizData.questions || []).map((q: any) => {
          let uiType = q.type;
          if (q.type === 'multiple_choice') uiType = 'mcq';

          const uiQuestion: any = {
            id: q.id,
            type: uiType,
            question: q.text,
            choices: Array.isArray(q.options) ? q.options : [],
          };

          if (uiType === 'mcq') {
            uiQuestion.answer = q.correct_answer ?? '';
          } else if (uiType === 'true_false') {
            const ans = q.correct_answer;
            if (typeof ans === 'boolean') uiQuestion.answer = ans ? 'True' : 'False';
            else if (typeof ans === 'string') uiQuestion.answer = ans;
            else uiQuestion.answer = '';
          } else {
            uiQuestion.answer = q.correct_answer ?? '';
          }
          return uiQuestion;
        });
        setQuestions(uiQuestions);

        setQuizDurationSeconds(quizData.quiz_duration_seconds ?? null);

        // hydrate activation flag
        setIsCodeActive(Boolean((quizData as any).is_code_active));
        setActivationDirty(false);
      } catch (error) {
        console.error('Error fetching quiz:', error);
        toast.error('Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [id]);

  // ⬇️ Load current sections for this quiz into state (so we can save with main button)
  useEffect(() => {
    let live = true;
    (async () => {
      if (!id) return;
      try {
        setLoadingSections(true);
        const picked = await getQuizSectionCodes(id);
        if (!live) return;
        setSectionCodes(picked);
      } finally {
        setLoadingSections(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const handleQuestionsUpdated = (updatedQuestions: any[]) => {
    setQuestions(updatedQuestions);
  };

  const handleSaveQuiz = async () => {
    if (!quiz) return;

    try {
      setSaving(true);

      // 1) Persist section links FIRST so they survive even if we later navigate
      const quizId = quiz.id || id || '';
      await updateQuizSectionsByCodes(quizId, sectionCodes);

      // 2) Normalize questions and save quiz metadata
      const dbQuestions = questions.map((q: any, index: number) => {
        let dbType = q.type === 'multiple_choice' ? 'mcq' : q.type;
        const allowed = ['mcq', 'true_false', 'short_answer'];
        if (!allowed.includes(dbType)) dbType = 'mcq';

        const row: any = {
          id: q.id || undefined,
          text: q.question ?? '',
          type: dbType,
          order_position: index,
        };

        if (dbType === 'mcq') {
          row.options = Array.isArray(q.choices) ? q.choices : [];
          row.correct_answer = q.answer ?? '';
        } else if (dbType === 'true_false') {
          row.options = null;
          row.correct_answer =
            typeof q.answer === 'string' ? q.answer.toLowerCase() === 'true' : !!q.answer;
        } else {
          row.options = null;
          row.correct_answer = q.answer ?? '';
        }

        return row;
      });

      await saveQuiz(
        {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description || '',
          published: quiz.published,
          quiz_duration_seconds: quizDurationSeconds ?? null,
          is_code_active: isCodeActive,
        },
        dbQuestions
      );

      toast.success('Quiz saved successfully');
      setActivationDirty(false);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving quiz:', error);
      toast.error('Failed to save quiz');
    } finally {
      setSaving(false);
    }
  };

  const handleBackClick = () => {
    navigate('/dashboard');
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
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : quiz ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">Edit Quiz</h1>
                  <p className="text-muted-foreground mt-1">Make changes to your quiz</p>
                </div>
                <div className="flex space-x-3">
                  <Button variant="outline" onClick={handleBackClick}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                  </Button>
                  <Button onClick={handleSaveQuiz} disabled={saving || loadingSections}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Quiz Name */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-foreground" htmlFor="quiz-name">
                  Quiz Name
                </label>
                <input
                  id="quiz-name"
                  type="text"
                  value={quiz.title}
                  onChange={handleTitleChange}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Activate quiz toggle (local until Save) */}
              <div className="flex items-center justify-between rounded-md border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Activation</p>
                  <p className="text-xs text-muted-foreground">
                    Only <span className="font-medium">Active</span> quizzes can be used to start a class session.
                    {activationDirty && (
                      <span className="ml-1 text-amber-600">— unsaved change</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${isCodeActive ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {isCodeActive ? 'Active' : 'Inactive'}
                  </span>
                  <Switch
                    checked={isCodeActive}
                    onCheckedChange={(next: boolean) => {
                      setIsCodeActive(next);
                      setActivationDirty(true);
                    }}
                  />
                </div>
              </div>

              {/* ⬇️ NEW: Class Sections editor in controlled mode (no internal Save button) */}
              <ClassSectionsEditor
                quizId={quiz?.id || id || ''}
                value={sectionCodes}
                onValueChange={setSectionCodes}
                showSaveButton={false}
              />

              <TabPreviewContent
                quizTitle={quiz.title}
                onBack={handleBackClick}
                onPublish={handleSaveQuiz}
                isPublishing={saving}
                onQuestionsUpdated={handleQuestionsUpdated}
                initialQuestions={questions}
                initialDurationSeconds={quizDurationSeconds !== null ? quizDurationSeconds : undefined}
                onDurationUpdated={(sec: number) => setQuizDurationSeconds(sec || null)}
                hideHeaderActions
              />
            </div>
          ) : (
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold">Quiz not found</h2>
              <Button className="mt-4" onClick={handleBackClick}>
                Back to Dashboard
              </Button>
            </div>
          )}
        </div>
      </main>
    </motion.div>
  );
};

export default QuizEdit;