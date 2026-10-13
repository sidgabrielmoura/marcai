// Validate supported questionnaire answers again on the server. Optional fields
// may be omitted; false and zero must not be mistaken for a missing response.
export function validateFormAnswers(fields: Array<{ id: string; type: string; question?: string; label?: string; required?: boolean; options?: string[] }>, answers?: Record<string, unknown>): string | null {
  for (const field of fields) {
    const answer = answers?.[field.id];
    const missing = answer === undefined || answer === null || answer === "" || typeof answer === "string" && !answer.trim();
    const label = field.question || field.label || "Pergunta";
    if (missing) { if (field.required) return "A pergunta “" + label + "” é obrigatória."; continue; }
    if (field.type === "MULTIPLE_CHOICE" && (typeof answer !== "string" || !field.options?.includes(answer))) return "Escolha uma alternativa válida para “" + label + "”.";
    if (field.type === "BOOLEAN" && typeof answer !== "boolean") return "Responda Sim ou Não em “" + label + "”.";
    if (field.type === "RATING" && (typeof answer !== "number" || !Number.isInteger(answer) || answer < 1 || answer > 5)) return "A avaliação de “" + label + "” deve estar entre 1 e 5.";
    if (["SHORT_TEXT", "LONG_TEXT"].includes(field.type) && (typeof answer !== "string" || answer.length > 5000)) return "Revise o texto da resposta em “" + label + "”.";
  }
  return null;
}
