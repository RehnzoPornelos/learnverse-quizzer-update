
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import Navbar from '@/components/layout/Navbar';
import {
  getQuizWithQuestions,
  getQuizEligibleSections,
  getQuizAnalytics,
  getStudentPerformanceList,
  getStudentPerformanceDetails,
} from '@/services/quizService';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Download, LineChart, UserRound } from "lucide-react";
import { Progress } from '@/components/ui/progress';
import { Label } from "@/components/ui/label";

const QuizResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Sections linked to this quiz (for filtering)
  const [sections, setSections] = useState<Array<{ id: string; code: string }>>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  // Aggregated statistics for this quiz and selected section
  const [stats, setStats] = useState<{
    averageScore: number;
    studentsCompleted: number;
    totalStudents: number;
    hardestQuestion?: { id: string; text: string; correctRate: number; avgTimeSeconds: number };
  }>({ averageScore: 0, studentsCompleted: 0, totalStudents: 0 });
  // Student performance list for this quiz and selected section
  const [studentPerformances, setStudentPerformances] = useState<any[]>([]);
  // State for student detail modal
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [detailStudentName, setDetailStudentName] = useState<string>('');

  useEffect(() => {
    window.scrollTo(0, 0);
    
    const fetchQuiz = async () => {
      try {
        if (!id) return;
        const quizData = await getQuizWithQuestions(id);
        setQuiz(quizData);
      } catch (error) {
        console.error('Error fetching quiz:', error);
        toast.error('Failed to load quiz data');
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [id]);

  // Once the quiz is loaded, fetch its eligible sections
  useEffect(() => {
    const loadSections = async () => {
      if (!quiz) return;
      try {
        const sects = await getQuizEligibleSections(quiz.id);
        setSections(sects);
      } catch (error) {
        console.error('Error fetching sections for quiz:', error);
        toast.error('Failed to load sections');
      }
    };
    loadSections();
  }, [quiz]);

  // Fetch analytics and performance list whenever quiz or section selection changes
  useEffect(() => {
    const loadAnalytics = async () => {
      if (!quiz) return;
      try {
        const analytics = await getQuizAnalytics(quiz.id, selectedSectionId || undefined);
        setStats(analytics);
        const perfList = await getStudentPerformanceList(quiz.id, selectedSectionId || undefined);
        setStudentPerformances(perfList);
      } catch (error) {
        console.error('Error loading analytics:', error);
        toast.error('Failed to load quiz analytics');
      }
    };
    loadAnalytics();
  }, [quiz, selectedSectionId]);

  // Handler to change section filter
  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSectionId(e.target.value);
  };

  // Handler to view student details
  const handleViewDetails = async (student: any) => {
    try {
      const details = await getStudentPerformanceDetails(student.id);
      setDetailStudentName(student.student_name);
      setDetailRows(details);
      setDetailsOpen(true);
    } catch (error) {
      console.error('Error fetching student details:', error);
      toast.error('Failed to load student details');
    }
  };

  const handleBackClick = () => {
    navigate('/dashboard');
  };

  // Compute hardest question display index (1-based) using quiz.questions
  const hardestQuestionIndex = () => {
    if (!quiz || !stats.hardestQuestion || !quiz.questions) return null;
    const idx = quiz.questions.findIndex((q: any) => q.id === stats.hardestQuestion?.id);
    return idx >= 0 ? idx + 1 : null;
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
                  <h1 className="text-3xl font-bold">Quiz Results</h1>
                  <p className="text-muted-foreground mt-1">{quiz.title}</p>
                </div>
                <div className="flex space-x-3">
                  <Button variant="outline" onClick={handleBackClick}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                  </Button>
                  <Button>
                    <Download className="mr-2 h-4 w-4" />
                    Export Results
                  </Button>
                </div>
              </div>
              {/* Section filter dropdown */}
              <div className="mt-4">
                <Label htmlFor="sectionSelect" className="mr-2">Section:</Label>
                <select
                  id="sectionSelect"
                  value={selectedSectionId}
                  onChange={handleSectionChange}
                  className="p-2 border rounded-md bg-background text-foreground"
                >
                  <option value="">All Sections</option>
                  {sections.map((sect) => (
                    <option key={sect.id} value={sect.id}>{sect.code}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                    <LineChart className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.averageScore ? Math.round(stats.averageScore) : 0}%
                    </div>
                    <Progress value={stats.averageScore} className="h-2 mt-2" />
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Students Completed</CardTitle>
                    <UserRound className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.studentsCompleted}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Out of {stats.totalStudents} total students
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Hardest Question</CardTitle>
                    <LineChart className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-medium truncate">
                      {stats.hardestQuestion ? (
                        hardestQuestionIndex() !== null ? `Question #${hardestQuestionIndex()}` : stats.hardestQuestion.text
                      ) : 'N/A'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.hardestQuestion ? `${Math.round(stats.hardestQuestion.correctRate * 100)}% correct answer rate` : 'No data'}
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Student Performance</CardTitle>
                  <CardDescription>
                    Detailed results for each student who completed the quiz
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableCaption>A list of student results for this quiz</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Time Spent</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentPerformances.length > 0 ? (
                        studentPerformances.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">{student.student_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={student.score >= 75 ? 'text-green-600' : 'text-amber-600'}>
                                  {student.score}%
                                </span>
                                <Progress value={student.score} className="w-16 h-2" />
                              </div>
                            </TableCell>
                            <TableCell>{new Date(student.completedAt).toLocaleString()}</TableCell>
                            <TableCell>{student.timeSpent}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetails(student)}>View Details</Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4">
                            No performance data found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Student details modal */}
              {detailsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                  <div className="bg-card rounded-lg shadow-lg p-6 max-w-2xl w-full">
                    <h3 className="text-lg font-bold mb-4">Details for {detailStudentName}</h3>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {detailRows.length > 0 ? (
                        detailRows.map((item: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-4">
                            <h4 className="font-semibold mb-1">{item.questionText}</h4>
                            <p className="text-sm">
                              Your Answer:{' '}
                              <span className={item.isCorrect ? 'text-green-600' : 'text-red-600'}>
                                {item.studentAnswer || 'No answer'}
                              </span>
                            </p>
                            <p className="text-sm">Correct Answer: {item.correctAnswer}</p>
                            <p className="text-sm">Time Spent: {item.timeSpent}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No details available.</p>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                    </div>
                  </div>
                </div>
              )}
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

export default QuizResults;