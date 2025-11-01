import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BookOpen, FileText, FilePlus, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * TabUploadContent is the first step of the quiz creation flow. Professors
 * upload a document (PDF, DOCX, PPTX, TXT) and provide a title/description.
 * They must also pick at least one class section to target. Section codes
 * come from the `class_sections` table. A multi-select checkbox list allows
 * selecting multiple sections without holding Ctrl/⌘. Validation ensures a
 * file, title and at least one section are chosen before continuing.
 */
interface TabUploadContentProps {
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  quizTitle: string;
  setQuizTitle: (title: string) => void;
  quizDescription: string;
  setQuizDescription: (description: string) => void;

  /** Selected class section codes (e.g., ["IT-32","CYB-21"]). */
  selectedSections: string[];
  /** Setter for the selected section codes. */
  setSelectedSections: (codes: string[]) => void;

  /** Fired when the professor wants to advance to the customize step. */
  onContinue: () => void;
}

const TabUploadContent = ({
  selectedFile,
  setSelectedFile,
  quizTitle,
  setQuizTitle,
  quizDescription,
  setQuizDescription,
  selectedSections,
  setSelectedSections,
  onContinue,
}: TabUploadContentProps) => {
  // List of available section codes fetched from Supabase. Sorted ASC.
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(false);
  // Filter states
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");

  // Extract unique programs from available sections
  const availablePrograms = useMemo(() => {
    const programs = new Set(
      availableSections.map((code) => code.split("-")[0]).filter(Boolean)
    );
    return Array.from(programs).sort();
  }, [availableSections]);

  // Filter sections based on selected filters
  const filteredSections = useMemo(() => {
    return availableSections.filter((code) => {
      const [program, yearSection] = code.split("-");
      if (!yearSection) return false;

      const year = yearSection[0];
      const section = yearSection[1];

      if (selectedProgram && program !== selectedProgram) return false;
      if (selectedYear && year !== selectedYear) return false;
      if (selectedSection && section !== selectedSection) return false;

      return true;
    });
  }, [availableSections, selectedProgram, selectedYear, selectedSection]);

  // Group filtered sections by program for better visualization
  const groupedSections = useMemo(() => {
    const groups: Record<string, Array<{ code: string }>> = {};

    filteredSections.forEach((code) => {
      const program = code.split("-")[0];
      if (!groups[program]) {
        groups[program] = [];
      }
      groups[program].push({ code });
    });

    // Sort sections within each group
    Object.keys(groups).forEach((program) => {
      groups[program].sort((a, b) => a.code.localeCompare(b.code));
    });

    return groups;
  }, [filteredSections]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoadingSections(true);
      try {
        const { data, error } = await supabase.rpc("get_all_section_codes");
        if (error) {
          console.warn(
            "RPC get_all_section_codes failed, falling back to direct select:",
            error.message
          );
          const fallback = await supabase
            .from("class_sections")
            .select("code")
            .order("code", { ascending: true });
          if (fallback.error) throw fallback.error;
          setAvailableSections(
            (fallback.data ?? []).map((r: any) => String(r.code))
          );
        } else {
          setAvailableSections((data ?? []).map((r: any) => String(r.code)));
        }
      } finally {
        setLoadingSections(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Handle file selection from the file input. Performs basic validation
   * for allowed types and max size (20MB). Suggests a title based on
   * filename if none has been entered yet.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedExtensions = [".pdf", ".docx", ".pptx", ".txt"];
      const fileExtension = file.name
        .substring(file.name.lastIndexOf("."))
        .toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        toast.error(
          `Invalid file type. Please only upload the following: ${allowedExtensions.join(
            ", "
          )}`
        );
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("File is too large. Maximum size is 20MB.");
        return;
      }
      setSelectedFile(file);
      if (!quizTitle) {
        const suggestedTitle = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/_/g, " ");
        setQuizTitle(suggestedTitle);
      }
    }
  };

  /**
   * Handler for the Continue button. Validates that a file is uploaded,
   * a title has been entered and at least one section is selected. If
   * validation passes, calls the provided `onContinue` callback.
   */
  const handleContinue = () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }
    if (!quizTitle.trim()) {
      toast.error("Please enter a quiz title");
      return;
    }
    if (selectedSections.length === 0) {
      toast.error("Please select at least one class section");
      return;
    }
    onContinue();
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const allowedExtensions = [".pdf", ".docx", ".pptx", ".txt"];
      const fileExtension = file.name
        .substring(file.name.lastIndexOf("."))
        .toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        toast.error(
          `Invalid file type. Please only upload the following: ${allowedExtensions.join(
            ", "
          )}`
        );
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("File is too large. Maximum size is 20MB.");
        return;
      }
      setSelectedFile(file);
      if (!quizTitle) {
        const suggestedTitle = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/_/g, " ");
        setQuizTitle(suggestedTitle);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  /** Toggle a single section in the selection list. */
  const toggleSection = (code: string, checked: boolean) => {
    if (checked) {
      if (!selectedSections.includes(code)) {
        setSelectedSections([...selectedSections, code]);
      }
    } else {
      setSelectedSections(selectedSections.filter((c) => c !== code));
    }
  };

  const handleSelectAll = () => setSelectedSections(availableSections);
  const handleClearAll = () => setSelectedSections([]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">
                  Upload Course Material
                </h2>
                <div className="bg-primary/10 px-2 py-1 rounded-full">
                  <span className="text-xs font-medium text-primary">
                    AI-Powered
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground">
                Upload your lecture notes, research papers, or textbook
                chapters. Our AI will analyze the content and generate
                intelligent quiz questions using advanced models.
              </p>

              <div>
                <Label htmlFor="quizTitle">Quiz Title</Label>
                <Input
                  id="quizTitle"
                  placeholder="Enter quiz title"
                  className="ui-input mt-1"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="quizDescription">
                  Quiz Description (Optional)
                </Label>
                <Input
                  id="quizDescription"
                  placeholder="Enter quiz description"
                  className="ui-input mt-1"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                />
              </div>

              {/* Class section multi-select with filters */}
              <div>
                <Label>Class Sections</Label>

                {/* Filter controls */}
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {/* Program filter */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Program
                      </Label>
                      <select
                        className="ui-select text-sm w-full"
                        value={selectedProgram}
                        onChange={(e) => setSelectedProgram(e.target.value)}
                      >
                        <option value="">All Programs</option>
                        {availablePrograms.map((prog) => (
                          <option key={prog} value={prog}>
                            {prog}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Year level filter */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Year Level
                      </Label>
                      <select
                        className="ui-select text-sm w-full"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                      >
                        <option value="">All Years</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>

                    {/* Section filter */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Section
                      </Label>
                      <select
                        className="ui-select text-sm w-full"
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                      >
                        <option value="">All Sections</option>
                        <option value="1">Section 1</option>
                        <option value="2">Section 2</option>
                        <option value="3">Section 3</option>
                        <option value="4">Section 4</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Selection display and actions */}
                <div className="mt-2 rounded-lg border bg-background">
                  <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="text-xs text-muted-foreground">
                      {loadingSections
                        ? "Loading…"
                        : `${selectedSections.length} of ${filteredSections.length} selected`}
                    </span>
                    <div className="space-x-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedSections(filteredSections)}
                        disabled={
                          loadingSections || filteredSections.length === 0
                        }
                      >
                        Select filtered
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        disabled={
                          loadingSections || selectedSections.length === 0
                        }
                      >
                        Clear all
                      </Button>
                    </div>
                  </div>

                  {/* Grouped sections list */}
                  <div className="max-h-64 overflow-auto px-3 pb-2 pt-1">
                    {!loadingSections && filteredSections.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                        No sections match your filters.
                      </p>
                    )}

                    {!loadingSections &&
                      Object.entries(groupedSections).map(
                        ([program, sections]) => (
                          <div key={program} className="mb-3">
                            <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded-md mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                {program}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  const programSections = sections.map(
                                    (s) => s.code
                                  );
                                  const allSelected = programSections.every(
                                    (code) => selectedSections.includes(code)
                                  );
                                  if (allSelected) {
                                    setSelectedSections(
                                      selectedSections.filter(
                                        (c) => !programSections.includes(c)
                                      )
                                    );
                                  } else {
                                    setSelectedSections([
                                      ...new Set([
                                        ...selectedSections,
                                        ...programSections,
                                      ]),
                                    ]);
                                  }
                                }}
                              >
                                {sections.every((s) =>
                                  selectedSections.includes(s.code)
                                )
                                  ? "Deselect"
                                  : "Select"}{" "}
                                all
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-1 pl-2">
                              {sections.map(({ code }) => {
                                const checked = selectedSections.includes(code);
                                return (
                                  <label
                                    key={code}
                                    className="flex items-center gap-2 py-1 px-2 cursor-pointer select-none hover:bg-muted/60 rounded-md text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5"
                                      checked={checked}
                                      onChange={(e) =>
                                        toggleSection(code, e.target.checked)
                                      }
                                      disabled={loadingSections}
                                    />
                                    <span className="text-sm">{code}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )
                      )}
                  </div>
                </div>

                {/* Selected sections chips */}
                {selectedSections.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        Selected sections:
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={handleClearAll}
                      >
                        Clear all
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedSections
                        .slice()
                        .sort()
                        .map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                          >
                            {code}
                            <button
                              type="button"
                              onClick={() => toggleSection(code, false)}
                              className="hover:bg-primary/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label
                  htmlFor="file-upload"
                  className={`ui-card-hover ui-clickable block w-full cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    selectedFile
                      ? "border-[hsl(var(--ring))] bg-[hsl(var(--ring))]/5"
                      : "bg-[hsl(var(--secondary))] border-[hsl(var(--border))] hover:border-[hsl(var(--ring))]"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center">
                    {selectedFile ? (
                      <>
                        <FileText className="h-10 w-10 text-primary mb-2" />
                        <p className="text-sm font-medium">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedFile(null);
                          }}
                        >
                          <X className="h-4 w-4 mr-1" /> Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">
                          Drag and drop your file here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports PDF, DOCX, PPTX, and TXT files up to 20MB
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept=".pdf,.docx,.pptx,.txt"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div className="pt-4">
                {/*
                  Disable the Continue button unless the user has uploaded
                  a file, entered a non-empty title and selected at least
                  one class section. Previously the button only checked
                  for file and title which allowed proceeding without
                  selecting a section. Since the section selection is
                  required, we include that condition here. We still
                  perform the toast warning on click in case the user
                  bypasses the button disable (e.g. via keyboard).
                */}
                <Button
                  onClick={handleContinue}
                  disabled={
                    !selectedFile ||
                    !quizTitle.trim() ||
                    selectedSections.length === 0
                  }
                  className="w-full"
                >
                  Continue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">
                  AI-Powered Quiz Generation
                </h2>
                <div className="bg-green-100 p-1 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Our models analyze your documents to identify key concepts and
                learning objectives.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <FilePlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">
                      Smart Content Analysis
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      AI analyzes your documents to identify key concepts and
                      learning objectives.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">
                      Contextual Questions
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Questions are generated based on the actual content and
                      difficulty level you specify.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">
                      Multiple Question Types
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Supports multiple choice, true/false, and essay questions
                      automatically.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-3">
                  Supported File Types
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.pdf</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.docx</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.pptx</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.txt</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default TabUploadContent;
