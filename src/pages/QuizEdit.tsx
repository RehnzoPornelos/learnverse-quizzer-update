
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import Navbar from '@/components/layout/Navbar';
import { getQuizWithQuestions, saveQuiz } from '@/services/quizService';
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import TabPreviewContent from '@/components/quiz/TabPreviewContent';

const QuizEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    const fetchQuiz = async () => {
      try {
        if (!id) return;
        const quizData = await getQuizWithQuestions(id);
        console.log('Fetched quiz data:', quizData);
        setQuiz(quizData);
        setQuestions(quizData.questions || []);
      } catch (error) {
        console.error('Error fetching quiz:', error);
        toast.error('Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [id]);

  const handleQuestionsUpdated = (updatedQuestions: any[]) => {
    console.log('Questions updated:', updatedQuestions);
    setQuestions(updatedQuestions);
  };

  const handleSaveQuiz = async () => {
    if (!quiz) return;
    
    try {
      setSaving(true);
      await saveQuiz(
        {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description || '',
          published: quiz.published,
        },
        questions
      );
      toast.success('Quiz saved successfully');
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
                  <Button 
                    onClick={handleSaveQuiz}
                    disabled={saving}
                  >
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
              
              <TabPreviewContent
                quizTitle={quiz.title}
                onBack={handleBackClick}
                onPublish={handleSaveQuiz}
                isPublishing={saving}
                onQuestionsUpdated={handleQuestionsUpdated}
                initialQuestions={questions}
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
