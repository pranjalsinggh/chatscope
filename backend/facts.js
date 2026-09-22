// ------------------------------------------------
// PER-PERSON FACT EXTRACTION (Gemini)
// ------------------------------------------------
// Reads the full conversation and asks Gemini to surface the
// 5 most interesting, chat-grounded facts about each participant
// (birthdays, places, milestones, hobbies, memorable moments).
// Returns strict JSON: { "<Person>": [{ category, fact, evidence }] }
// ------------------------------------------------

const MAX_TRANSCRIPT_CHARS = 150000;

const { callGeminiWithRetry } = require("./geminiRetry");

const FACT_CATEGORIES = [
  "birthday",
  "place",
  "milestone",
  "work",
  "hobby",
  "food",
  "relationship",
  "personality",
  "funny",
  "other",
];

function cleanMessageText(message) {
  return String(message || "")
    .replace(/\s+/g, " ")
    .trim();
}

// Chronological transcript. Very large chats are evenly downsampled
// (every Nth message) to stay inside a safe context budget.
function buildTranscript(messages) {
  const lines = messages
    .map(
      (m) =>
        `[${m.date} ${m.time}] ${m.sender}: ${cleanMessageText(m.message)}`
    )
    .filter((line) => !line.endsWith(": "));

  const totalChars = lines.join("\n").length;

  if (totalChars <= MAX_TRANSCRIPT_CHARS) {
    return lines.join("\n");
  }

  const stride = Math.ceil(totalChars / MAX_TRANSCRIPT_CHARS);

  return lines.filter((_, index) => index % stride === 0).join("\n");
}

function parseFactsJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeFacts(parsed, participants) {
  const result = {};

  const rawFacts =
    parsed && typeof parsed === "object" && parsed.facts
      ? parsed.facts
      : parsed;

  if (!rawFacts || typeof rawFacts !== "object") {
    return null;
  }

  for (const person of participants) {
    // Match Gemini's key case-insensitively to the real participant name
    const matchedKey = Object.keys(rawFacts).find(
      (key) =>
        key.toLowerCase().trim() === person.toLowerCase().trim()
    );

    const personFacts = matchedKey ? rawFacts[matchedKey] : null;

    if (!Array.isArray(personFacts)) {
      result[person] = [];
      continue;
    }

    result[person] = personFacts
      .map((item) => {
        if (!item || typeof item !== "object") return null;

        const fact = cleanMessageText(item.fact || item.text);
        if (!fact) return null;

        const category = String(item.category || "other")
          .toLowerCase()
          .trim();

        return {
          category: FACT_CATEGORIES.includes(category)
            ? category
            : "other",
          fact: fact.slice(0, 220),
          evidence: cleanMessageText(item.evidence || "").slice(0, 140),
        };
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  return result;
}

async function extractFacts(ai, model, messages, participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("No participants found in the chat.");
  }

  const transcript = buildTranscript(messages);

  const prompt = `You extract the most interesting PERSONAL FACTS about each participant from a WhatsApp conversation.

Return ONLY valid JSON, nothing else:
{"facts":{"Person Name":[{"category":"birthday","fact":"...","evidence":"short quote"}]}}

RULES:
1. Exactly 5 facts per participant, the 5 most important and interesting ones. If the conversation truly reveals fewer than 5 supported facts for someone, return only what is supported.
2. Every fact MUST be grounded in the conversation. NEVER invent anything.
3. Prioritize in this order: birthdays & ages, places visited / planned / lived in, milestones & achievements, work & studies, hobbies & interests, food preferences, relationships & friendships, personality traits, funny or memorable moments.
4. "category" must be one of: birthday, place, milestone, work, hobby, food, relationship, personality, funny, other
5. "evidence" is a short verbatim quote (max 15 words) from the chat that supports the fact. If the fact comes from a pattern across many messages, use a representative short quote.
6. Write each fact in third person, concise (max 25 words), specific and interesting. No generic filler like "they chat a lot".
7. Use exactly these participant names as JSON keys: ${participants.join(", ")}
8. You understand Hinglish / Roman Hindi, translate the meaning into clear English facts, but keep quotes verbatim.
9. Never use em dashes or en dashes anywhere in fact text or evidence quotes. Use only commas or full stops.
10. If the conversation mentions someone's birthday, an exam result, a trip, a new job, a favorite food, etc., that is exactly the kind of fact to surface.

CONVERSATION (chronological):
${transcript}`;

  const text = await callGeminiWithRetry(ai, model, prompt, {
    maxAttempts: 4,
    label: "Facts extraction",
  });

  const parsed = parseFactsJson(text);

  if (!parsed) {
    throw new Error("Could not parse the facts response.");
  }

  const facts = normalizeFacts(parsed, participants);

  if (!facts) {
    throw new Error("Facts response had an unexpected shape.");
  }

  return facts;
}

module.exports = { extractFacts };
