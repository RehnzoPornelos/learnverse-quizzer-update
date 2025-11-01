import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { QuizQuestion } from "@/services/quizService";

interface TabPreviewContentProps {
  quizTitle: string;
  onBack: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  onQuestionsUpdated: (questions: QuizQuestion[]) => void;
  initialQuestions?: QuizQuestion[];
  initialDurationSeconds?: number;
  onDurationUpdated?: (seconds: number) => void;
  hideHeaderActions?: boolean;
  hideSetupControls?: boolean; // hide Timer + Randomize block
}

const TabPreviewContent = ({
  quizTitle,
  onBack,
  onPublish,
  isPublishing,
  onQuestionsUpdated,
  initialQuestions = [],
  initialDurationSeconds,
  onDurationUpdated,
  hideHeaderActions = false,
  hideSetupControls = false, // default
}: TabPreviewContentProps) => {
  /** Questions shown to professor (never shuffled in Preview). */
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  /** Randomize preference (persist only; do NOT reorder here). */
  const [randomizeEnabled, setRandomizeEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("randomize_questions") !== "false";
    }
    return true;
  });

  /** Timer state */
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [durationMinutesStr, setDurationMinutesStr] = useState("");

  /** Avoid persisting timer to localStorage before hydration is done. */
  const hydratedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  /** ---- Hydrate from inputs/localStorage (ONCE) ---- */
  useEffect(() => {
    if (hasInitialized) return;

    // normalize incoming questions; keep original order
    const normalized = initialQuestions.map((q: any, index) => {
      const id = q.id || `question-${Date.now()}-${index}`;
      const type = q.type;
      const base: any = { ...q, id, type };

      if (type === "mcq") {
        base.choices = Array.isArray(q.choices) ? q.choices : ["", "", "", ""];
        if (q.answer != null) {
          const ansRaw = String(q.answer).trim();
          let normalizedAns = "";

          const numericIndex = parseInt(ansRaw, 10);
          if (!isNaN(numericIndex)) {
            const idx = numericIndex - 1;
            if (idx >= 0 && idx < base.choices.length)
              normalizedAns = base.choices[idx];
          }
          if (!normalizedAns) {
            const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(
              ansRaw.toUpperCase()
            );
            if (alpha >= 0 && alpha < base.choices.length)
              normalizedAns = base.choices[alpha];
          }
          if (!normalizedAns) {
            const found = base.choices.find(
              (c: string) => c.trim().toLowerCase() === ansRaw.toLowerCase()
            );
            if (found) normalizedAns = found;
          }
          base.answer = normalizedAns || ansRaw;
        }
      } else if (type === "true_false") {
        if (typeof q.answer === "boolean")
          base.answer = q.answer ? "True" : "False";
        else base.answer = q.answer ?? "True";
        delete base.choices;
      } else if (type === "identification") {
        base.answer = q.answer ?? "";
        delete base.choices;
      } else if (type === "essay") {
        base.answer = q.answer ?? "";
        delete base.choices;
      } else {
        // short_answer or any other type
        base.answer = q.answer ?? "";
        delete base.choices;
      }

      return base;
    });

    setQuestions(normalized);
    onQuestionsUpdated(normalized);

    // ----- Timer hydration -----
    let enabled: boolean | null = null;
    let seconds: number | null = null;

    if (typeof window !== "undefined") {
      const flag = localStorage.getItem("quiz_timer_enabled");
      if (flag === "true") enabled = true;
      else if (flag === "false") enabled = false;

      const stored = localStorage.getItem("quiz_duration_seconds");
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) seconds = parsed;
      }
    }

    if (enabled === null && typeof initialDurationSeconds === "number") {
      if (initialDurationSeconds > 0) {
        enabled = true;
        seconds = initialDurationSeconds;
      } else {
        enabled = false;
        seconds = null;
      }
    }

    if (enabled && seconds && seconds > 0) {
      setTimerEnabled(true);
      setDurationMinutesStr(String(Math.ceil(seconds / 60)));
    } else {
      setTimerEnabled(false);
      setDurationMinutesStr("");
    }

    hydratedRef.current = true;
    setHasInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialized, initialQuestions, initialDurationSeconds]);

  /** Persist timer to localStorage AFTER hydration and reflect up to parent. */
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === "undefined") return;

    const minutes = Math.max(0, parseInt(durationMinutesStr || "0", 10) || 0);
    if (timerEnabled && minutes > 0) {
      localStorage.setItem("quiz_timer_enabled", "true");
      localStorage.setItem("quiz_duration_seconds", String(minutes * 60));
      onDurationUpdated?.(minutes * 60);
    } else {
      localStorage.setItem("quiz_timer_enabled", "false");
      localStorage.removeItem("quiz_duration_seconds");
      onDurationUpdated?.(0);
    }
  }, [timerEnabled, durationMinutesStr, onDurationUpdated]);

  /** Toggle randomize: store only; do NOT reorder preview list. */
  const handleRandomizeToggle = (val: boolean) => {
    setRandomizeEnabled(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("randomize_questions", val ? "true" : "false");
    }
  };

  /** Helpers for editing questions in-place */
  const updateQuestions = (next: QuizQuestion[]) => {
    setQuestions(next);
    onQuestionsUpdated(next);
  };

  const handleTypeChange = (idx: number, newType: string) => {
    const next = questions.map((q, i) => {
      if (i !== idx) return q;
      const base: any = { ...q, type: newType as any };
      if (newType === "mcq") {
        base.choices = Array.isArray((q as any).choices)
          ? (q as any).choices
          : ["", "", "", ""];
        base.answer = base.answer ?? "";
      } else if (newType === "true_false") {
        base.answer = base.answer === "False" ? "False" : "True";
        delete base.choices;
      } else {
        base.answer = base.answer ?? "";
        delete base.choices;
      }
      return base as QuizQuestion;
    });
    updateQuestions(next);
  };

  const handleFieldChange = (
    idx: number,
    field: "question" | "answer",
    value: string
  ) => {
    const next = questions.map((q, i) =>
      i === idx ? ({ ...q, [field]: value } as QuizQuestion) : q
    );
    updateQuestions(next);
  };

  const handleChoiceChange = (qIdx: number, cIdx: number, value: string) => {
    const next = questions.map((q, i) => {
      if (i !== qIdx) return q;
      const choices = Array.isArray((q as any).choices)
        ? ([...(q as any).choices] as string[])
        : ["", "", "", ""];
      choices[cIdx] = value;
      return { ...(q as any), choices } as QuizQuestion;
    });
    updateQuestions(next);
  };

  const handleDelete = (idx: number) => {
    const next = questions.filter((_, i) => i !== idx);
    updateQuestions(next);
  };

  const handleAdd = () => {
    const newQ: any = {
      id: `q-${Date.now()}`,
      type: "mcq",
      question: "",
      choices: ["", "", "", ""],
      answer: "",
    };
    const next = [...questions, newQ];
    updateQuestions(next);
    setTimeout(
      () =>
        listRef.current?.scrollTo({
          top: listRef.current.scrollHeight,
          behavior: "smooth",
        }),
      50
    );
  };

  const handlePublishClick = () => {
    if (timerEnabled) {
      const minutes = parseInt(durationMinutesStr || "0", 10) || 0;
      if (minutes <= 0) {
        toast.error(
          "Please enter a positive duration in minutes or turn off “Add Timer”."
        );
        return;
      }
    }
    onQuestionsUpdated(questions);
    onPublish();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{quizTitle}</h2>
          <p className="text-muted-foreground mt-1">
            Review and edit your quiz
          </p>
        </div>
        {!hideHeaderActions && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handlePublishClick} disabled={isPublishing}>
              {isPublishing ? "Publishing..." : "Publish Quiz"}
            </Button>
          </div>
        )}
      </div>

      {/* Hide this whole setup section (and its separators) when requested */}
      {!hideSetupControls && (
        <>
          <Separator />

          {/* Timer + Randomize preference (no shuffling here) */}
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="quiz-timer" className="text-sm cursor-pointer">
                  Add Timer
                </Label>
                <p className="text-muted-foreground text-xs">
                  Set a time limit for completing the quiz
                </p>
              </div>
              <Switch
                id="quiz-timer"
                checked={timerEnabled}
                onCheckedChange={(val: boolean) => {
                  setTimerEnabled(val);
                  if (
                    val &&
                    (durationMinutesStr === "0" || durationMinutesStr === "")
                  )
                    setDurationMinutesStr("");
                }}
              />
            </div>

            {timerEnabled && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="ui-input w-24"
                  value={durationMinutesStr}
                  onChange={(e) => {
                    const cleaned = e.target.value
                      .replace(/[^0-9]/g, "")
                      .replace(/^0+(?=\d)/, "");
                    setDurationMinutesStr(cleaned);
                  }}
                  onBlur={() => {
                    const cleaned = (durationMinutesStr || "").replace(
                      /^0+(?=\d)/,
                      ""
                    );
                    setDurationMinutesStr(cleaned);
                  }}
                  placeholder="Minutes"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            )}

            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="quiz-randomize"
                  className="text-sm cursor-pointer"
                >
                  Randomize Questions
                </Label>
                <p className="text-muted-foreground text-xs">
                  Preference only — preview order stays the same
                </p>
              </div>
              <Switch
                id="quiz-randomize"
                checked={randomizeEnabled}
                onCheckedChange={handleRandomizeToggle}
              />
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Questions list (kept in the same order) */}
      <div ref={listRef} className="space-y-4 max-h-[500px] overflow-auto pr-2">
        {questions.map((q, index) => (
          <Card key={q.id || index} className="border rounded-md">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Question {index + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(index)}
                >
                  Delete
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <Label className="text-sm">Type</Label>
                  <select
                    className="ui-select mt-1 text-sm"
                    value={q.type as any}
                    onChange={(e) => handleTypeChange(index, e.target.value)}
                  >
                    <option value="mcq">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="identification">Identification</option>
                    <option value="essay">Essay</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm">Question</Label>
                  <Input
                    className="ui-input mt-1"
                    value={(q as any).question ?? ""}
                    onChange={(e) =>
                      handleFieldChange(index, "question", e.target.value)
                    }
                    placeholder="Enter question text"
                  />
                </div>

                {q.type === "mcq" && (
                  <div className="space-y-2">
                    <Label className="text-sm">Choices</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {((q as any).choices || ["", "", "", ""]).map(
                        (choice: string, cIndex: number) => (
                          <Input
                            key={cIndex}
                            value={choice}
                            onChange={(e) =>
                              handleChoiceChange(index, cIndex, e.target.value)
                            }
                            placeholder={`Choice ${String.fromCharCode(
                              65 + cIndex
                            )}`}
                            className="ui-input"
                          />
                        )
                      )}
                    </div>

                    <div className="mt-2">
                      <Label className="text-sm">Correct Answer</Label>
                      <select
                        className="ui-select mt-1 text-sm"
                        value={(q as any).answer ?? ""}
                        onChange={(e) =>
                          handleFieldChange(index, "answer", e.target.value)
                        }
                      >
                        <option value="">Select answer</option>
                        {((q as any).choices || []).map(
                          (choice: string, cIndex: number) => (
                            <option key={cIndex} value={choice}>
                              {choice}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                )}

                {q.type === "true_false" && (
                  <div className="mt-2">
                    <Label className="text-sm">Answer</Label>
                    <select
                      className="ui-select mt-1 text-sm"
                      value={(q as any).answer ?? ""}
                      onChange={(e) =>
                        handleFieldChange(index, "answer", e.target.value)
                      }
                    >
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </select>
                  </div>
                )}

                {q.type === "short_answer" && (
                  <div className="mt-2">
                    <Label className="text-sm">Answer</Label>
                    <Input
                      className="ui-input mt-1"
                      value={(q as any).answer ?? ""}
                      onChange={(e) =>
                        handleFieldChange(index, "answer", e.target.value)
                      }
                      placeholder="Enter answer"
                    />
                  </div>
                )}

                {q.type === "identification" && (
                  <div className="mt-2">
                    <Label className="text-sm">Answer</Label>
                    <Input
                      className="ui-input mt-1"
                      value={(q as any).answer ?? ""}
                      onChange={(e) =>
                        handleFieldChange(index, "answer", e.target.value)
                      }
                      placeholder="Enter the term or concept"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter a specific term, name, or concept (1-5 words)
                    </p>
                  </div>
                )}

                {q.type === "essay" && (
                  <div className="mt-2">
                    <Label className="text-sm">Model Answer</Label>
                    <textarea
                      className="ui-input mt-1 min-h-[100px] resize-y"
                      value={(q as any).answer ?? ""}
                      onChange={(e) =>
                        handleFieldChange(index, "answer", e.target.value)
                      }
                      placeholder="Enter a comprehensive model answer (2-4 sentences)"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="pt-2">
        <Button variant="outline" onClick={handleAdd} className="w-full">
          Add Question
        </Button>
      </div>
    </div>
  );
};

export default TabPreviewContent;
