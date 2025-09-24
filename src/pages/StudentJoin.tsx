import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

type Section = { id: string; code: string };
type Quiz = { id: string; title: string; invitation_code: string | null; is_code_active: boolean };

const StudentJoin = () => {
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Sections for dropdown
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');

  // Quizzes for professors
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const selectedQuiz = useMemo(
    () => quizzes.find(q => q.id === selectedQuizId) || null,
    [quizzes, selectedQuizId]
  );

  const navigate = useNavigate();
  const { user } = useAuth();
  const isProfessor = Boolean(user); // logged-in creator/host

  // Load professor's quizzes (if logged in)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isProfessor) return;

      // Use select('*') to avoid type errors when local TS types lag behind DB
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', user!.id)
        // use generic filter to avoid TS complaining about missing columns in generated types
        .filter('published', 'eq', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error(error);
        if (!cancelled) toast.error('Failed to load your quizzes.');
        return;
      }

      // Map to the shape we need, with safe fallbacks
      const mapped: Quiz[] = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        invitation_code: r.invitation_code ?? null,
        is_code_active: Boolean(r.is_code_active),
      }));

      if (!cancelled) setQuizzes(mapped);
    })();
    return () => { cancelled = true; };
  }, [isProfessor, user]);

  // When a quiz is selected, load ONLY its allowed sections (via quiz_sections)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedQuizId) {
        setSections([]);
        setSelectedSectionId('');
        return;
      }

      // 1) get the section IDs linked to this quiz
      const { data: qs, error: qsErr } = await supabase
        .from('quiz_sections')
        .select('section_id')
        .eq('quiz_id', selectedQuizId);

      if (qsErr) {
        console.error(qsErr);
        if (!cancelled) {
          setSections([]);
          setSelectedSectionId('');
          toast.error('Failed to load allowed sections.');
        }
        return;
      }

      const ids = (qs || []).map(r => r.section_id);
      if (ids.length === 0) {
        if (!cancelled) {
          setSections([]);
          setSelectedSectionId('');
        }
        return;
      }

      // 2) pull the actual section rows
      const { data: sects, error: sectErr } = await supabase
        .from('class_sections')
        .select('id, code')
        .in('id', ids)
        .order('code', { ascending: true });

      if (sectErr) {
        console.error(sectErr);
        if (!cancelled) {
          setSections([]);
          setSelectedSectionId('');
          toast.error('Failed to load sections.');
        }
        return;
      }

      if (!cancelled) {
        const list = (sects || []) as Section[];
        setSections(list);
        // auto-pick if there’s only one eligible section
        if (list.length === 1) {
          setSelectedSectionId(list[0].id);
        } else {
          setSelectedSectionId('');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedQuizId]);

  // For students (not logged-in) we keep the original: allow all sections list for display
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isProfessor) return; // professor sees filtered sections per selected quiz
      const { data, error } = await supabase
        .from('class_sections')
        .select('id, code')
        .order('code', { ascending: true });
      if (!error && !cancelled) {
        setSections((data || []) as Section[]);
      }
    })();
    return () => { cancelled = true; };
  }, [isProfessor]);

  const handleJoinQuiz = async (e: React.FormEvent) => {
    e.preventDefault();

    // HOST FLOW (professor logged-in)
    if (isProfessor) {
      if (!selectedQuiz) {
        toast.error('Please select which quiz to start.');
        return;
      }
      if (!selectedQuiz.is_code_active) {
        toast.error('This quiz is not active. Please activate it first.');
        return;
      }
      if (!selectedSectionId) {
        toast.error('Please select the section that will take this quiz.');
        return;
      }

      // navigate to waiting room as host
      navigate(`/quiz/waiting/${selectedQuiz.id}`, {
        state: {
          username: 'Quiz Host',
          quizId: selectedQuiz.id,
          quizTitle: selectedQuiz.title,
          joinCode: selectedQuiz.invitation_code || '',
          isStudent: false,
          isOwner: true,
          section: (() => {
            const s = sections.find(x => x.id === selectedSectionId);
            return s ? { id: s.id, code: s.code } : null;
          })(),
        },
      });
      return;
    }

    // STUDENT FLOW (not logged-in)
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!joinCode.trim()) {
      toast.error("Please enter a join code");
      return;
    }

    setIsJoining(true);
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('invitation_code', joinCode.trim())
        .eq('published', true)
        .maybeSingle();

      if (error || !data) {
        toast.error("Invalid join code. Please check and try again.");
        return;
      }

      const quiz = data as any;

      navigate(`/quiz/waiting/${quiz.id}`, {
        state: {
          username: username.trim(),
          quizId: quiz.id,
          quizTitle: quiz.title,
          joinCode: joinCode.trim(),
          isStudent: true,
          isOwner: false,
          section: null, // students don’t pick section here
        },
      });
    } catch (err) {
      console.error("Error joining quiz:", err);
      toast.error("Failed to join quiz. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center bg-muted/20 p-4"
    >
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">{isProfessor ? 'Start a Quiz' : 'Join Quiz'}</h1>
          <p className="text-muted-foreground mt-2">
            {isProfessor
              ? 'Pick one of your quizzes and the eligible section.'
              : 'Enter your details to participate'}
          </p>
        </div>

        <form onSubmit={handleJoinQuiz} className="space-y-6">
          {/* PROFESSOR: pick quiz first */}
          {isProfessor && (
            <div className="space-y-2">
              <Label htmlFor="quizSelect">Quiz</Label>
              <select
                id="quizSelect"
                value={selectedQuizId}
                onChange={(e) => setSelectedQuizId(e.target.value)}
                className="w-full p-2 border rounded-md bg-background text-foreground"
              >
                <option value="">-- Select Quiz --</option>
                {quizzes.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.title}{q.is_code_active ? '' : ' (INACTIVE)'}
                  </option>
                ))}
              </select>
              {selectedQuiz && (
                <p className="text-xs text-muted-foreground">
                  Code: {selectedQuiz.invitation_code || '—'} • Status:{' '}
                  {selectedQuiz.is_code_active ? 'Active' : 'Inactive'}
                </p>
              )}
            </div>
          )}

          {/* PROFESSOR: section filtered by selected quiz */}
          {isProfessor && (
            <div className="space-y-2">
              <Label htmlFor="sectionSelect">Section</Label>
              <select
                id="sectionSelect"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full p-2 border rounded-md bg-background text-foreground"
                disabled={!selectedQuizId || sections.length === 0}
              >
                <option value="">{selectedQuizId ? '-- Select Section --' : 'Pick a quiz first'}</option>
                {sections.map((sect) => (
                  <option key={sect.id} value={sect.id}>
                    {sect.code}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only sections added to this quiz are shown.
              </p>
            </div>
          )}

          {/* STUDENT: name + code */}
          {!isProfessor && (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">Your Name</Label>
                <Input
                  id="username"
                  placeholder="SURNAME, FIRST NAME, MIDDLE INITIAL."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="joinCode">Quiz Code</Label>
                <Input
                  id="joinCode"
                  placeholder="ENTER QUIZ CODE"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isJoining || (isProfessor && (!selectedQuizId || !selectedSectionId))}
          >
            {isProfessor ? (isJoining ? 'Starting…' : 'Start Waiting Room') : (isJoining ? 'Joining…' : 'Join Quiz')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a href="/" className="text-primary hover:underline">
            Back to Home
          </a>
        </div>
      </div>
    </motion.div>
  );
};

export default StudentJoin;