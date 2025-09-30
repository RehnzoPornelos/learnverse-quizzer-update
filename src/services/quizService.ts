import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/** helper: rudimentary UUID check so we only treat true DB ids as existing */
const isUuid = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v as string);

export interface QuizQuestion {
  id?: string;
  text: string;
  type: string;
  options: any;
  order_position: number;
  correct_answer?: any;
  // Additional extension fields can be added here; note: `user_id` is not part of the
  // quiz_questions schema since ownership is enforced via a join with the quizzes table.
}

export interface Quiz {
  id?: string;
  title: string;
  description?: string;
  published: boolean;
  invitation_code?: string;
  questions?: QuizQuestion[];
  created_at?: string;
  user_id?: string;
  // Duration of the quiz in seconds; optional
  quiz_duration_seconds?: number;
  is_rumbled?: boolean;
}

// Get a list of quizzes for the current user
export const getUserQuizzes = async () => {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('user_id', auth.user.id)   // fetch only my quizzes
    .eq('published', true)         // show only published (i.e., not soft-deleted)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

//Flip the activation state of a quiz from false to true.
export async function setQuizActivation(quizId: string, active: boolean) {
  const { data, error } = await supabase
    .from('quizzes')
    .update({ is_code_active: active, updated_at: new Date().toISOString() })
    .eq('id', quizId)
    .select('id, is_code_active')
    .single();

  if (error) throw error;
  return data;
}

export async function setQuizRumbled(quizId: string, rumbled: boolean) {
  const { data, error } = await supabase
    .from('quizzes')
    .update({ is_rumbled: rumbled, updated_at: new Date().toISOString() })
    .eq('id', quizId)
    .select('id, is_rumbled')
    .single();
    
  if (error) throw error;
  return data;
}


// Get a specific quiz with its questions
export const getQuizWithQuestions = async (quizId: string) => {
  // Fetch the quiz
  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single();
    
  if (quizError) {
    console.error("Error fetching quiz:", quizError);
    throw quizError;
  }
  
  // Fetch the questions for this quiz
  const { data: questions, error: questionsError } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('order_position', { ascending: true });
    
  if (questionsError) {
    console.error("Error fetching questions:", questionsError);
    throw questionsError;
  }
  
  return { ...quiz, questions };
};

// Fetch the list of sections (class_sections) that are linked to the given quiz via quiz_sections.
// Each returned row contains the section id and its code. If no sections exist, an empty array is returned.
export const getQuizEligibleSections = async (quizId: string) => {
  if (!quizId) throw new Error('Missing quiz id');
  // Fetch section ids for this quiz
  const { data: qs, error: qsErr } = await supabase
    .from('quiz_sections')
    .select('section_id')
    .eq('quiz_id', quizId);
  if (qsErr) throw qsErr;
  const sectionIds = (qs ?? []).map((row: any) => row.section_id);
  if (!sectionIds.length) return [];
  // Fetch the section codes
  const { data: sections, error: sectErr } = await supabase
    .from('class_sections')
    .select('id, code')
    .in('id', sectionIds)
    .order('code', { ascending: true });
  if (sectErr) throw sectErr;
  return sections ?? [];
};

// Compute aggregated analytics for a quiz. Optionally filter by a specific section id.
// Returns averageScore (as a percentage from 0–100), the number of students who completed the quiz
// (i.e. rows in analytics_student_performance), the total number of students who attempted at least one
// question (unique student_name_norm in quiz_responses), and the hardest question with its text,
// correct rate and average time (if data is available).
export const getQuizAnalytics = async (quizId: string, sectionId?: string) => {
  if (!quizId) throw new Error('Missing quiz id');
  // 1) Fetch all performance rows for this quiz (optionally filtered by section)
  const perfQuery = supabase
    .from('analytics_student_performance')
    .select('id, score, completion_time_seconds, student_name_norm, created_at, attempt_no, section_id')
    .eq('quiz_id', quizId);
  const { data: perfData, error: perfErr } = sectionId
    ? await perfQuery.eq('section_id', sectionId)
    : await perfQuery;
  if (perfErr) throw perfErr;
  const performances = perfData ?? [];

  // 2) Determine number of questions in this quiz
  const { data: qrows, error: qerr } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('quiz_id', quizId);
  if (qerr) throw qerr;
  const totalQuestions = (qrows ?? []).length || 1;

  // 3) Compute average score as a percentage
  let averageScore = 0;
  if (performances.length > 0) {
    const sumPercent = performances.reduce((acc: number, row: any) => {
      const rawScore = typeof row.score === 'number' ? row.score : Number(row.score);
      const pct = totalQuestions > 0 ? (rawScore * 100) / totalQuestions : 0;
      return acc + pct;
    }, 0);
    averageScore = sumPercent / performances.length;
  }

  // 4) Students completed = count of performance rows
  const studentsCompleted = performances.length;

  // 5) Compute total students who attempted (distinct student_name_norm from quiz_responses)
  // 5) Compute total students who attempted (distinct student_name_norm)
  const baseResp = (supabase as any) // cast to bypass missing table in generated types
    .from('quiz_responses')
    .select('student_name_norm, section_id')
    .eq('quiz_id', quizId);

  const { data: respData, error: respErr } = sectionId
    ? await baseResp.eq('section_id', sectionId)
    : await baseResp;
  if (respErr) throw respErr;

  const studentsSet = new Set<string>();
  (respData ?? []).forEach((row: any) => {
    if (row.student_name_norm) studentsSet.add(row.student_name_norm as string);
  });
  const totalStudents = studentsSet.size;

  // 6) Determine hardest question using aggregated table
  let hardest:
    | { id: string; correctRate: number; avgTimeSeconds: number; text?: string }
    | null = null;

  const { data: qperfData, error: qperfErr } = await (supabase as any)
    .from('analytics_question_performance')
    .select('question_id, correct_count, incorrect_count, avg_time_seconds')
    .eq('quiz_id', quizId);
  if (qperfErr) throw qperfErr;

  (qperfData ?? []).forEach((row: any) => {
    const correct = typeof row.correct_count === 'number'
      ? row.correct_count : Number(row.correct_count ?? 0);
    const incorrect = typeof row.incorrect_count === 'number'
      ? row.incorrect_count : Number(row.incorrect_count ?? 0);
    const denom = correct + incorrect;
    const rate = denom > 0 ? correct / denom : 0;
    const avgTime = row.avg_time_seconds != null ? Number(row.avg_time_seconds) : 0;

    if (!hardest) {
      hardest = { id: row.question_id, correctRate: rate, avgTimeSeconds: avgTime };
    } else if (rate < hardest.correctRate || (rate === hardest.correctRate && avgTime > hardest.avgTimeSeconds)) {
      hardest = { id: row.question_id, correctRate: rate, avgTimeSeconds: avgTime };
    }
  });

  // Fetch question text for hardest question
  if (hardest) {
    const { data: qData, error: qTextErr } = await supabase
      .from('quiz_questions')
      .select('id, text')
      .eq('id', hardest.id)
      .maybeSingle();
    if (!qTextErr && qData) {
      hardest.text = qData.text;
    }
  }

  return {
    averageScore,
    studentsCompleted,
    totalStudents,
    hardestQuestion: hardest ? { id: hardest.id, text: hardest.text || '', correctRate: hardest.correctRate, avgTimeSeconds: hardest.avgTimeSeconds } : undefined,
  };
};

// Fetch performance list for students taking a quiz. Optionally filter by section id.
// Returns an array of objects containing performance id (student_perf id), student name, percent score, raw score,
// completion time (ISO string), timeSpent (formatted), attempt number and section id.
export const getStudentPerformanceList = async (quizId: string, sectionId?: string) => {
  if (!quizId) throw new Error('Missing quiz id');
  // Fetch all performance rows for this quiz and optional section
  const perfQuery = supabase
    .from('analytics_student_performance')
    .select('id, student_name, score, completion_time_seconds, created_at, attempt_no, section_id')
    .eq('quiz_id', quizId)
    .order('created_at', { ascending: false });
  const { data: perfData, error: perfErr } = sectionId
    ? await perfQuery.eq('section_id', sectionId)
    : await perfQuery;
  if (perfErr) throw perfErr;
  const performances = perfData ?? [];
  // Determine number of questions to compute percent
  const { data: qrows, error: qerr } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('quiz_id', quizId);
  if (qerr) throw qerr;
  const totalQuestions = (qrows ?? []).length || 1;
  return performances.map((row: any) => {
    const rawScore = typeof row.score === 'number' ? row.score : Number(row.score);
    const pct = totalQuestions > 0 ? (rawScore * 100) / totalQuestions : 0;
    const secs = row.completion_time_seconds != null ? Number(row.completion_time_seconds) : 0;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    const timeSpent = `${mins}m ${remSecs.toString().padStart(2, '0')}s`;
    return {
      id: row.id,
      student_name: row.student_name,
      score: Math.round(pct),
      rawScore: rawScore,
      completedAt: row.created_at,
      timeSpent: timeSpent,
      attempt_no: row.attempt_no,
      section_id: row.section_id,
    };
  });
};

// Fetch detailed responses for a given student performance id. This returns a list of questions with
// their text, the student's answer, the correct answer, whether it was correct, and time spent.
export const getStudentPerformanceDetails = async (studentPerfId: string) => {
  if (!studentPerfId) throw new Error('Missing student performance id');
  // Fetch all quiz responses for this performance
  const { data: responses, error: respErr } = await (supabase as any)
    .from('quiz_responses')
    .select('question_id, selected_option, text_answer, is_correct, time_spent_seconds')
    .eq('student_perf_id', studentPerfId);
  if (respErr) throw respErr;
  const respRows = responses ?? [];
  if (respRows.length === 0) return [];

  // Gather unique question ids
  // Gather unique question ids (ensure string[] for .in(...))
  const qIds: string[] = Array.from(
    new Set(
      (respRows as any[]).map((row) => String(row.question_id))
    )
  );

  // Fetch question details
  const { data: qData, error: qErr } = await supabase
    .from('quiz_questions')
    .select('id, text, type, options, correct_answer')
    .in('id', qIds);
  if (qErr) throw qErr;
  const qMap: Record<string, any> = {};
  (qData ?? []).forEach((q: any) => {
    qMap[q.id] = q;
  });
  // Helper to extract option text
  const getOptionText = (options: any, index: number | null) => {
    if (!options || index == null || index < 0) return null;
    // options may be array of strings or array of objects with text field
    const arr = Array.isArray(options) ? options : [];
    const item = arr[index];
    if (!item) return null;
    return typeof item === 'string' ? item : (item.text ?? String(item));
  };
  return respRows.map((resp: any) => {
    const q = qMap[resp.question_id];
    if (!q) {
      return {
        questionId: resp.question_id,
        questionText: 'Unknown question',
        correctAnswer: null,
        studentAnswer: null,
        isCorrect: resp.is_correct,
        timeSpent: '0m 00s',
      };
    }
    // Determine correct answer text
    let correctDisplay: any = null;
    if (q.type === 'multiple_choice' || q.type === 'mcq') {
      const ca = q.correct_answer;
      let idx: number | null = null;
      if (typeof ca === 'number') idx = ca;
      else if (typeof ca === 'string') {
        if (/^\d+$/.test(ca)) idx = parseInt(ca, 10);
        else if (/^[A-Za-z]$/.test(ca)) idx = ca.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
      }
      const optTxt = getOptionText(q.options, idx ?? null);
      correctDisplay = optTxt ?? (typeof ca === 'string' ? ca : String(ca));
    } else if (q.type === 'true_false' || q.type === 'true_false') {
      const ca = q.correct_answer;
      if (ca === true || ca === 'true') correctDisplay = 'True';
      else if (ca === false || ca === 'false') correctDisplay = 'False';
      else correctDisplay = String(ca ?? '');
    } else {
      correctDisplay = q.correct_answer;
    }
    // Determine student answer text
    let studentDisplay: any = null;
    if (q.type === 'multiple_choice' || q.type === 'mcq') {
      const sa = resp.selected_option;
      let idx: number | null = null;
      if (typeof sa === 'number') idx = sa;
      else if (typeof sa === 'string') {
        if (/^\d+$/.test(sa)) idx = parseInt(sa, 10);
        else if (/^[A-Za-z]$/.test(sa)) idx = sa.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
      }
      const optTxt = getOptionText(q.options, idx ?? null);
      studentDisplay = optTxt ?? (typeof sa === 'string' ? sa : String(sa));
    } else if (q.type === 'true_false' || q.type === 'true_false') {
      const sa = resp.selected_option;
      if (sa === true || sa === 'true') studentDisplay = 'True';
      else if (sa === false || sa === 'false') studentDisplay = 'False';
      else studentDisplay = String(sa ?? '');
    } else {
      studentDisplay = resp.text_answer ?? '';
    }
    const secs = resp.time_spent_seconds != null ? Number(resp.time_spent_seconds) : 0;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    const timeSpent = `${mins}m ${rem.toString().padStart(2, '0')}s`;
    return {
      questionId: q.id,
      questionText: q.text,
      correctAnswer: correctDisplay,
      studentAnswer: studentDisplay,
      isCorrect: resp.is_correct,
      timeSpent: timeSpent,
    };
  });
};

// Delete a quiz and its associated questions
export const deleteQuiz = async (quizId: string) => {
  if (!quizId) throw new Error('Missing quiz id');

  // Ensure user is authenticated
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error('Not authenticated');

  // Soft delete the quiz by setting published = false. Restrict update to the
  // current user via user_id filter. If no matching row exists or the user
  // doesn't own the quiz, supabase will return an error via RLS.
  const { error } = await supabase
    .from('quizzes')
    .update({ published: false })
    .eq('id', quizId)
    .eq('user_id', auth.user.id);

  if (error) throw error;
  return true;
};

// Enhanced file processing for better text extraction
export const generateQuestionsFromFile = async (file: File, numQuestions: number, difficulty: string, questionTypes: string[]): Promise<QuizQuestion[]> => {
  try {
    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
    
    // Extract text from the file based on file type
    const text = await extractTextFromFile(file);
    
    if (!text || text.length < 50) {
      console.log('Insufficient text extracted, using demo questions');
      return generateDemoQuestions(numQuestions, difficulty, questionTypes);
    }
    
    console.log('Extracted text length:', text.length);
    console.log('Text preview:', text.substring(0, 200));
    
    // Determine file type for better processing
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    // Call the Groq-powered edge function
    const { data, error } = await supabase.functions.invoke('generate-quiz-groq', {
      body: {
        text: text,
        numQuestions: numQuestions,
        difficulty: difficulty,
        questionTypes: questionTypes.filter(type => type !== ''),
        fileType: fileExtension
      }
    });
    
    if (error) {
      console.error('Error calling quiz generation function:', error);
      throw error;
    }
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    console.log('Generated questions:', data.questions?.length || 0);
    
    // Ensure all questions have proper UUIDs
    const questionsWithUUIDs = (data.questions || []).map((question: any, index: number) => ({
      ...question,
      id: uuidv4(), // Generate proper UUID for each question
      order_position: index
    }));
    
    return questionsWithUUIDs;
    
  } catch (error) {
    console.error('Error generating questions from file:', error);
    // Fallback to demo implementation
    return generateDemoQuestions(numQuestions, difficulty, questionTypes);
  }
};

// Enhanced text extraction with proper file type handling
const extractTextFromFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        let text = '';
        
        if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
          // Handle text files
          text = reader.result as string;
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          // For PDF files, we need special handling
          // Since we can't parse PDF properly in browser, we'll send the file data
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to base64 for transmission
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          text = btoa(binary);
        } else if (file.name.toLowerCase().endsWith('.docx') || 
                   file.name.toLowerCase().endsWith('.pptx')) {
          // For Office documents, also send as binary data
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to base64 for transmission
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          text = btoa(binary);
        } else {
          // Default: try to read as text
          text = reader.result as string;
        }
        
        // For text files, validate content
        if ((file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) && text && text.length > 10) {
          resolve(text);
        } else if (text && text.length > 100) {
          // For binary files converted to base64, ensure we have substantial content
          resolve(text);
        } else {
          console.log('No readable text found in file or file too small');
          resolve('');
        }
      } catch (error) {
        console.error('Error processing file content:', error);
        resolve('');
      }
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
      reject(new Error('Failed to read file'));
    };
    
    // Read file based on type
    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      // For binary files (PDF, DOCX, PPTX), read as ArrayBuffer
      reader.readAsArrayBuffer(file);
    }
  });
};

