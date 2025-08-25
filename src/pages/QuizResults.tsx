
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import Navbar from '@/components/layout/Navbar';
import { getQuizWithQuestions } from '@/services/quizService';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Download, LineChart, UserRound } from "lucide-react";
import { Progress } from '@/components/ui/progress';

const QuizResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Mock student results data
  const [studentResults] = useState([
    { id: '1', name: 'Emma Johnson', score: 92, completedAt: '2025-04-05T14:32:00Z', timeSpent: '8m 42s' },
    { id: '2', name: 'Liam Smith', score: 78, completedAt: '2025-04-05T15:45:00Z', timeSpent: '12m 15s' },
    { id: '3', name: 'Olivia Brown', score: 85, completedAt: '2025-04-06T09:20:00Z', timeSpent: '10m 30s' },
    { id: '4', name: 'Noah Garcia', score: 67, completedAt: '2025-04-06T11:10:00Z', timeSpent: '14m 05s' },
    { id: '5', name: 'Ava Miller', score: 95, completedAt: '2025-04-06T16:25:00Z', timeSpent: '9m 18s' },
  ]);

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

  const handleBackClick = () => {
    navigate('/dashboard');
  };

  const calculateAverageScore = () => {
    if (!studentResults.length) return 0;
    return Math.round(studentResults.reduce((acc, student) => acc + student.score, 0) / studentResults.length);
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                    <LineChart className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{calculateAverageScore()}%</div>
                    <Progress value={calculateAverageScore()} className="h-2 mt-2" />
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Students Completed</CardTitle>
                    <UserRound className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{studentResults.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Out of 25 total students
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Hardest Question</CardTitle>
                    <LineChart className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-medium truncate">Question #2</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      45% correct answer rate
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
                      {studentResults.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={student.score >= 75 ? "text-green-600" : "text-amber-600"}>
                                {student.score}%
                              </span>
                              <Progress value={student.score} className="w-16 h-2" />
                            </div>
                          </TableCell>
                          <TableCell>{new Date(student.completedAt).toLocaleString()}</TableCell>
                          <TableCell>{student.timeSpent}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">View Details</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
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
