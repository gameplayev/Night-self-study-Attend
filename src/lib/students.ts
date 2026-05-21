export const STUDENT_NUMBER_LENGTH = 5;
export const STUDENT_NUMBER_PATTERN = /^\d{5}$/;

export function normalizeStudentNumberInput(value: string) {
  return value.replace(/\D/g, '').slice(0, STUDENT_NUMBER_LENGTH);
}

export function parseStudentNumber(studentNumber: string) {
  if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) return null;
  return {
    grade: Number(studentNumber[0]),
    classNumber: Number(studentNumber.slice(1, 3)),
  };
}

export function formatParsedStudentClass(studentNumber: string) {
  const parsed = parseStudentNumber(studentNumber);
  if (!parsed) return null;
  return `${parsed.grade}학년 ${parsed.classNumber}반`;
}
