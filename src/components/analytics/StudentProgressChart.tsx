
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StudentProgress {
  id: string;
  name: string;
  progress: {
    quiz: string;
    score: number;
  }[];
  averageScore: number;
}

interface ProgressChartData {
  name: string;
  [key: string]: string | number;
}

const StudentProgressChart = () => {
  const [studentProgressData, setStudentProgressData] = useState<StudentProgress[]>([]);
  const [progressChartData, setProgressChartData] = useState<ProgressChartData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  useEffect(() => {
    const fetchStudentData = async () => {
      setIsLoading(true);
      try {
        // Fetch quizzes from Supabase to use their titles
        const { data: quizzes, error } = await supabase
          .from('quizzes')
          .select('id, title')
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (error) {
          console.error("Error fetching quizzes for student progress:", error);
          // Use mock data if there's an error
          setMockData();
          return;
        }

        // If no quizzes are returned or empty array, use mock data
        if (!quizzes || quizzes.length === 0) {
          setMockData();
          return;
        }

        // Generate random student data based on real quiz titles
        const studentNames = [
          'Emma Johnson', 'Liam Smith', 'Olivia Brown', 
          'Noah Garcia', 'Ava Miller'
        ];
        
        const students: StudentProgress[] = studentNames.map((name, studentIndex) => {
          const studentProgress = quizzes.map((quiz, quizIndex) => {
            // Generate different patterns for different students
            let baseScore;
            switch (studentIndex) {
              case 0: // Emma - starts good, stays good
                baseScore = 85 + (quizIndex * 2);
                break;
              case 1: // Liam - steady improvement
                baseScore = 72 + (quizIndex * 4);
                break;
              case 2: // Olivia - decreasing trend
                baseScore = 95 - (quizIndex * 3);
                break;
              case 3: // Noah - significant improvement
                baseScore = 65 + (quizIndex * 6);
                break;
              case 4: // Ava - fluctuating
                baseScore = 85 + (quizIndex % 2 === 0 ? -5 : 5);
                break;
              default:
                baseScore = 75;
            }
            return {
              quiz: quiz.title,
              score: Math.min(100, Math.max(0, baseScore))  // Ensure score is between 0-100
            };
          });
          
          // Calculate average
          const avgScore = studentProgress.reduce((sum, p) => sum + p.score, 0) / studentProgress.length;
          
          return {
            id: `student${studentIndex + 1}`,
            name,
            progress: studentProgress,
            averageScore: avgScore
          };
        });
        
        // Create progress chart data for line chart
        const chartData = quizzes.map((quiz, index) => {
          const dataPoint: ProgressChartData = { name: quiz.title };
          students.forEach(student => {
            const shortName = student.name.split(' ')[0]; // Use first name only
            dataPoint[shortName] = student.progress[index]?.score || 0;
          });
          return dataPoint;
        });

        setStudentProgressData(students);
        setProgressChartData(chartData);
      } catch (error) {
        console.error("Error in student progress data fetching:", error);
        setMockData();
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentData();
  }, []);

  const setMockData = () => {
    // Mock data if API call fails or returns empty
    const mockStudentData = [
      { 
        id: 'student1',
        name: 'Emma Johnson',
        progress: [
          { quiz: 'Quiz 1', score: 85 },
          { quiz: 'Quiz 2', score: 78 },
          { quiz: 'Quiz 3', score: 92 },
          { quiz: 'Quiz 4', score: 88 },
          { quiz: 'Quiz 5', score: 95 },
        ],
        averageScore: 87.6
      },
      { 
        id: 'student2',
        name: 'Liam Smith',
        progress: [
          { quiz: 'Quiz 1', score: 72 },
          { quiz: 'Quiz 2', score: 75 },
          { quiz: 'Quiz 3', score: 81 },
          { quiz: 'Quiz 4', score: 85 },
          { quiz: 'Quiz 5', score: 88 },
        ],
        averageScore: 80.2
      },
      { 
        id: 'student3',
        name: 'Olivia Brown',
        progress: [
          { quiz: 'Quiz 1', score: 95 },
          { quiz: 'Quiz 2', score: 90 },
          { quiz: 'Quiz 3', score: 85 },
          { quiz: 'Quiz 4', score: 88 },
          { quiz: 'Quiz 5', score: 82 },
        ],
        averageScore: 88.0
      },
      { 
        id: 'student4',
        name: 'Noah Garcia',
        progress: [
          { quiz: 'Quiz 1', score: 65 },
          { quiz: 'Quiz 2', score: 72 },
          { quiz: 'Quiz 3', score: 78 },
          { quiz: 'Quiz 4', score: 85 },
          { quiz: 'Quiz 5', score: 92 },
        ],
        averageScore: 78.4
      },
      { 
        id: 'student5',
        name: 'Ava Miller',
        progress: [
          { quiz: 'Quiz 1', score: 90 },
          { quiz: 'Quiz 2', score: 85 },
          { quiz: 'Quiz 3', score: 82 },
          { quiz: 'Quiz 4', score: 78 },
          { quiz: 'Quiz 5', score: 85 },
        ],
        averageScore: 84.0
      },
    ];
    
    // Transform data for line chart visualization
    const mockProgressChartData = [
      { name: 'Quiz 1', Emma: 85, Liam: 72, Olivia: 95, Noah: 65, Ava: 90 },
      { name: 'Quiz 2', Emma: 78, Liam: 75, Olivia: 90, Noah: 72, Ava: 85 },
      { name: 'Quiz 3', Emma: 92, Liam: 81, Olivia: 85, Noah: 78, Ava: 82 },
      { name: 'Quiz 4', Emma: 88, Liam: 85, Olivia: 88, Noah: 85, Ava: 78 },
      { name: 'Quiz 5', Emma: 95, Liam: 88, Olivia: 82, Noah: 92, Ava: 85 },
    ];
    
    setStudentProgressData(mockStudentData);
    setProgressChartData(mockProgressChartData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-5 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-48 mt-1"></div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-96 bg-muted rounded"></div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-5 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-48 mt-1"></div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80 bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Student Progress Over Time</CardTitle>
          <CardDescription>Score trends across multiple quizzes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={progressChartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Emma" stroke="#8884d8" activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="Liam" stroke="#82ca9d" />
                <Line type="monotone" dataKey="Olivia" stroke="#ff7300" />
                <Line type="monotone" dataKey="Noah" stroke="#0088FE" />
                <Line type="monotone" dataKey="Ava" stroke="#FF8042" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Student Performance Details</CardTitle>
          <CardDescription>Individual student analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Average Score</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Improvement</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentProgressData.map((student) => {
                const firstScore = student.progress[0]?.score || 0;
                const lastScore = student.progress[student.progress.length - 1]?.score || 0;
                const improvement = lastScore - firstScore;
                
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.averageScore.toFixed(1)}</TableCell>
                    <TableCell className="w-64">
                      <div className="flex items-center gap-2">
                        <Progress value={student.averageScore} className="h-2" />
                        <span className="text-sm">{student.averageScore.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={improvement >= 0 ? "text-green-600" : "text-red-600"}>
                        {improvement > 0 ? '+' : ''}{improvement.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {student.averageScore >= 90 ? (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-green-500 text-primary-foreground hover:bg-green-500/80">
                          Excellent
                        </span>
                      ) : student.averageScore >= 80 ? (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-blue-500 text-primary-foreground hover:bg-blue-500/80">
                          Good
                        </span>
                      ) : student.averageScore >= 70 ? (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-yellow-500 text-primary-foreground hover:bg-yellow-500/80">
                          Average
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-red-500 text-primary-foreground hover:bg-red-500/80">
                          Needs Help
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProgressChart;
