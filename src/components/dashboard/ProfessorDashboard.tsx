import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { BookOpen, LineChart, PlusCircle, Edit, Eye, Trash2, ArrowUpRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getUserQuizzes, Quiz, deleteQuiz } from '@/services/quizService';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Small pill for Active/Inactive state. */
const ActivationBadge = ({ active }: { active?: boolean }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
      ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
    title={active ? 'This quiz code is currently active' : 'This quiz code is not active'}
  >
    <span
      className={`mr-1 inline-block h-2 w-2 rounded-full
        ${active ? 'bg-emerald-500' : 'bg-slate-400'}`}
    />
    {active ? 'Active' : 'Inactive'}
  </span>
);

const ProfessorDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const fetchedQuizzes = await getUserQuizzes();
        // Only include published quizzes on the dashboard.
        setQuizzes(fetchedQuizzes.filter(q => q.published));
      } catch (error) {
        console.error('Error fetching quizzes:', error);
        toast.error('Failed to load quizzes');
      } finally {
        setLoading(false);
      }
    };

    fetchQuizzes();
  }, []);

  const calculateCompletionRate = () => {
    if (quizzes.length === 0) return 0;
    const publishedCount = quizzes.filter(q => q.published).length;
    return Math.round((publishedCount / quizzes.length) * 100);
  };

  const handleEditQuiz = (quizId: string) => navigate(`/quiz/edit/${quizId}`);
  const handleViewResults = (quizId: string) => navigate(`/quiz/results/${quizId}`);

  const handleDeleteQuiz = async (quizId: string, quizTitle: string) => {
    try {
      if (!quizId) {
        toast.error('Invalid quiz identifier.');
        return;
      }
      setDeletingQuizId(quizId);
      await deleteQuiz(quizId);
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
      toast.success(`Quiz "${quizTitle}" deleted successfully`);
    } catch (error) {
      console.error('Error deleting quiz:', error);
      toast.error('Failed to delete quiz. Please try again.');
    } finally {
      setDeletingQuizId(null);
    }
  };

  return (
    <div className="flex flex-col space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Professor Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage your quizzes and student progress</p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/generator">
              <PlusCircle className="w-4 h-4 mr-2" />
              New Quiz
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex space-x-8">
          {['overview', 'quizzes'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 -mb-px font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Quizzes</CardTitle>
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{quizzes.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {
                      quizzes.filter(q =>
                        new Date(q.created_at || '').getMonth() === new Date().getMonth()
                      ).length
                    } this month
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Published Quizzes</CardTitle>
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {quizzes.filter(q => q.published).length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Ready for students</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                  <LineChart className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{calculateCompletionRate()}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Based on published/total quizzes</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Recent Quizzes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {loading ? (
                      <p className="text-center py-4 text-muted-foreground">Loading quizzes...</p>
                    ) : quizzes.length > 0 ? (
                      quizzes.slice(0, 3).map((quiz) => {
                        const isActive = (quiz as any).is_code_active === true;
                        return (
                          <div key={quiz.id} className="flex items-center gap-4">
                            <div className="bg-primary/10 p-3 rounded-md">
                              <BookOpen className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium truncate">{quiz.title}</h4>
                              <div className="mt-1 flex items-center gap-2">
                                <ActivationBadge active={isActive} />
                                <span className="text-xs text-muted-foreground">
                                  Created {new Date(quiz.created_at || '').toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleViewResults(quiz.id || '')}>
                              View <ArrowUpRight className="ml-1 h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">No quizzes created yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.5 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Quiz Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {quizzes.slice(0, 4).map((quiz) => (
                      <div key={quiz.id}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium truncate">{quiz.title}</span>
                          <span className="text-sm font-medium">
                            {Math.floor(Math.random() * 31) + 70}%
                          </span>
                        </div>
                        <Progress value={Math.floor(Math.random() * 31) + 70} className="h-2" />
                      </div>
                    ))}
                    {quizzes.length === 0 && !loading && (
                      <p className="text-center py-4 text-muted-foreground">No quiz data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      )}

      {/* Quizzes */}
      {activeTab === 'quizzes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Quizzes</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <p className="col-span-full text-center py-12 text-muted-foreground">Loading quizzes...</p>
            ) : quizzes.length > 0 ? (
              quizzes.map((quiz) => {
                const isActive = (quiz as any).is_code_active === true;

                return (
                  <motion.div
                    key={quiz.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`glass-card ${isActive ? 'ring-1 ring-emerald-400/40' : ''}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-lg truncate">{quiz.title}</CardTitle>
                        <ActivationBadge active={isActive} />
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Status</span>
                          <span>{quiz.published ? 'Published' : 'Draft'}</span>
                        </div>

                        {quiz.published && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Invitation Code</span>
                            <span className="font-mono">{quiz.invitation_code}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Created</span>
                          <span>{new Date(quiz.created_at || '').toLocaleDateString()}</span>
                        </div>

                        <div className="pt-3 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleEditQuiz(quiz.id || '')}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleViewResults(quiz.id || '')}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Results
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                disabled={deletingQuizId === quiz.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Quiz</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{quiz.title}"? This action cannot be undone and will permanently remove the quiz and all its questions.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteQuiz(quiz.id || '', quiz.title)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Quiz
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <p>No quizzes created yet</p>
              </div>
            )}

            {/* Create New Quiz tile – no ghost button, subtle hover, full-tile clickable */}
            <Link to="/generator" className="group block">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="border-2 border-dashed rounded-2xl min-h-[200px] h-full
                           flex items-center justify-center cursor-pointer
                           transition-colors duration-200
                           hover:border-primary/40 hover:bg-muted/40
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                aria-label="Create New Quiz"
                role="button"
                tabIndex={0}
              >
                <div className="flex flex-col items-center p-6">
                  <PlusCircle className="h-10 w-10 text-muted-foreground mb-2 transition-colors group-hover:text-primary" />
                  <span className="text-muted-foreground font-medium transition-colors group-hover:text-primary">
                    Create New Quiz
                  </span>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessorDashboard;