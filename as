 README.md                                          |  15 [31m-[m
 backend/.env                                       |   2 [32m+[m
 backend/__pycache__/main.cpython-312.pyc           | Bin [31m5439[m -> [32m5434[m bytes
 backend/__pycache__/utils.cpython-312.pyc          | Bin [31m2181[m -> [32m2184[m bytes
 backend/main.py                                    |   2 [32m+[m[31m-[m
 backend/requirements.txt                           |   8 [32m+[m[31m-[m
 src/App.tsx                                        |   5 [32m+[m
 src/components/dashboard/ProfessorDashboard.tsx    |  96 [32m++++[m[31m--[m
 src/components/home/Hero.tsx                       |  13 [31m-[m
 src/components/quiz/QuizGenerator.tsx              | 118 [32m++++++[m[31m-[m
 src/components/quiz/TabCustomizeContent.tsx        | 112 [32m++++++[m[31m-[m
 src/components/quiz/TabPreviewContent.tsx          | 370 [32m+++++++++++++++++++[m[31m--[m
 src/components/quiz/TabUploadContent.tsx           |  75 [32m++[m[31m---[m
 src/context/AuthContext.tsx                        |  22 [32m+[m[31m-[m
 src/integrations/supabase/types.ts                 |  73 [32m++[m[31m--[m
 src/pages/ForgotPassword.tsx                       | 137 [32m++++++++[m
 src/pages/Generator.tsx                            |  50 [32m+[m[31m--[m
 src/pages/QuizEdit.tsx                             |  70 [32m+++[m[31m-[m
 src/pages/ResetPassword.tsx                        | 143 [32m++++++++[m
 src/pages/StudentJoin.tsx                          |  38 [32m++[m[31m-[m
 src/services/quizService.ts                        | 264 [32m++++++++++[m[31m-----[m
 supabase/config.toml                               |  51 [32m++[m[31m-[m
 .../functions/generate-quiz-from-text/index.ts     | 341 [32m+++++++++++++++++++[m
 supabase/functions/generate-quiz-groq/index.ts     | 244 [32m++++++++++++++[m
 ...012457_00c911ea-5e87-43be-8318-589aa700dfb1.sql |   5 [32m+[m
 25 files changed, 1905 insertions(+), 349 deletions(-)