// Fallback demo function with proper UUIDs
const generateDemoQuestions = async (numQuestions: number, difficulty: string, questionTypes: string[]): Promise<QuizQuestion[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const questions: QuizQuestion[] = [];
      
      const topics = [
        "Neural Networks", "Deep Learning", "Machine Learning", 
        "Artificial Intelligence", "Data Science", "Natural Language Processing",
        "Computer Vision", "Reinforcement Learning", "Statistical Analysis",
        "Big Data", "Quantum Computing", "Blockchain"
      ];
      
      for (let i = 0; i < numQuestions; i++) {
        const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        
        let question: QuizQuestion;
        
        if (type === 'multiple_choice') {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateQuestionText(topic, difficulty),
            type: 'multiple_choice',
            options: generateOptions(topic, difficulty),
            correct_answer: 'a',
            order_position: i
          };
        } else if (type === 'true_false') {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateTrueFalseQuestion(topic, difficulty),
            type: 'true_false',
            options: [
              { id: 'a', text: 'True' },
              { id: 'b', text: 'False' }
            ],
            correct_answer: Math.random() > 0.5 ? 'a' : 'b',
            order_position: i
          };
        } else {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateEssayQuestion(topic, difficulty),
            type: 'essay',
            options: [],
            order_position: i
          };
        }
        
        questions.push(question);
      }
      
      resolve(questions);
    }, 2000);
  });
};

