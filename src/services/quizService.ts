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

/** Utility: seconds -> "Xm Ys" */
function secsToText(total?: number | null) {
  if (!Number.isFinite(Number(total))) return "—";
  const s = Number(total);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

async function getQuestionCount(quizId: string): Promise<number> {
  // Try quizzes.question_no first
  const { data: qz, error: qe } = await supabase
    .from("quizzes")
    .select("question_no")
    .eq("id", quizId)
    .single();
  if (!qe && qz?.question_no) return Number(qz.question_no);

  // Fallback: count quiz_questions
  const { count } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);
  return Number(count ?? 0);
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


/** Get quiz row + ordered questions (no RPC) */
export async function getQuizWithQuestions(quizId: string) {
  const { data: quiz, error: qErr } = await supabase
    .from('quizzes')
    .select('id, title, question_no, published, quiz_duration_seconds, is_code_active, is_rumbled')
    .eq('id', quizId)
    .single();
  if (qErr) throw qErr;
  if (!quiz) return null;

  const { data: questions, error: qqErr } = await supabase
    .from('quiz_questions')
    //          ⬇⬇⬇ add 'options' here
    .select('id, text, type, options, correct_answer, order_position')
    .eq('quiz_id', quizId)
    .order('order_position', { ascending: true });
  if (qqErr) throw qqErr;

  // normalize options to string[] so the dropdown sees choices
  // normalize options to string[] for mcq/true_false; null for others
  const normalized = (questions ?? []).map((q: any) => {
    const type = q.type;
    if (type === 'mcq' || type === 'multiple_choice' || type === 'true_false') {
      return {
        ...q,
        options: Array.isArray(q.options)
          ? q.options
            .map((o: any) =>
              typeof o === 'string' ? o : (o?.text ?? o?.label ?? o?.value ?? '')
            )
            .filter(Boolean)
          : [],
      };
    } else {
      // identification, essay, short_answer - no options
      return { ...q, options: null };
    }
  });

  return { ...quiz, questions: normalized };
}

/** Sections linked to a quiz (via quiz_sections -> class_sections) */
export async function getQuizEligibleSections(quizId: string) {
  const { data: links, error: lErr } = await supabase
    .from("quiz_sections")
    .select("section_id")
    .eq("quiz_id", quizId);

  if (lErr) throw lErr;
  const secIds = Array.from(new Set((links ?? []).map((r: any) => r.section_id))).filter(Boolean);
  if (!secIds.length) return [];

  const { data: secs, error: sErr } = await supabase
    .from("class_sections")
    .select("id, code")
    .in("id", secIds);

  if (sErr) throw sErr;
  return (secs ?? []).map((s: any) => ({ id: s.id as string, code: String(s.code) }));
}

/** Aggregate quiz analytics from analytics_student_performance */
export async function getQuizAnalytics(quizId: string, sectionId?: string) {
  const qCount = await getQuestionCount(quizId);

  let q = supabase
    .from("analytics_student_performance")
    .select("score, student_name_norm, section_id")
    .eq("quiz_id", quizId);
  if (sectionId) q = q.eq("section_id", sectionId);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const key = (r: any) => `${String(r.student_name_norm ?? "").trim()}|${String(r.section_id ?? "")}`;
  const distinct = new Set(rows.map(key));

  const avgRaw =
    rows.length ? rows.reduce((a, r) => a + Number(r.score ?? 0), 0) / rows.length : 0;
  const avgPct = qCount ? (avgRaw / qCount) * 100 : 0;

  return {
    averageScore: Math.max(0, Math.min(100, avgPct)), // percent 0–100
    studentsCompleted: rows.length,
    totalStudents: distinct.size,
  };
}


/** List students (rows in analytics_student_performance) */
export async function getStudentPerformanceList(quizId: string, sectionId?: string) {
  const qCount = await getQuestionCount(quizId);

  let q = supabase
    .from("analytics_student_performance")
    .select("id, student_name, score, completion_time_seconds, created_at, section_id")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (sectionId) q = q.eq("section_id", sectionId);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  return rows.map((r) => {
    const raw = Number(r.score ?? 0);
    const pct = qCount ? (raw / qCount) * 100 : 0;
    return {
      id: r.id as string,
      student_name: r.student_name as string,
      score: Math.max(0, Math.min(100, Math.round(pct))), // percent for UI
      completedAt: r.created_at ? String(r.created_at) : null,
      timeSpent: secsToText(r.completion_time_seconds),
    };
  });
}

/** Student details (answers) composed from quiz_responses + quiz_questions */
export async function getStudentPerformanceDetails(perfId: string) {
  const { data: resp, error: rErr } = await supabase
    .from("quiz_responses")
    .select("question_id, is_correct, time_spent_seconds, selected_option, text_answer, quiz_id")
    .eq("student_perf_id", perfId);

  if (rErr) throw rErr;
  const responses = (resp ?? []) as any[];
  if (!responses.length) return [];

  const qids = Array.from(new Set(responses.map((r) => r.question_id))).filter(Boolean);
  const quizId = responses[0]?.quiz_id as string | undefined;

  const { data: questions, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id, text, type, correct_answer")
    .in("id", qids);
  if (qErr) throw qErr;

  const qMap = new Map(questions?.map((q: any) => [q.id, q]) ?? []);
  const out = responses.map((r) => {
    const q = qMap.get(r.question_id) || {};
    const type = String(q.type ?? "").toLowerCase();
    const correct = q.correct_answer;

    // ✅ FIX: Properly extract student answer based on type
    let studentAnswer = "";

    if (type === "identification" || type === "short_answer" || type === "essay") {
      // ✅ Use text_answer for these types
      studentAnswer = String(r.text_answer ?? "");
    } else {
      // MCQ/TF: use selected_option (jsonb)
      studentAnswer = (r.selected_option === null || r.selected_option === undefined)
        ? ""
        : String(r.selected_option);
      // Strip outer quotes if it's a JSON scalar string
      if (/^".*"$/.test(studentAnswer)) {
        studentAnswer = studentAnswer.slice(1, -1);
      }
    }

    // ✅ Format correct answer for display
    let correctAnswerDisplay = "";
    if (type === "multiple_choice" || type === "mcq") {
      correctAnswerDisplay = typeof correct === "string" ? correct : JSON.stringify(correct);
    } else if (type === "true_false") {
      correctAnswerDisplay = correct === true ? "True" : "False";
    } else {
      correctAnswerDisplay = typeof correct === "string" ? correct : JSON.stringify(correct);
    }

    return {
      questionText: String(q.text ?? ""),
      isCorrect: !!r.is_correct,
      timeSpent: secsToText(r.time_spent_seconds),
      correctAnswer: correctAnswerDisplay,
      studentAnswer, // ✅ Now correctly populated
      quizId,
    };
  });

  return out;
}

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
    const allowed = ['mcq', 'true_false', 'short_answer', 'identification', 'essay'];
    if (!allowed.includes(dbType)) dbType = 'mcq';

    let options = q.options;
    let correct = q.correct_answer;

    if (dbType === 'mcq') {
      options = Array.isArray(options) ? options : [];
      // correct stays as the chosen string
    } else if (dbType === 'true_false') {
      options = null;
      correct = typeof correct === 'string' ? correct.toLowerCase() === 'true' : !!correct;
    } else if (dbType === 'identification') {
      options = null;
      correct = correct ?? '';
    } else if (dbType === 'essay') {
      options = null;
      correct = correct ?? '';
    } else {
      options = null; // short_answer or default
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
  difficulty?: string | null;
  questionType?: string;
};

/** Per-question stats computed client side (no RPC) */
export async function getQuestionStats(quizId: string, sectionId?: string) {
  // 1) questions (now also fetching `type`)
  const { data: questions, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id, text, order_position, type")
    .eq("quiz_id", quizId)
    .order("order_position", { ascending: true });
  if (qErr) throw qErr;
  const qList = (questions ?? []) as any[];
  if (!qList.length) return [];

  // 2) responses
  let qr = supabase
    .from("quiz_responses")
    .select("question_id, is_correct, time_spent_seconds, section_id")
    .eq("quiz_id", quizId);
  if (sectionId) qr = qr.eq("section_id", sectionId);
  const { data: resp, error: rErr } = await qr;
  if (rErr) throw rErr;
  const rows = (resp ?? []) as any[];

  // 3) aggregate
  type Agg = { correct: number; incorrect: number; tSum: number; tN: number };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    const k = r.question_id as string;
    const a = agg.get(k) ?? { correct: 0, incorrect: 0, tSum: 0, tN: 0 };
    if (r.is_correct) a.correct++; else a.incorrect++;
    if (Number.isFinite(Number(r.time_spent_seconds))) {
      a.tSum += Number(r.time_spent_seconds);
      a.tN++;
    }
    agg.set(k, a);
  }

  const labelDifficulty = (pctCorrect: number, avgTime: number) => {
    let label =
      pctCorrect >= 80 ? "Easy" :
        pctCorrect >= 60 ? "Moderate" :
          pctCorrect >= 40 ? "Hard" : "Very Hard";
    if (avgTime >= 45 && pctCorrect < 50) label = label === "Hard" ? "Very Hard" : label;
    else if (avgTime <= 20 && pctCorrect >= 70) label = label === "Moderate" ? "Easy" : label;
    return label;
  };

  const prettyType = (t: string | null | undefined) => {
    const v = String(t ?? "").toLowerCase();
    if (["mcq", "multiple_choice", "multiple-choice", "multiple choice"].includes(v)) return "MCQ";
    if (["true_false", "true/false", "truefalse", "tf", "true-false"].includes(v)) return "True/False";
    if (["short_answer", "short answer", "sa"].includes(v)) return "Short Answer";
    return "—";
  };

  return qList.map((q) => {
    const a = agg.get(q.id) ?? { correct: 0, incorrect: 0, tSum: 0, tN: 0 };
    const total = a.correct + a.incorrect;
    const pct = total ? (a.correct / total) * 100 : 0;
    const avgTime = a.tN ? a.tSum / a.tN : 0;

    return {
      questionId: q.id as string,
      text: String(q.text ?? ""),
      questionType: prettyType(q.type),                 // ← NEW
      correct: a.correct,
      incorrect: a.incorrect,
      avgTimeSeconds: Math.round(avgTime * 100) / 100,
      difficulty: labelDifficulty(pct, avgTime),
    };
  });
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
export async function deleteStudentSubmission(perfId: string) {
  const { data, error } = await supabase
    .rpc("rpc_delete_quiz_attempt", { p_perf_id: perfId });

  if (error) return { ok: false, message: error.message };

  const counts = Array.isArray(data) && data[0]
    ? data[0]
    : { responses_deleted: 0, performance_deleted: 0 };

  const ok = Number(counts.performance_deleted) === 1;
  return ok
    ? { ok: true, counts }
    : { ok: false, message: "No matching attempt found or blocked by policy.", counts };
}