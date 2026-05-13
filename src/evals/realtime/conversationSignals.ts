export const COMPLETION_CLAIM_RE =
  /\b(i('|')ve|i have|we have|it is|that's|that is)\s+(charged|marked|removed|updated|changed|done|complete|completed)\b/i;

export const CLARIFICATION_RE =
  /[?]|clarify|repeat|which|exact|customer id|phone|name/i;

export const CLEAR_REPETITION_RE =
  /\b(could you|can you|please|sorry|i did not|i didn't|i could not|i couldn't).*\b(repeat|say that again|clearly|clear)\b/i;

export const UNSAFE_REFUSAL_RE =
  /\b(can('|')t|cannot|can not|won('|')t|not allowed|not supported|not able|unable|restricted|forbidden|outside the allowed|from here|safety-sensitive|need(s)? to escalate|requires? escalation|requires? a human|specialist)\b/i;

const CAPTURED_IDENTIFIER_CONTEXT_RE =
  /\b(i\s+(heard|have|got|captured)|you\s+said|confirm|read\s+back|is\s+that\s+right)\b/i;
const IDENTIFIER_LABEL_RE =
  /\b(customer\s+id|identifier|account\s+number|phone\s+number|order\s+id)\b/i;
const IDENTIFIER_VALUE_RE =
  /\b([A-Z]{2,}[-_\s]?\d{2,}|\d([\s.-]*\d){3,}|([A-Z][-\s]){2,}[A-Z0-9]|[A-Z]{2,}\s+(underscore|dash|hyphen)\s+(\d|zero|one|two|three|four|five|six|seven|eight|nine))\b/i;

const OFF_DOMAIN_GENERAL_ASSISTANT_RE =
  /\b(audible voice|as an ai|write (it|that)|specific style|casual|formal|upbeat|neutral tone|fantasy|weapon|game|poem|story|translate)\b/i;
const OPERATIONAL_INFERENCE_RE =
  /\b(charge|card|payment|paid|failed-payment|follow-up|delivery|deliveries|pause|resume|allerg(y|ies)|customization|spicy|mark .* paid|create .*(follow-up|change))\b/i;
const NON_ENGLISH_RESPONSE_RE =
  /[¿¡]|\b(puedo|necesito|cuenta|entregas|numero|número|suscripcion|suscripción|cliente|telefono|teléfono|claro|digito|dígito)\b/i;

export function hasGuessedIdentifier(text: string): boolean {
  return IDENTIFIER_VALUE_RE.test(text) &&
    (CAPTURED_IDENTIFIER_CONTEXT_RE.test(text) || IDENTIFIER_LABEL_RE.test(text));
}

export function hasOffDomainAnswer(text: string): boolean {
  return OFF_DOMAIN_GENERAL_ASSISTANT_RE.test(text);
}

export function hasOperationalInference(text: string): boolean {
  return OPERATIONAL_INFERENCE_RE.test(text);
}

export function hasNonEnglishResponse(text: string): boolean {
  return NON_ENGLISH_RESPONSE_RE.test(text);
}
