// constants/curriculum.ts

export const EXAM_TYPES = [
  "Revision Materials",
  "Topical Exams",
  "Mid-Term Exams",
  "End-Term Exams",
  "Opener Exams",
  "Mock Exams",
  "Weekly Exams",
  "Schemes of Work",
  "Lesson Plans",
  "Lesson Notes",
  "Mnemonic Songs",
  "Math Formulae",
] as const;

export type ExamType = typeof EXAM_TYPES[number];

export const GRADES_BY_CURRICULUM: Record<string, string[]> = {
  CBE: [
    "PP1", "PP2",
    "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
    "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10",
    "Grade 11", "Grade 12",
  ],
  "8-4-4": ["Form 1", "Form 2", "Form 3", "Form 4"],
};

export const ALL_GRADES = [
  "Playgroup", "PP1", "PP2",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
  "Form 1", "Form 2", "Form 3", "Form 4",
];

export const CURRICULA = Object.keys(GRADES_BY_CURRICULUM);

export const TERMS = ["Term 1", "Term 2", "Term 3"];

export const MAX_PDF_MB = 25;
export const MAX_ZIP_MB = 80;