// Helper function to generate question text
const generateQuestionText = (topic: string, difficulty: string): string => {
  const easyPrefixes = ["What is", "Define", "Explain", "Describe"];
  const mediumPrefixes = ["How does", "Compare and contrast", "Analyze"];
  const hardPrefixes = ["Critically evaluate", "Synthesize", "Hypothesize about"];
  
  let prefixes;
  switch (difficulty) {
    case 'easy':
      prefixes = easyPrefixes;
      break;
    case 'hard':
      prefixes = hardPrefixes;
      break;
    default:
      prefixes = mediumPrefixes;
  }
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${prefix} ${topic}?`;
};

// Helper function to generate true/false question
const generateTrueFalseQuestion = (topic: string, difficulty: string): string => {
  const statements = [
    `${topic} is a fundamental concept in computer science.`,
    `${topic} can only be implemented using Python.`,
    `${topic} has applications in healthcare.`,
    `${topic} requires specialized hardware.`,
    `${topic} was invented in the 1950s.`
  ];
  
  return statements[Math.floor(Math.random() * statements.length)];
};

// Helper function to generate essay question
const generateEssayQuestion = (topic: string, difficulty: string): string => {
  const templates = [
    `Explain the importance of ${topic} in modern technology.`,
    `Discuss the ethical implications of ${topic}.`,
    `How might ${topic} evolve over the next decade?`,
    `Compare the approaches to ${topic} in different industries.`,
    `What are the limitations of current ${topic} technologies?`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
};

// Helper function to generate options for multiple choice
const generateOptions = (topic: string, difficulty: string): any[] => {
  return [
    { id: 'a', text: `The primary framework for implementing ${topic}` },
    { id: 'b', text: `A methodology for analyzing ${topic} systems` },
    { id: 'c', text: `The process of optimizing ${topic} algorithms` },
    { id: 'd', text: `An application of ${topic} in real-world scenarios` }
  ];
};

// Save a quiz with its questions
export async function saveQuiz(
  quizMeta: {
    id: string;
    title: string;
    description?: string | null;
    published?: boolean;
    quiz_duration_seconds?: number | null;
    is_code_active?: boolean;
    is_rumbled?: boolean;
  },
  questions: Array<{
    id?: string; // may be local temp id for new questions
    text: string;
    type: 'mcq' | 'true_false' | 'short_answer' | string;
    order_position: number;
    options: any[] | null;
    correct_answer: any;
  }>
) {
  if (!quizMeta?.id) throw new Error('Missing quiz id');

  // 1) update quiz metadata
  const updatePayload: Record<string, any> = {
    title: quizMeta.title,
    description: quizMeta.description ?? null,
    published: quizMeta.published ?? true,
    updated_at: new Date().toISOString(),
  };
  if (quizMeta.quiz_duration_seconds !== undefined) {
    updatePayload.quiz_duration_seconds = quizMeta.quiz_duration_seconds ?? null;
  }
  if (quizMeta.is_code_active !== undefined) {
    updatePayload.is_code_active = !!quizMeta.is_code_active;
  }
  if (quizMeta.is_rumbled !== undefined) {
    updatePayload.is_rumbled = !!quizMeta.is_rumbled;
  }
  const { error: quizErr } = await supabase
    .from('quizzes')
    .update(updatePayload)
    .eq('id', quizMeta.id);
  if (quizErr) throw quizErr;

  // 2) fetch existing DB ids to compute deletions
  const { data: existingRows, error: existingErr } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('quiz_id', quizMeta.id);
  if (existingErr) throw existingErr;

  const existingIds = new Set((existingRows ?? []).map((r: any) => r.id));
  const incomingDbIds = new Set(
    (questions ?? [])
      .map((q) => (isUuid(q.id) ? (q.id as string) : null))
      .filter(Boolean) as string[]
  );
  const toDelete = [...existingIds].filter((id) => !incomingDbIds.has(id));

  // 3) normalize rows for DB, split into "existing" (with uuid) and "new" (without uuid)
  const normalize = (q: any) => {
    // keep DB values consistent
    let dbType = q.type;
    if (dbType === 'multiple_choice') dbType = 'mcq';
    const allowed = ['mcq', 'true_false', 'short_answer'];
    if (!allowed.includes(dbType)) dbType = 'mcq';

    let options = q.options;
    let correct = q.correct_answer;

    if (dbType === 'mcq') {
      options = Array.isArray(options) ? options : [];
      // correct stays as the chosen string
    } else if (dbType === 'true_false') {
      options = null;
      correct = typeof correct === 'string' ? correct.toLowerCase() === 'true' : !!correct;
    } else {
      options = null; // short_answer
      // correct stays as string
    }

    const base: any = {
      quiz_id: quizMeta.id,
      text: q.text ?? '',
      type: dbType,
      order_position: q.order_position ?? 0,
      options,
      correct_answer: correct,
    };
    if (isUuid(q.id)) base.id = q.id; // include id only for real DB rows
    return base;
  };

  const normalized = (questions ?? []).map(normalize);
  const existingUpserts = normalized.filter((r: any) => !!r.id);
  const newInserts = normalized.filter((r: any) => !r.id);

  // 4) upsert existing rows
  if (existingUpserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from('quiz_questions')
      .upsert(existingUpserts, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
  }

  // 5) insert new rows (omit id so DB generates)
  if (newInserts.length > 0) {
    const { error: insertErr } = await supabase
      .from('quiz_questions')
      .insert(newInserts);
    if (insertErr) throw insertErr;
  }

  // 6) delete removed rows (only DB ids)
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('quiz_questions')
      .delete()
      .in('id', toDelete);
    if (delErr) throw delErr;
  }

  return { id: quizMeta.id };
}

// Publish a quiz
export const publishQuiz = async (quizId: string) => {
  const invitationCode = generateInvitationCode();
  
  const { data, error } = await supabase
    .from('quizzes')
    .update({ published: true, invitation_code: invitationCode })
    .eq('id', quizId)
    .select()
    .single();
    
  if (error) {
    console.error("Error publishing quiz:", error);
    throw error;
  }
  
  return data;
};

// Generate a random invitation code
export const generateInvitationCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// -----------------------------------------------------------------------------
// Additional helpers for managing class sections on quizzes
//
// Many pages need to display or edit which class sections can take a quiz. The
// `quiz_sections` join table associates a quiz with zero or more `class_sections`
// via foreign keys. To avoid leaking raw join rows into components, the
// following helpers expose a higher-level API:
//   - `listAllClassSectionCodes()` fetches all section codes (e.g. "IT-32").
//   - `getQuizSectionCodes(quizId)` returns only the codes currently linked to
//     a specific quiz.
//   - `updateQuizSectionsByCodes(quizId, codes)` overwrites the quiz's
//     membership to exactly the provided codes (creating missing links and
//     removing stale ones).
//   - `getUserQuizzesWithSections()` returns the user's published quizzes with
//     a `section_codes: string[]` field so dashboards can display the target
//     sections.
//   - `getQuizWithSections(quizId)` returns a single quiz along with its
//     associated section codes.

export interface QuizWithSections extends Quiz {
  /** Codes of class_sections allowed to take this quiz, e.g. ["IT-32", "CS-21"]. */
  section_codes: string[];
}

/**
 * List all class sections (just id + code). Sorted ascending by code. Useful
 * when presenting a selection list (e.g. in quiz editor). If no sections exist,
 * returns an empty array.
 */
export const listAllClassSectionCodes = async (): Promise<{ id: string; code: string }[]> => {
  const { data, error } = await supabase
    .from('class_sections')
    .select('id, code')
    .order('code', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, code: String(r.code) }));
};

/**
 * Fetch the section codes currently linked to a quiz. Supabase row-level
 * security ensures the caller has access to the quiz; if not, this will
 * return an empty array. Undefined codes are filtered out.
 */
export const getQuizSectionCodes = async (quizId: string): Promise<string[]> => {
  if (!quizId) return [];
  // Get the list of section_ids for this quiz
  const { data: linkRows, error: linkErr } = await supabase
    .from('quiz_sections')
    .select('section_id')
    .eq('quiz_id', quizId);
  if (linkErr) throw linkErr;
  const sectionIds = (linkRows || []).map((r: any) => r.section_id);
  if (sectionIds.length === 0) return [];
  // Fetch the codes for those ids
  const { data: sections, error: csErr } = await supabase
    .from('class_sections')
    .select('id, code')
    .in('id', sectionIds);
  if (csErr) throw csErr;
  return (sections || [])
    .map((s: any) => String(s.code))
    .filter((c) => !!c);
};

/**
 * Overwrite the quiz's associated sections to exactly these codes. Any
 * previously linked sections not listed will be removed, and missing
 * associations will be created. Codes that don't exist in the database
 * are ignored. Operates in two phases: look up codes -> ids, then
 * compute diff between existing and new IDs, performing inserts/deletes.
 */
export const updateQuizSectionsByCodes = async (
  quizId: string,
  codes: string[]
): Promise<void> => {
  const uniqueCodes = Array.from(new Set((codes || []).map((c) => String(c))));
  // Look up the ids for the provided codes
  const { data: allSections, error: lookupErr } = await supabase
    .from('class_sections')
    .select('id, code')
    .in('code', uniqueCodes);
  if (lookupErr) throw lookupErr;
  const codeToId = new Map<string, string>();
  (allSections || []).forEach((r: any) => codeToId.set(String(r.code), r.id));
  const newIds: string[] = uniqueCodes
    .map((c) => codeToId.get(c))
    .filter((id): id is string => !!id);
  // Fetch existing associations
  const { data: existingRows, error: existErr } = await supabase
    .from('quiz_sections')
    .select('section_id')
    .eq('quiz_id', quizId);
  if (existErr) throw existErr;
  const existingIds = new Set((existingRows || []).map((r: any) => r.section_id));
  // Determine which ids to add and remove
  const toAdd = newIds.filter((id) => !existingIds.has(id));
  const toRemove = Array.from(existingIds).filter((id) => !newIds.includes(id));
  // Perform deletions first
  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from('quiz_sections')
      .delete()
      .eq('quiz_id', quizId)
      .in('section_id', toRemove);
    if (delErr) throw delErr;
  }
  // Perform inserts
  if (toAdd.length > 0) {
    const rows = toAdd.map((section_id) => ({ quiz_id: quizId, section_id }));
    const { error: insErr } = await supabase.from('quiz_sections').insert(rows);
    if (insErr) throw insErr;
  }
};

/**
 * Fetch the current user's published quizzes and attach the associated
 * section codes for each quiz. This lets dashboards show which sections
 * each quiz targets. The underlying query uses the `quiz_sections` and
 * `class_sections` tables; it filters on `published` just like
 * `getUserQuizzes`, so soft-deleted quizzes are excluded.
 */
export const getUserQuizzesWithSections = async (): Promise<QuizWithSections[]> => {
  // Ensure user is authenticated
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error('Not authenticated');
  // Fetch quizzes with nested join to quiz_sections -> class_sections
  const { data, error } = await supabase
    .from('quizzes')
    .select(
      `*, quiz_sections( section_id, class_sections!inner( code ) )`
    )
    .eq('user_id', auth.user.id)
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((quiz: any) => {
    const sections = quiz.quiz_sections || [];
    const codes = sections
      .map((qs: any) => qs.class_sections?.code)
      .filter((c: any) => !!c);
    // Remove the nested join from the returned object to avoid exposing
    // implementation details to components
    delete quiz.quiz_sections;
    return { ...(quiz as Quiz), section_codes: codes } as QuizWithSections;
  });
};

/**
 * Fetch a single quiz and include its associated section codes. Returns
 * `null` if the quiz does not exist or the user lacks access. This helper
 * is useful when editing a quiz so that the editor can pre-populate the
 * selected sections.
 */
export const getQuizWithSections = async (quizId: string): Promise<QuizWithSections | null> => {
  if (!quizId) return null;
  const { data, error } = await supabase
    .from('quizzes')
    .select(
      `*, quiz_sections( section_id, class_sections!inner( code ) )`
    )
    .eq('id', quizId)
    .single();
  if (error) {
    // If there is no data, supabase returns error code PGRST116; ignore and return null
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const codes = (data.quiz_sections || [])
    .map((qs: any) => qs.class_sections?.code)
    .filter((c: any) => !!c);
  delete data.quiz_sections;
  return { ...(data as Quiz), section_codes: codes } as QuizWithSections;
};

// Add/keep this alongside your other exports
export type QuestionStat = {
  questionId: string;
  text: string;
  correct: number;
  incorrect: number;
  avgTimeSeconds: number | null;
  difficulty?: string | null; // left for future use, we'll return null
};

// REPLACE your current getQuestionStats with this
export async function getQuestionStats(quizId: string, sectionId?: string): Promise<QuestionStat[]> {
  const { data, error } = await supabase.rpc("get_question_stats_rpc", {
    p_quiz_id: quizId,
    p_section_id: sectionId ?? null,
  });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    questionId: r.question_id,
    text: r.question_text,
    correct: r.correct ?? 0,
    incorrect: r.incorrect ?? 0,
    avgTimeSeconds: typeof r.avg_time_seconds === "number" ? r.avg_time_seconds : 0,
    difficulty: null,
  }));
}


/**
 * Always compute from analytics_student_performance so the
 * distribution matches the table rows (and respects section filter).
 */
export type ScoreBuckets = { excellent: number; good: number; average: number; poor: number };

function bucketize(vPct: number): keyof ScoreBuckets {
  if (vPct >= 90) return "excellent";
  if (vPct >= 75) return "good";
  if (vPct >= 60) return "average";
  return "poor";
}

export async function getScoreBuckets(quizId: string, sectionId?: string): Promise<ScoreBuckets> {
  // Count items for this quiz
  const { count: totalQuestions, error: cntErr } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);
  if (cntErr) throw cntErr;

  const tq = totalQuestions || 0;

  // Pull scores
  let q = supabase.from("analytics_student_performance").select("score").eq("quiz_id", quizId);
  if (sectionId) q = q.eq("section_id", sectionId);
  const { data: rows, error } = await q;
  if (error) throw error;

  const buckets: ScoreBuckets = { excellent: 0, good: 0, average: 0, poor: 0 };
  for (const r of rows || []) {
    const s = parseFloat(String(r.score));
    if (!Number.isFinite(s)) continue;

    // Detect raw vs percent
    let pct =
      tq && s <= tq
        ? (s / tq) * 100
        : s <= 100
        ? s
        : NaN;

    if (!Number.isFinite(pct)) continue;
    pct = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));

    buckets[bucketize(pct)]++;
  }
  return buckets;
}

// --- Average % score for a quiz across ALL sections ---
// Uses analytics_student_performance + quiz_questions count.
// Works whether ASP.score is "raw correct" or already a percent.
export async function getQuizAverageScore(quizId: string): Promise<number> {
  // Count items for this quiz
  const { count: totalQuestions, error: cntErr } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);
  if (cntErr) throw cntErr;
  const tq = totalQuestions || 0;

  // Pull all student scores for this quiz (all sections)
  const { data: rows, error } = await supabase
    .from("analytics_student_performance")
    .select("score")
    .eq("quiz_id", quizId);
  if (error) throw error;

  if (!rows || rows.length === 0) return 0;

  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const raw = parseFloat(String((r as any).score));
    if (!Number.isFinite(raw)) continue;

    // Convert to percent if raw looks like "correct items"
    const pct =
      tq && raw <= tq ? (raw / tq) * 100 :
      raw <= 100 ? raw : 0;

    sum += pct;
    n++;
  }
  return n ? Math.round((sum / n) * 100) / 100 : 0;
}