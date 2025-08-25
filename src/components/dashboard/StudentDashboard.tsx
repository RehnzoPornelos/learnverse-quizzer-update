import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Brain, Calendar, Award, CheckCircle, Clock, GraduationCap, LineChart, Play, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const mockQuizzes = [
  {
    id: 1,
    title: 'Introduction to Psychology',
    questions: 15,
    completed: true,
    score: 85,
    due: 'Completed',
  },
  {
    id: 2,
    title: 'Foundations of Neuroscience',
    questions: 20,
    completed: true,
    score: 78,
    due: 'Completed',
  },
  {
    id: 3,
    title: 'Cognitive Behavioral Theory',
    questions: 10,
    completed: false,
    score: null,
    due: 'Due Oct 15',
  },
  {
    id: 4,
    title: 'Social Psychology Principles',
    questions: 12,
    completed: false,
    score: null,
    due: 'Due Oct 18',
  },
];

const StudentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="flex flex-col space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Student Dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your learning progress</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Clock className="w-4 h-4 mr-2" />
            Recent Activity
          </Button>
          <Button>
            <Play className="w-4 h-4 mr-2" />
            Continue Learning
          </Button>
        </div>
      </div>

      {/* Dashboard Tabs */}
      <div className="border-b">
        <div className="flex space-x-8">
          {['overview', 'quizzes', 'certificates'].map((tab) => (
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

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Quizzes Taken</CardTitle>
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground mt-1">2 in progress</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                  <LineChart className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">82%</div>
                  <p className="text-xs text-muted-foreground mt-1">+5% from last month</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Certificates</CardTitle>
                  <Award className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3</div>
                  <p className="text-xs text-muted-foreground mt-1">1 new this month</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Learning Streak</CardTitle>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">5 days</div>
                  <p className="text-xs text-muted-foreground mt-1">Keep going!</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Quizzes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockQuizzes.filter(q => !q.completed).map((quiz) => (
                      <div key={quiz.id} className="flex items-center gap-4">
                        <div className="bg-primary/10 p-3 rounded-md">
                          <BookOpen className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate">{quiz.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {quiz.questions} questions • {quiz.due}
                          </p>
                        </div>
                        <Button size="sm">
                          Start
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Learning Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Introduction to Psychology</span>
                        <span className="text-sm font-medium">85%</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Foundations of Neuroscience</span>
                        <span className="text-sm font-medium">78%</span>
                      </div>
                      <Progress value={78} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Cognitive Behavioral Theory</span>
                        <span className="text-sm font-medium">Not started</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Social Psychology</span>
                        <span className="text-sm font-medium">Not started</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.6 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Study Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-accent/10 p-3 rounded-md">
                      <Brain className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">Review Neuroscience Foundations</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Based on your recent quiz scores, we recommend focusing on neural pathways and brain structures.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-md">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">Complete Cognitive Theory Quiz</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        This will help strengthen your understanding of psychology fundamentals.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Quizzes Tab */}
      {activeTab === 'quizzes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Quizzes</h2>
            <Button variant="outline" size="sm">
              <Trophy className="w-4 h-4 mr-2" />
              View Leaderboard
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockQuizzes.map((quiz) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="glass-card relative overflow-hidden"
              >
                {quiz.completed && (
                  <div className="absolute top-0 right-0 m-4">
                    <div className="flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Completed</span>
                    </div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Questions</span>
                      <span>{quiz.questions}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span>{quiz.completed ? 'Completed' : 'Not started'}</span>
                    </div>
                    {quiz.score && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Your Score</span>
                        <span className="font-medium">{quiz.score}%</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Due Date</span>
                      <span>{quiz.due}</span>
                    </div>
                    <div className="pt-3">
                      <Button className="w-full" variant={quiz.completed ? 'outline' : 'default'}>
                        {quiz.completed ? 'Review Quiz' : 'Start Quiz'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Your Certificates</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className="glass-card p-6 flex flex-col items-center text-center"
              >
                <Award className="w-16 h-16 text-primary mb-4" />
                <h3 className="text-lg font-medium mb-2">Certificate of Completion</h3>
                <p className="text-muted-foreground mb-4">Introduction to Psychology</p>
                <p className="text-sm text-muted-foreground">Issued on October {i * 3}, 2023</p>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" size="sm">View</Button>
                  <Button size="sm">Download</Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
