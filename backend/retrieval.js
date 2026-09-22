/**
 * ----------------------------------------------------------------------------
 * CHATSCOPE - NEXT-GENERATION SELF-IMPROVING RETRIEVAL ENGINE (v2)
 * ----------------------------------------------------------------------------
 * Architecture:
 * 1.  Corpus Fingerprinting & Inverted Indexing (O(1) retrieval, chat isolation)
 * 2.  Robust Query Normalization & Multilingual Chat Tokenizer
 * 3.  Conservative Stop-Word Handling (preserving sentiment, modal, action terms)
 * 4.  Dynamic Entity & Participant Discovery (zero hard-coded names or topics)
 * 5.  Probabilistic Query Intent Classification
 * 6.  Corpus-Derived Concept Expansion (Stemming + Co-occurrence + Learned associations)
 * 7.  Pronoun Resolution & Adaptive Retrieval Memory (retrieval_memory.json)
 * 8.  Multi-Signal Scoring:
 *     - Okapi BM25 Lexical Relevance with Document Length Normalization
 *     - Exact N-gram & Quoted Phrase Scoring
 *     - Morphological Stem Relevance
 *     - Dynamic Co-occurrence Concept Boost
 *     - LEARNED association boost (memory-driven, improves over time)
 *     - Sender Relevance & Third-Person Discussion Boost
 *     - Token Proximity Signals
 *     - Character Trigram Similarity (typo/OOV resilient)
 *     - Length-Constrained Fuzzy Distance (Levenshtein)
 *     - Message Quality & Noise Penalties
 * 9.  Polarity & Negation Detection
 * 10. Conversational Context Expansion & Question -> Answer Thread Stitching
 *     (including short affirmative/negative answer detection)
 * 11. Multi-Pass Adaptive Retrieval (strict -> relaxed -> fuzzy fallback:
 *     ALWAYS returns the best available evidence for any question)
 * 12. Calibrated Answerability Confidence (score-gap aware) & Diagnostics
 * 13. Explicit Feedback Learning API (recordFeedback) - engine improves with use
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const DEFAULT_LIMIT = 30;
const MAX_MEMORY_ENTRIES = 200;
const MIN_TOKEN_LENGTH = 2;
const MEMORY_VERSION = 2;

// Learning weights (mutated by feedback over time -> engine improves with use)
const LEARNED_WEIGHTS = {
  phrase: 1.0,
  bm25: 1.0,
  stem: 1.0,
  concept: 1.0,
  sender: 1.0,
  proximity: 1.0,
  fuzzy: 1.0,
  learnedAssociation: 1.0
};

// ============================================================================
// CONSERVATIVE STOP WORDS
// ============================================================================

const CONSERVATIVE_STOP_WORDS = new Set([
  "a", "an", "the",
  "of", "at", "by", "in", "on", "to", "from", "with", "into", "onto",
  "is", "are", "was", "were", "am", "be", "been", "being",
  "and", "or", "so", "than", "then",
  "u", "ur", "r", "pls", "plz"
]);

const PRONOUN_SET = new Set([
  "i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves", "u", "ur",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "they", "them", "their", "theirs", "themselves",
  "it", "its", "itself",
  "this", "that", "these", "those", "someone", "anyone", "everyone", "somebody", "anybody", "everybody",
  "main", "mera", "meri", "mere", "mujhe", "mujhko",
  "hum", "humara", "humari", "humare",
  "tu", "tera", "teri", "tere", "tujhe",
  "tum", "tumhara", "tumhari", "tumhare", "tumhe",
  "aap", "aapka", "aapki", "aapke", "apko",
  "yeh", "ye", "woh", "wo", "unka", "unki", "unke", "unhe", "unko", "inka", "inki", "inke", "inhe", "inko"
]);

const INTERROGATIVES = new Set([
  "what", "when", "where", "why", "who", "which", "how",
  "kya", "kab", "kahan", "kyun", "kyu", "kaise", "kon", "kaun", "kisne", "kisko"
]);

const STRUCTURAL_FILLERS = new Set([
  "say", "said", "saying", "tell", "told", "telling", "ask", "asked", "asking",
  "about", "mention", "mentioned", "talk", "talked", "talking", "discuss", "discussed",
  "thing", "things", "mean", "meaning", "give", "show", "find", "get", "got", "know", "knew"
]);

const NEGATION_MARKERS = new Set([
  "not", "n't", "no", "never", "none", "neither", "nor", "hardly", "barely",
  "nahi", "nhi", "nai", "ni", "nhn", "mat", "na"
]);

// Short affirmative / negative answers used for Q->A stitching
const AFFIRMATIVE_ANSWERS = new Set([
  "yes", "yeah", "yup", "yep", "haan", "han", "haa", "haanji", "ok", "okay",
  "sure", "obviously", "bilkul", "sahi", "right", "correct", "true", "hmm", "exactly", "absolutely", "ofcourse"
]);

const NEGATIVE_ANSWERS = new Set([
  "no", "nope", "nahi", "nhi", "nai", "nah", "never", "galat", "wrong", "false", "nahita", "not"
]);

const CHAT_CANONICAL_MAP = new Map([
  ["nhi", "nahi"], ["nai", "nahi"], ["ni", "nahi"], ["nhn", "nahi"], ["na", "nahi"],
  ["hn", "haan"], ["han", "haan"], ["haa", "haan"], ["haanji", "haan"],
  ["yea", "yes"], ["yeah", "yes"], ["yup", "yes"], ["yep", "yes"],
  ["h", "hai"], ["hain", "hai"],
  ["pta", "pata"], ["bta", "bata"], ["btao", "bata"],
  ["kr", "kar"], ["kro", "kar"], ["krna", "kar"], ["karna", "kar"],
  ["krta", "kar"], ["karta", "kar"], ["krti", "kar"], ["karti", "kar"],
  ["kyu", "kyun"], ["kyon", "kyun"],
  ["kaha", "kahan"], ["kahaan", "kahan"],
  ["mje", "mujhe"], ["mjhe", "mujhe"],
  ["mra", "mera"], ["mri", "meri"],
  ["tme", "tumhe"], ["tmhara", "tumhara"],
  ["mtlb", "matlab"],
  ["acha", "accha"], ["achha", "accha"],
  ["thik", "theek"], ["thk", "theek"],
  ["bcz", "because"], ["bcuz", "because"], ["coz", "because"], ["cuz", "because"],
  ["abt", "about"],
  ["fav", "favorite"], ["favourite", "favorite"], ["favrt", "favorite"],
  ["msg", "message"], ["txt", "message"],
  ["pic", "photo"], ["pics", "photo"],
  ["thx", "thanks"], ["tysm", "thanks"], ["ty", "thanks"],
  ["idk", "unknown"], ["tbh", "honestly"], ["rn", "now"]
]);

const CONTRACTION_EXPANSIONS = [
  [/\bcan't\b/gi, "cannot"],
  [/\bwon't\b/gi, "will not"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bhadn't\b/gi, "had not"],
  [/\bi'm\b/gi, "i am"],
  [/\byou're\b/gi, "you are"],
  [/\bthey're\b/gi, "you are"],
  [/\bwe're\b/gi, "we are"],
  [/\bit's\b/gi, "it is"]
];

// ============================================================================
// TEXT NORMALIZATION & TOKENIZATION
// ============================================================================

function normalizeText(text) {
  if (!text) return "";
  let str = String(text)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/['’]/g, "'");

  for (const [regex, replacement] of CONTRACTION_EXPANSIONS) {
    str = str.replace(regex, replacement);
  }

  str = str.replace(/(.)\1{2,}/gu, "$1$1");
  return str.trim();
}

function tokenize(text) {
  const norm = normalizeText(text).toLowerCase();
  if (!norm) return [];
  const matches = norm.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu);
  return matches || [];
}

function canonicalizeToken(token) {
  if (!token) return "";
  const cleaned = token.toLowerCase();
  return CHAT_CANONICAL_MAP.get(cleaned) || cleaned;
}

function getMeaningfulTokens(text) {
  return tokenize(text)
    .map(canonicalizeToken)
    .filter(t => t.length >= MIN_TOKEN_LENGTH && !CONSERVATIVE_STOP_WORDS.has(t));
}

// ============================================================================
// MORPHOLOGICAL STEMMING
// ============================================================================

const IRREGULAR_VERB_MAP = new Map([
  ["went", "go"], ["gone", "go"], ["goes", "go"], ["going", "go"],
  ["ate", "eat"], ["eaten", "eat"], ["eating", "eat"], ["eats", "eat"],
  ["bought", "buy"], ["buying", "buy"], ["buys", "buy"],
  ["saw", "see"], ["seen", "see"], ["seeing", "see"], ["sees", "see"],
  ["heard", "hear"], ["hearing", "hear"], ["hears", "hear"],
  ["sent", "send"], ["sending", "send"], ["sends", "send"],
  ["made", "make"], ["making", "make"], ["makes", "make"],
  ["ran", "run"], ["running", "run"], ["runs", "run"],
  ["wrote", "write"], ["written", "write"], ["writing", "write"], ["writes", "write"],
  ["read", "read"], ["reading", "read"], ["reads", "read"],
  ["spoke", "speak"], ["spoken", "speak"], ["speaking", "speak"], ["speaks", "speak"],
  ["talked", "talk"], ["talking", "talk"], ["talks", "talk"],
  ["liked", "like"], ["liking", "like"], ["likes", "like"],
  ["loved", "love"], ["loving", "love"], ["loves", "love"],
  ["hated", "hate"], ["hating", "hate"], ["hates", "hate"],
  ["cooked", "cook"], ["cooking", "cook"], ["cooks", "cook"],
  ["baked", "bake"], ["baking", "bake"], ["bakes", "bake"],
  ["travelled", "travel"], ["traveled", "travel"], ["traveling", "travel"], ["travels", "travel"],
  ["played", "play"], ["playing", "play"], ["plays", "play"],
  ["watched", "watch"], ["watching", "watch"], ["watches", "watch"],
  ["listened", "listen"], ["listening", "listen"], ["listens", "listen"],
  ["argued", "argue"], ["arguing", "argue"], ["argues", "argue"]
]);

function stemToken(token) {
  if (!token || token.length <= 3) return token;
  const lower = token.toLowerCase();

  if (IRREGULAR_VERB_MAP.has(lower)) {
    return IRREGULAR_VERB_MAP.get(lower);
  }

  let stem = lower;
  if (stem.endsWith("ing") && stem.length > 5) {
    stem = stem.slice(0, -3);
    if (stem.endsWith("mm") || stem.endsWith("nn") || stem.endsWith("tt") || stem.endsWith("pp")) {
      stem = stem.slice(0, -1);
    }
  } else if (stem.endsWith("ed") && stem.length > 4) {
    stem = stem.slice(0, -2);
    if (stem.endsWith("i")) stem = stem.slice(0, -1) + "y";
  } else if (stem.endsWith("es") && stem.length > 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith("s") && !stem.endsWith("ss") && stem.length > 3) {
    stem = stem.slice(0, -1);
  } else if (stem.endsWith("tion") && stem.length > 6) {
    stem = stem.slice(0, -4);
  } else if (stem.endsWith("ly") && stem.length > 4) {
    stem = stem.slice(0, -2);
  }

  return stem.length >= 2 ? stem : lower;
}

// ============================================================================
// FUZZY MATCHING (LEVENSHTEIN + CHARACTER TRIGRAM SIMILARITY)
// ============================================================================

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const aLen = a.length;
  const bLen = b.length;
  const prev = new Array(bLen + 1);
  const curr = new Array(bLen + 1);

  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    const aChar = a[i - 1];
    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
  }

  return prev[bLen];
}

function fuzzyTokenMatch(target, candidate) {
  if (target === candidate) return 1.0;
  const maxLen = Math.max(target.length, candidate.length);
  if (maxLen === 0) return 1.0;

  if (target.length < 4 || candidate.length < 4) {
    return target === candidate ? 1.0 : 0.0;
  }

  const allowedEdits = maxLen <= 5 ? 1 : 2;
  // Cheap length-difference bailout BEFORE the O(len^2) distance table:
  // on large chats this skips the vast majority of candidate pairs.
  if (Math.abs(target.length - candidate.length) > allowedEdits) return 0;

  const dist = levenshteinDistance(target, candidate);
  if (dist > allowedEdits) return 0;

  const ratio = 1 - dist / maxLen;
  return ratio >= 0.80 ? ratio : 0;
}

/**
 * Character trigram similarity (Dice coefficient).
 * Robust for typos, transliteration variants, and partially-matching words.
 */
function trigramsOf(str) {
  const s = `  ${str} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}

function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const g of ta) {
    if (tb.has(g)) overlap++;
  }
  return (2 * overlap) / (ta.size + tb.size);
}

/**
 * Combined fuzzy similarity: Levenshtein OR trigram (whichever is stronger).
 */
function softTokenSimilarity(target, candidate) {
  if (target === candidate) return 1.0;
  const lev = fuzzyTokenMatch(target, candidate);
  if (lev > 0) return lev;
  // Trigram fallback for longer tokens (>= 5 chars)
  if (target.length >= 5 && candidate.length >= 5) {
    const tri = trigramSimilarity(target, candidate);
    return tri >= 0.55 ? tri * 0.9 : 0;
  }
  return 0;
}

// ============================================================================
// N-GRAM GENERATION
// ============================================================================

function generateNgrams(tokens, size) {
  if (!Array.isArray(tokens) || tokens.length < size) return [];
  const ngrams = [];
  for (let i = 0; i <= tokens.length - size; i++) {
    ngrams.push(tokens.slice(i, i + size).join(" "));
  }
  return ngrams;
}

// ============================================================================
// PERSISTENT SELF-IMPROVING MEMORY
// ============================================================================
// Memory schema v2:
// {
//   version: 2,
//   queries: [ { question, normalized, tokens, stems, resolvedSenders, entities,
//                dominantIntent, confidence, timestamp } ],
//   termAssociations: { [term]: { [relatedTerm]: weight } },  // learned co-occurrence
//   senderAffinity:   { [term]: { [sender]: weight } },       // term->person links
//   feedbackStats:    { [normalizedQuery]: { up: n, down: n, adjusted: bool } }
// }
// ============================================================================

// One memory store per isolation scope (session), RAM-only. Learning
// from one chat can never contaminate another session's retrieval.
const memoryStores = new Map();

/**
 * Drop corpus-scoped learnings (term associations, sender affinity) if the
 * supplied fingerprint belongs to a different conversation than the one
 * that produced them. Query history and feedback stats are strategy
 * signals and are kept.
 */
function ensureCorpusScoping(memory, fingerprint) {
  if (!fingerprint || memory.corpusFingerprint === fingerprint) return memory;
  memory.corpusFingerprint = fingerprint;
  memory.termAssociations = {};
  memory.senderAffinity = {};
  return memory;
}

function defaultMemory() {
  return {
    version: MEMORY_VERSION,
    corpusFingerprint: null,
    queries: [],
    termAssociations: {},
    senderAffinity: {},
    feedbackStats: {}
  };
}

/**
 * Load this scope's learning memory. PRIVACY MODEL: RAM only — question
 * text and learned associations are never written to disk, and each
 * session's memory dies with its session.
 */
function loadRetrievalMemory(scope = "global") {
  let memory = memoryStores.get(scope);
  if (!memory) {
    memory = defaultMemory();
    memoryStores.set(scope, memory);
  }
  return memory;
}

function saveRetrievalMemory(memory, scope = "global") {
  if (memory.queries.length > MAX_MEMORY_ENTRIES) {
    memory.queries = memory.queries.slice(-MAX_MEMORY_ENTRIES);
  }
  memoryStores.set(scope, memory);
}

/**
 * Drop one scope's learning memory — called when a session is evicted
 * or idles out so RAM usage cannot grow with the number of sessions.
 */
function disposeRetrievalMemory(scope) {
  memoryStores.delete(scope);
}

/**
 * Reinforce a learned association between two terms (bounded growth).
 */
function reinforceAssociation(memory, termA, termB, delta = 0.1, max = 2.0) {
  if (!termA || !termB || termA === termB) return;
  if (PRONOUN_SET.has(termA) || PRONOUN_SET.has(termB)) return;
  if (termA.length < 3 || termB.length < 3) return;

  if (!memory.termAssociations[termA]) memory.termAssociations[termA] = {};
  const assoc = memory.termAssociations[termA];
  assoc[termB] = Math.min(max, (assoc[termB] || 0) + delta);
}

/**
 * Reinforce term -> sender affinity (who talks about what).
 */
function reinforceSenderAffinity(memory, term, sender, delta = 0.08, max = 2.0) {
  if (!term || !sender || term.length < 3) return;
  if (!memory.senderAffinity[term]) memory.senderAffinity[term] = {};
  const aff = memory.senderAffinity[term];
  aff[sender] = Math.min(max, (aff[sender] || 0) + delta);
}

/**
 * Learn co-occurrence associations between the query terms and the terms
 * found in evidence that satisfied the query. Over time, the engine builds
 * a private semantic map of THIS user's conversations.
 */
function learnFromEvidence(memory, queryInfo, evidenceMessages) {
  if (!Array.isArray(evidenceMessages)) return;
  const queryTerms = (queryInfo.topicTokens || []).filter(t => t.length >= 3);

  for (const msg of evidenceMessages) {
    const msgTokens = getMeaningfulTokens(msg.message || "");
    const msgStems = Array.from(new Set(msgTokens.map(stemToken)));
    const sender = String(msg.sender || "").trim();

    for (const qTerm of queryTerms) {
      const qStem = stemToken(qTerm);
      // Link query terms to evidence terms (capped per message for stability)
      let linked = 0;
      for (const mStem of msgStems) {
        if (mStem === qStem) continue;
        if (linked >= 5) break;
        reinforceAssociation(memory, qStem, mStem, 0.06);
        linked++;
      }
      if (sender) {
        reinforceSenderAffinity(memory, qStem, sender);
      }
    }
  }
}

function resolvePronounFromMemory(queryInfo, memory) {
  if (!queryInfo.hasPronoun) return null;

  const recent = (memory.queries || []).slice(-5).reverse();
  for (const entry of recent) {
    if (entry.resolvedSenders && entry.resolvedSenders.length > 0) {
      return entry.resolvedSenders[0];
    }
    if (entry.entities && entry.entities.length > 0) {
      return entry.entities[0];
    }
  }
  return null;
}

/**
 * Look up learned associations for the query stems, returning related terms
 * with their learned weights (only genuinely strong associations).
 */
function getLearnedAssociations(queryInfo, memory, excludeSet) {
  const learned = new Map();
  if (!memory || !memory.termAssociations) return learned;

  for (const stem of queryInfo.topicStems || queryInfo.uniqueStems) {
    const assoc = memory.termAssociations[stem];
    if (!assoc) continue;
    for (const [term, weight] of Object.entries(assoc)) {
      if (excludeSet.has(term)) continue;
      if (weight >= 0.4) {
        const existing = learned.get(term) || 0;
        if (weight > existing) learned.set(term, weight);
      }
    }
  }
  return learned;
}

/**
 * EXPLICIT FEEDBACK API.
 * Call with the question and thumbs up/down to tune future scoring.
 * Positive feedback reinforces the weighting profile; negative feedback
 * triggers a broader retrieval profile on the next similar query.
 */
function recordFeedback(question, isPositive, retrievedMessages = [], scope = "global") {
  if (!question || typeof question !== "string") return false;
  try {
    const memory = loadRetrievalMemory(scope);
    const normalized = normalizeText(question).toLowerCase();

    if (!memory.feedbackStats[normalized]) {
      memory.feedbackStats[normalized] = { up: 0, down: 0 };
    }
    const stats = memory.feedbackStats[normalized];
    if (isPositive) stats.up += 1;
    else stats.down += 1;

    // Adapt engine weights globally based on cumulative feedback signal
    if (isPositive) {
      LEARNED_WEIGHTS.bm25 = Math.min(1.4, LEARNED_WEIGHTS.bm25 + 0.02);
      LEARNED_WEIGHTS.phrase = Math.min(1.4, LEARNED_WEIGHTS.phrase + 0.02);
    } else {
      // On negative feedback, favor broader signals so future retrieval is wider
      LEARNED_WEIGHTS.fuzzy = Math.min(1.5, LEARNED_WEIGHTS.fuzzy + 0.05);
      LEARNED_WEIGHTS.concept = Math.min(1.5, LEARNED_WEIGHTS.concept + 0.05);
      LEARNED_WEIGHTS.learnedAssociation = Math.min(1.5, LEARNED_WEIGHTS.learnedAssociation + 0.05);
      LEARNED_WEIGHTS.bm25 = Math.max(0.7, LEARNED_WEIGHTS.bm25 - 0.01);
    }

    // Learn associations from messages the user marked as GOOD evidence
    if (isPositive && Array.isArray(retrievedMessages) && retrievedMessages.length > 0) {
      const queryInfo = analyzeQuery(question, null);
      learnFromEvidence(memory, queryInfo, retrievedMessages);
    }

    saveRetrievalMemory(memory, scope);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// CORPUS FINGERPRINTING & CACHED INVERTED INDEX
// ============================================================================

const corpusIndexCache = new Map(); // fingerprint -> index (capped)
const CORPUS_CACHE_MAX = 4;

function computeCorpusFingerprint(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "empty";
  const count = messages.length;
  const first = messages[0];
  const mid = messages[Math.floor(count / 2)];
  const last = messages[count - 1];

  return [
    count,
    first ? `${first.date}|${first.time}|${first.sender}|${(first.message || "").slice(0, 20)}` : "",
    mid ? `${mid.sender}|${(mid.message || "").slice(0, 20)}` : "",
    last ? `${last.date}|${last.time}|${last.sender}|${(last.message || "").slice(0, 20)}` : ""
  ].join("###");
}

function buildCorpusIndex(messages) {
  if (!Array.isArray(messages)) {
    return {
      fingerprint: "invalid",
      documentCount: 0,
      avgDocLength: 1,
      docTokens: [],
      docStemTokens: [],
      docLengths: [],
      tokenToDocIds: new Map(),
      stemToDocIds: new Map(),
      senderToDocIds: new Map(),
      uniqueSenders: [],
      documentFrequency: new Map(),
      coOccurrence: new Map(),
      questionDocIds: new Set()
    };
  }

  const fingerprint = computeCorpusFingerprint(messages);
  const cachedIndex = corpusIndexCache.get(fingerprint);
  if (cachedIndex) return cachedIndex;

  const documentCount = messages.length;
  const docTokens = new Array(documentCount);
  const docStemTokens = new Array(documentCount);
  const docLengths = new Array(documentCount);
  const tokenToDocIds = new Map();
  const stemToDocIds = new Map();
  const senderToDocIds = new Map();
  const documentFrequency = new Map();
  const questionDocIds = new Set();
  const senderSet = new Set();

  let totalTokens = 0;

  for (let i = 0; i < documentCount; i++) {
    const msg = messages[i] || {};
    const text = String(msg.message || "");
    const sender = String(msg.sender || "").trim();

    if (sender) {
      senderSet.add(sender);
      const normSender = normalizeText(sender).toLowerCase();
      if (!senderToDocIds.has(normSender)) {
        senderToDocIds.set(normSender, []);
      }
      senderToDocIds.get(normSender).push(i);

      const senderParts = normSender.split(/\s+/);
      for (const part of senderParts) {
        if (part.length >= 2 && part !== normSender) {
          if (!senderToDocIds.has(part)) senderToDocIds.set(part, []);
          senderToDocIds.get(part).push(i);
        }
      }
    }

    const isQuestion = text.includes("?") || (
      tokenize(text).length > 0 && INTERROGATIVES.has(tokenize(text)[0])
    );
    if (isQuestion) {
      questionDocIds.add(i);
    }

    const mTokens = getMeaningfulTokens(text);
    const stemTokens = mTokens.map(stemToken);

    docTokens[i] = mTokens;
    docStemTokens[i] = stemTokens;
    docLengths[i] = mTokens.length;
    totalTokens += mTokens.length;

    const uniqueTokens = new Set(mTokens);
    for (const token of uniqueTokens) {
      if (!tokenToDocIds.has(token)) {
        tokenToDocIds.set(token, []);
      }
      tokenToDocIds.get(token).push(i);
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }

    const uniqueStems = new Set(stemTokens);
    for (const stem of uniqueStems) {
      if (!stemToDocIds.has(stem)) {
        stemToDocIds.set(stem, []);
      }
      stemToDocIds.get(stem).push(i);
    }
  }

  const avgDocLength = documentCount > 0 ? Math.max(1, totalTokens / documentCount) : 1;

  // Co-occurrence graph limited to same conversational session
  const coOccurrence = new Map();
  const termTotalOccurrences = new Map();

  for (let i = 0; i < documentCount; i++) {
    const currentTokens = docStemTokens[i];
    if (!currentTokens || currentTokens.length === 0) continue;

    for (const t of currentTokens) {
      termTotalOccurrences.set(t, (termTotalOccurrences.get(t) || 0) + 1);
    }

    const currentMsg = messages[i];
    const currentDate = currentMsg?.date;

    let startIdx = i;
    while (startIdx > 0 && i - startIdx < 2 && messages[startIdx - 1]?.date === currentDate) {
      startIdx--;
    }

    let endIdx = i;
    while (endIdx < documentCount - 1 && endIdx - i < 2 && messages[endIdx + 1]?.date === currentDate) {
      endIdx++;
    }

    const neighborTokens = new Set();
    for (let w = startIdx; w <= endIdx; w++) {
      const wTokens = docStemTokens[w];
      if (wTokens) {
        for (const t of wTokens) neighborTokens.add(t);
      }
    }

    for (const t1 of currentTokens) {
      if (!coOccurrence.has(t1)) {
        coOccurrence.set(t1, new Map());
      }
      const t1Map = coOccurrence.get(t1);

      for (const t2 of neighborTokens) {
        if (t1 !== t2) {
          t1Map.set(t2, (t1Map.get(t2) || 0) + 1);
        }
      }
    }
  }

  const index = {
    fingerprint,
    documentCount,
    avgDocLength,
    docTokens,
    docStemTokens,
    docLengths,
    tokenToDocIds,
    stemToDocIds,
    senderToDocIds,
    uniqueSenders: Array.from(senderSet),
    documentFrequency,
    termTotalOccurrences,
    coOccurrence,
    questionDocIds
  };

  corpusIndexCache.set(fingerprint, index);
  if (corpusIndexCache.size > CORPUS_CACHE_MAX) {
    const oldest = corpusIndexCache.keys().next().value;
    corpusIndexCache.delete(oldest);
  }
  return index;
}

function clearCorpusCache() {
  corpusIndexCache.clear();
}

// ============================================================================
// DYNAMIC QUERY UNDERSTANDING & INTENT DETECTION
// ============================================================================

function analyzeQuery(question, corpusIndex) {
  const raw = String(question || "");
  const normalized = normalizeText(raw);
  const allTokens = tokenize(normalized);
  const meaningful = getMeaningfulTokens(normalized);
  const stemmed = meaningful.map(stemToken);
  const uniqueTokens = Array.from(new Set(meaningful));
  const uniqueStems = Array.from(new Set(stemmed));

  const quotedMatches = raw.match(/"([^"]+)"|'([^']+)'/g) || [];
  const quotedPhrases = quotedMatches.map(m => m.replace(/["']/g, "").trim().toLowerCase()).filter(Boolean);

  const bigrams = generateNgrams(meaningful, 2);
  const trigrams = generateNgrams(meaningful, 3);

  const resolvedSenders = [];
  const candidateEntityTokens = [];

  const rawWords = raw.split(/\s+/);
  for (const word of rawWords) {
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleanWord) continue;
    if (cleanWord[0] === cleanWord[0].toUpperCase() && cleanWord.length > 1) {
      candidateEntityTokens.push(cleanWord.toLowerCase());
    }
  }

  if (corpusIndex && corpusIndex.uniqueSenders) {
    for (const sender of corpusIndex.uniqueSenders) {
      const normSender = normalizeText(sender).toLowerCase();
      const normSenderTokens = normSender.split(/\s+/);

      if (normSender && normalized.toLowerCase().includes(normSender)) {
        resolvedSenders.push(sender);
      } else {
        for (const part of normSenderTokens) {
          if (part.length >= 3 && uniqueTokens.includes(part)) {
            resolvedSenders.push(sender);
            break;
          }
        }
      }
    }
  }

  const pronounsFound = allTokens.filter(t => PRONOUN_SET.has(t));
  const hasPronoun = pronounsFound.length > 0;

  const intentScores = {
    preference: 0,
    opinion_sentiment: 0,
    factual: 0,
    temporal: 0,
    frequency_comparison: 0,
    relationship_interaction: 0,
    follow_up: 0
  };

  const prefWords = new Set(["like", "love", "hate", "enjoy", "prefer", "fan", "hobby", "into", "favorite"]);
  const sentimentWords = new Set(["feel", "think", "opinion", "angry", "happy", "sad", "upset", "complain", "fight", "argue", "reaction"]);
  const temporalWords = new Set(["when", "date", "time", "yesterday", "last", "ago", "first", "recently", "recent", "year", "month", "kab"]);
  const freqWords = new Set(["often", "most", "least", "always", "never", "more", "faster", "longer", "frequency", "count"]);
  const relWords = new Set(["meet", "relationship", "together", "between"]);

  for (const t of meaningful) {
    if (prefWords.has(t) || prefWords.has(stemToken(t))) intentScores.preference += 2;
    if (sentimentWords.has(t)) intentScores.opinion_sentiment += 2;
    if (temporalWords.has(t)) intentScores.temporal += 2;
    if (freqWords.has(t)) intentScores.frequency_comparison += 2;
    if (relWords.has(t)) intentScores.relationship_interaction += 1.5;
  }

  if (hasPronoun || normalized.startsWith("and ") || normalized.startsWith("what about")) {
    intentScores.follow_up += 2;
  }

  if (allTokens.some(t => INTERROGATIVES.has(t))) {
    intentScores.factual += 1.5;
  }

  let topIntent = "factual";
  let maxScore = 0;
  for (const [intent, score] of Object.entries(intentScores)) {
    if (score > maxScore) {
      maxScore = score;
      topIntent = intent;
    }
  }

  const topicTokens = meaningful.filter(t =>
    !INTERROGATIVES.has(t) &&
    !PRONOUN_SET.has(t) &&
    !STRUCTURAL_FILLERS.has(t) &&
    t !== "did" && t !== "does" && t !== "do"
  );
  const topicStems = Array.from(new Set(topicTokens.map(stemToken)));

  return {
    raw,
    normalized,
    allTokens,
    meaningfulTokens: meaningful,
    uniqueTokens,
    topicTokens,
    topicStems,
    stemmedTokens: stemmed,
    uniqueStems,
    quotedPhrases,
    bigrams,
    trigrams,
    resolvedSenders: Array.from(new Set(resolvedSenders)),
    candidateEntityTokens: Array.from(new Set(candidateEntityTokens)),
    hasPronoun,
    pronounsFound,
    dominantIntent: topIntent,
    intentScores,
    isQuestion: raw.includes("?") || (allTokens.length > 0 && INTERROGATIVES.has(allTokens[0]))
  };
}

// ============================================================================
// DYNAMIC CONCEPT EXPANSION (CORPUS + LEARNED MEMORY)
// ============================================================================

function expandQueryConcepts(queryInfo, corpusIndex, memory) {
  const conceptWeights = new Map();

  const baseStems = queryInfo.topicStems.length > 0 ? queryInfo.topicStems : queryInfo.uniqueStems;
  for (const stem of baseStems) {
    conceptWeights.set(stem, 1.0);
  }

  const exclusionSet = new Set([...baseStems, ...queryInfo.uniqueTokens]);

  // ---- 1. LEARNED associations from memory (strongest, personalized) ----
  if (memory) {
    const learned = getLearnedAssociations(queryInfo, memory, exclusionSet);
    for (const [term, weight] of learned.entries()) {
      const scaled = Math.min(0.9, weight * 0.55) * LEARNED_WEIGHTS.learnedAssociation;
      const existing = conceptWeights.get(term) || 0;
      if (scaled > existing) conceptWeights.set(term, scaled);
    }
  }

  // ---- 2. Corpus co-occurrence ----
  if (corpusIndex && corpusIndex.coOccurrence) {
    for (const stem of baseStems) {
      if (INTERROGATIVES.has(stem) || PRONOUN_SET.has(stem) || STRUCTURAL_FILLERS.has(stem)) continue;
      const neighbors = corpusIndex.coOccurrence.get(stem);
      if (!neighbors) continue;

      const sortedNeighbors = Array.from(neighbors.entries())
        .filter(([term, count]) => {
          if (INTERROGATIVES.has(term) || PRONOUN_SET.has(term) || STRUCTURAL_FILLERS.has(term) || CONSERVATIVE_STOP_WORDS.has(term)) return false;
          const df = corpusIndex.documentFrequency.get(term) || 0;
          const totalTermOcc = corpusIndex.termTotalOccurrences?.get(term) || 1;
          const totalStemOcc = corpusIndex.termTotalOccurrences?.get(stem) || 1;
          const minOcc = Math.min(totalTermOcc, totalStemOcc);
          const correlationRatio = count / minOcc;
          return count >= 2 && correlationRatio >= 0.30 && df < corpusIndex.documentCount * 0.4 && term.length >= 3;
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      for (const [neighborTerm, coCount] of sortedNeighbors) {
        const existing = conceptWeights.get(neighborTerm) || 0;
        const weight = Math.min(0.65, 0.2 + (coCount * 0.08)) * LEARNED_WEIGHTS.concept;
        if (weight > existing) {
          conceptWeights.set(neighborTerm, weight);
        }
      }
    }
  }

  return conceptWeights;
}

// ============================================================================
// SCORING HELPERS
// ============================================================================

function calculateBM25Weight(tf, df, docLength, avgDocLength, totalDocs) {
  if (tf <= 0) return 0;
  const k1 = 1.4;
  const b = 0.75;
  const idf = Math.log(((totalDocs - df + 0.5) / (df + 0.5)) + 1);
  const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength))));
  return Math.max(0, idf * tfNorm);
}

function detectMessagePolarity(text, queryTokens) {
  const tokens = tokenize(text);
  let hasNegation = false;
  for (let i = 0; i < tokens.length; i++) {
    if (NEGATION_MARKERS.has(tokens[i])) {
      for (let j = Math.max(0, i - 3); j <= Math.min(tokens.length - 1, i + 3); j++) {
        if (queryTokens.includes(tokens[j]) || queryTokens.includes(stemToken(tokens[j]))) {
          hasNegation = true;
          break;
        }
      }
    }
  }
  return hasNegation ? -1 : 1;
}

function calculateMessageQuality(text) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  if (
    lower.includes("messages and calls are end-to-end encrypted") ||
    lower.includes("this message was deleted") ||
    lower.includes("you deleted this message") ||
    lower.includes("<media omitted>") ||
    lower.includes("missed voice call") ||
    lower.includes("missed video call")
  ) {
    return 0.1;
  }
  if (text.length < 3) return 0.5;
  return 1.0;
}

/**
 * Detects short affirmative/negative answers (used for Q->A stitching).
 * Returns +1 affirmative, -1 negative, 0 neither.
 */
function detectShortAnswer(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0 || tokens.length > 3) return 0;
  const first = canonicalizeToken(tokens[0]);
  if (AFFIRMATIVE_ANSWERS.has(first)) return 1;
  if (NEGATIVE_ANSWERS.has(first)) return -1;
  return 0;
}

// ============================================================================
// MULTI-SIGNAL CANDIDATE SCORING
// ============================================================================

/**
 * @param {Object} options
 *   relaxed:       boolean - lower thresholds, boost fuzzy/concept signals
 *   fuzzyFallback: boolean - enable character-trigram soft matching
 *   semanticScores: Map<messageIndex, score in [0,1]> | null - embedding
 *                  similarity; semantic hits join the candidate pool in every
 *                  pass and contribute to the composite score.
 */
function scoreCandidates(messages, queryInfo, expandedConcepts, corpusIndex, options = {}) {
  const { relaxed = false, fuzzyFallback = false, semanticScores = null } = options;
  const totalDocs = corpusIndex.documentCount;
  const avgDocLength = corpusIndex.avgDocLength;

  const candidateIndices = new Set();

  for (const token of queryInfo.uniqueTokens) {
    const docIds = corpusIndex.tokenToDocIds.get(token);
    if (docIds) {
      for (const id of docIds) candidateIndices.add(id);
    }
  }

  for (const stem of queryInfo.uniqueStems) {
    const docIds = corpusIndex.stemToDocIds.get(stem);
    if (docIds) {
      for (const id of docIds) candidateIndices.add(id);
    }
  }

  if (semanticScores) {
    for (const id of semanticScores.keys()) {
      if (id < totalDocs) candidateIndices.add(id);
    }
  }

  // Sender match narrows candidates in the strict pass, but relaxed and
  // fuzzy passes must consider every message: a question about one person
  // is often answered by somebody else's message (question -> answer).
  if (relaxed) {
    for (let i = 0; i < totalDocs; i++) candidateIndices.add(i);
  }

  for (const sender of queryInfo.resolvedSenders) {
    const docIds = corpusIndex.senderToDocIds.get(normalizeText(sender).toLowerCase());
    if (docIds) {
      for (const id of docIds.slice(0, 100)) candidateIndices.add(id);
    }
  }

  // In relaxed/fuzzy modes, also consider docs matching expanded concepts
  if ((relaxed || fuzzyFallback) && expandedConcepts) {
    for (const concept of expandedConcepts.keys()) {
      const docIds = corpusIndex.stemToDocIds.get(concept);
      if (docIds) {
        for (const id of docIds) candidateIndices.add(id);
      }
    }
  }

  const targetIndices = candidateIndices.size > 0
    ? Array.from(candidateIndices)
    : messages.map((_, i) => i);

  const scoredCandidates = [];

  const allPhrases = [
    ...queryInfo.quotedPhrases,
    ...queryInfo.trigrams,
    ...queryInfo.bigrams
  ];

  // Pre-normalized query tokens for soft matching
  const softTargets = (queryInfo.topicTokens.length > 0 ? queryInfo.topicTokens : queryInfo.uniqueTokens)
    .filter(t => t.length >= 4);

  for (const idx of targetIndices) {
    const msg = messages[idx];
    if (!msg) continue;

    const rawText = String(msg.message || "");
    const normText = normalizeText(rawText).toLowerCase();
    const docTokens = corpusIndex.docTokens[idx] || [];
    const docStems = corpusIndex.docStemTokens[idx] || [];
    const docLen = corpusIndex.docLengths[idx] || 1;
    const sender = String(msg.sender || "");
    const normSender = normalizeText(sender).toLowerCase();

    // 1. Exact Phrase & N-Gram Match
    let phraseScore = 0;
    for (const phrase of allPhrases) {
      if (phrase.length >= 3 && normText.includes(phrase)) {
        const words = phrase.split(" ").length;
        phraseScore += words >= 3 ? 48 : 32;
      }
    }
    phraseScore *= LEARNED_WEIGHTS.phrase;

    // 2. BM25 Lexical Score
    let bm25Score = 0;
    let directMatches = 0;
    let directTopicMatches = 0;
    const tokenFreqMap = new Map();
    for (const t of docTokens) {
      tokenFreqMap.set(t, (tokenFreqMap.get(t) || 0) + 1);
    }

    const topicTokenSet = new Set(queryInfo.topicTokens);

    for (const qToken of queryInfo.uniqueTokens) {
      const tf = tokenFreqMap.get(qToken) || 0;
      if (tf > 0) {
        directMatches++;
        const isTopic = topicTokenSet.has(qToken);
        if (isTopic) directTopicMatches++;

        const df = corpusIndex.documentFrequency.get(qToken) || 1;
        const multiplier = isTopic ? 14 : 1.5;
        bm25Score += calculateBM25Weight(tf, df, docLen, avgDocLength, totalDocs) * multiplier;
      }
    }
    bm25Score *= LEARNED_WEIGHTS.bm25;

    // 3. Morphological Stem Match
    let stemScore = 0;
    const stemFreqMap = new Map();
    for (const s of docStems) {
      stemFreqMap.set(s, (stemFreqMap.get(s) || 0) + 1);
    }

    const topicStemSet = new Set(queryInfo.topicStems);

    for (const qStem of queryInfo.uniqueStems) {
      const tf = stemFreqMap.get(qStem) || 0;
      if (tf > 0 && !tokenFreqMap.has(qStem)) {
        const isTopic = topicStemSet.has(qStem);
        const df = corpusIndex.documentFrequency.get(qStem) || 1;
        const multiplier = isTopic ? 10 : 1.0;
        stemScore += calculateBM25Weight(tf, df, docLen, avgDocLength, totalDocs) * multiplier;
      }
    }
    stemScore *= LEARNED_WEIGHTS.stem;

    // 4. Dynamic Concept Expansion Score
    let conceptScore = 0;
    for (const [cStem, weight] of expandedConcepts.entries()) {
      if (!queryInfo.uniqueStems.includes(cStem)) {
        const tf = stemFreqMap.get(cStem) || 0;
        if (tf > 0) {
          conceptScore += (tf * weight * 16);
        }
      }
    }
    conceptScore *= LEARNED_WEIGHTS.concept;

    // 5. Fuzzy Score (Levenshtein; in fallback mode also trigram soft matching)
    let fuzzyScore = 0;
    if (directTopicMatches === 0 && phraseScore === 0) {
      for (const qToken of softTargets) {
        for (const dToken of docTokens) {
          let similarity = fuzzyTokenMatch(qToken, dToken);
          if (similarity === 0 && fuzzyFallback) {
            similarity = softTokenSimilarity(qToken, dToken) * 0.85;
          }
          if (similarity >= 0.75) {
            fuzzyScore += similarity * 14;
            break;
          }
        }
      }
    }
    fuzzyScore *= LEARNED_WEIGHTS.fuzzy;

    // 10. Semantic similarity (embeddings, optional)
    let semanticScore = 0;
    if (semanticScores) {
      const similarity = semanticScores.get(idx);
      if (similarity) {
        semanticScore = similarity * 40;
      }
    }

    // 6. Sender & Participant Relevance
    let senderScore = 0;
    const targetSender = queryInfo.resolvedSenders[0];
    const hasTopicOverlap = (
      directTopicMatches > 0 ||
      stemScore > 0 ||
      conceptScore > 0 ||
      phraseScore > 0 ||
      fuzzyScore > 0 ||
      semanticScore > 0
    );
    const isPurePersonQuery = queryInfo.topicTokens.length === 0;

    if (targetSender) {
      const normTarget = normalizeText(targetSender).toLowerCase();
      if (normSender === normTarget) {
        if (hasTopicOverlap) {
          senderScore += 28;
        } else if (isPurePersonQuery) {
          senderScore += 10;
        }
      }
      if (normTarget && normText.includes(normTarget)) {
        if (hasTopicOverlap) {
          senderScore += 24;
        } else if (isPurePersonQuery) {
          senderScore += 8;
        }
      }
      senderScore *= LEARNED_WEIGHTS.sender;
    }

    if (!hasTopicOverlap && !isPurePersonQuery && phraseScore === 0) {
      continue;
    }

    // 7. Token Proximity
    let proximityScore = 0;
    if (queryInfo.uniqueTokens.length >= 2) {
      const positions = [];
      for (const qToken of queryInfo.uniqueTokens) {
        const pos = docTokens.indexOf(qToken);
        if (pos !== -1) positions.push(pos);
      }
      if (positions.length >= 2) {
        const span = Math.max(...positions) - Math.min(...positions) + 1;
        if (span <= 4) proximityScore += 22;
        else if (span <= 8) proximityScore += 14;
        else if (span <= 14) proximityScore += 6;
      }
    }
    proximityScore *= LEARNED_WEIGHTS.proximity;

    // 8. Polarity
    const polarity = detectMessagePolarity(rawText, queryInfo.uniqueTokens);

    // 9. Quality
    const quality = calculateMessageQuality(rawText);

    let multiMatchBonus = 0;
    if (directMatches >= 2) multiMatchBonus += 16;
    if (directMatches >= 3) multiMatchBonus += 24;

    const rawCompositeScore = (
      phraseScore +
      bm25Score +
      stemScore +
      conceptScore +
      senderScore +
      proximityScore +
      fuzzyScore +
      semanticScore +
      multiMatchBonus
    ) * quality;

    const admissionThreshold = relaxed ? 0.8 : 1.5;
    if (rawCompositeScore > admissionThreshold) {
      scoredCandidates.push({
        index: idx,
        score: rawCompositeScore,
        phraseScore,
        bm25Score,
        stemScore,
        conceptScore,
        senderScore,
        proximityScore,
        fuzzyScore,
        semanticScore,
        quality,
        polarity,
        matchedTokensCount: directMatches,
        date: msg.date,
        time: msg.time,
        sender: msg.sender,
        message: msg.message
      });
    }
  }

  return scoredCandidates.sort((a, b) => b.score - a.score);
}

// ============================================================================
// CONVERSATIONAL CONTEXT EXPANSION & THREAD STITCHING
// ============================================================================

function expandConversationalContext(scoredCandidates, messages, corpusIndex, limit) {
  if (scoredCandidates.length === 0) return [];

  const contextIndices = new Set();
  const guaranteedAnchorIndices = new Set();

  const topScore = scoredCandidates[0]?.score || 0;
  const maxAnchorCount = Math.max(1, Math.min(6, Math.floor(limit / 2)));
  const topAnchors = scoredCandidates
    .filter((c, idx) => idx < maxAnchorCount && c.score >= Math.max(2, topScore * 0.2));

  for (const anchor of topAnchors) {
    contextIndices.add(anchor.index);
    guaranteedAnchorIndices.add(anchor.index);

    const isQuestion = corpusIndex.questionDocIds.has(anchor.index);

    let before = 1;
    let after = 1;

    if (isQuestion) {
      before = 0;
      after = 3;
    } else if (anchor.score >= 50) {
      before = 2;
      after = 2;
    } else if (anchor.score >= 25) {
      before = 1;
      after = 2;
    }

    const start = Math.max(0, anchor.index - before);
    const end = Math.min(messages.length - 1, anchor.index + after);

    for (let i = start; i <= end; i++) {
      contextIndices.add(i);
    }

    // Q->A stitching: if anchor is a question, follow the chain of short
    // affirmative/negative answers to capture the actual response.
    if (isQuestion) {
      let look = anchor.index + 1;
      let steps = 0;
      while (look < messages.length && steps < 4) {
        const ansType = detectShortAnswer(messages[look]?.message);
        if (ansType !== 0) {
          contextIndices.add(look);
          guaranteedAnchorIndices.add(look);
          // Also include the message right after a short answer (often the elaboration)
          if (look + 1 < messages.length) contextIndices.add(look + 1);
          look++;
          steps++;
        } else {
          break;
        }
      }
    }
  }

  const scoreMap = new Map();
  for (const cand of scoredCandidates) {
    scoreMap.set(cand.index, cand.score);
  }

  const candidateList = Array.from(contextIndices).map(idx => ({
    index: idx,
    isAnchor: guaranteedAnchorIndices.has(idx),
    score: scoreMap.get(idx) || 0
  }));

  candidateList.sort((a, b) => {
    if (a.isAnchor !== b.isAnchor) return a.isAnchor ? -1 : 1;
    return b.score - a.score;
  });

  const selectedIndices = candidateList.slice(0, limit).map(c => c.index);

  for (const anchorIdx of guaranteedAnchorIndices) {
    if (!selectedIndices.includes(anchorIdx)) {
      selectedIndices.push(anchorIdx);
    }
  }

  // Diversity safeguard: collapse runs of 3+ consecutive near-identical
  // messages (spam/forward floods) from the same sender into fewer entries.
  const deduped = [];
  let runSender = null;
  let runCount = 0;
  for (const idx of selectedIndices.sort((a, b) => a - b)) {
    const s = String(messages[idx]?.sender || "");
    if (s === runSender) {
      runCount++;
      if (runCount > 3) continue; // skip excessive floods
    } else {
      runSender = s;
      runCount = 1;
    }
    deduped.push(idx);
  }

  return deduped.map(idx => {
    const original = messages[idx] || {};
    return {
      date: original.date || "",
      time: original.time || "",
      sender: original.sender || "",
      message: original.message || ""
    };
  });
}

// ============================================================================
// CALIBRATED CONFIDENCE METRIC
// ============================================================================

function calculateConfidenceScore(scoredCandidates, queryInfo) {
  if (!scoredCandidates || scoredCandidates.length === 0) {
    return { confidence: 0.0, reason: "No relevant messages found in conversation" };
  }

  const topScore = scoredCandidates[0].score;
  const secondScore = scoredCandidates.length > 1 ? scoredCandidates[1].score : 0;

  let confidence = 0.0;
  if (topScore >= 70) confidence = 0.95;
  else if (topScore >= 45) confidence = 0.85;
  else if (topScore >= 25) confidence = 0.72;
  else if (topScore >= 15) confidence = 0.55;
  else if (topScore >= 8) confidence = 0.38;
  else confidence = 0.20;

  // Score-gap calibration: a dominant top result is more trustworthy
  // than many near-equal mediocre results.
  if (topScore > 0 && secondScore / topScore < 0.4) {
    confidence = Math.min(1.0, confidence + 0.05);
  }

  // Multiple independent corroborating messages raise confidence
  const strongEvidence = scoredCandidates.filter(c => c.score >= topScore * 0.5).length;
  if (strongEvidence >= 3) {
    confidence = Math.min(1.0, confidence + 0.05);
  }

  if (queryInfo.resolvedSenders.length > 0 && scoredCandidates.some(c => c.senderScore > 0)) {
    confidence = Math.min(1.0, confidence + 0.08);
  }

  const reason = confidence >= 0.65
    ? "High-confidence evidence retrieved"
    : confidence >= 0.35
      ? "Moderate relevance context found"
      : "Low-confidence matches; evidence may be sparse";

  return {
    confidence: Number(confidence.toFixed(2)),
    reason
  };
}

// ============================================================================
// MULTI-PASS ADAPTIVE RETRIEVAL
// ============================================================================
// Pass 1 (strict):    exact lexical + stem + concept signals
// Pass 2 (relaxed):   lower thresholds, concept docs included
// Pass 3 (fuzzy):     character-trigram soft matching for typos/OOV
// The engine escalates only when the previous pass yields insufficient
// evidence, so precision is preserved whenever possible.
// ============================================================================

function adaptiveRetrieve(messages, queryInfo, expandedConcepts, corpusIndex, options = {}) {
  let scored = scoreCandidates(messages, queryInfo, expandedConcepts, corpusIndex, { relaxed: false, ...options });

  const minEvidence = queryInfo.topicTokens.length === 0 ? 1 : 3;
  if (scored.length >= minEvidence && scored[0].score >= 8) {
    return { scoredCandidates: scored, pass: "strict" };
  }

  const relaxed = scoreCandidates(messages, queryInfo, expandedConcepts, corpusIndex, { relaxed: true, ...options });
  // Merge, keeping the best score per doc
  const best = new Map();
  for (const c of [...scored, ...relaxed]) {
    const prev = best.get(c.index);
    if (!prev || c.score > prev.score) best.set(c.index, c);
  }
  scored = Array.from(best.values()).sort((a, b) => b.score - a.score);

  if (scored.length >= minEvidence && scored[0].score >= 4) {
    return { scoredCandidates: scored, pass: "relaxed" };
  }

  const fuzzy = scoreCandidates(messages, queryInfo, expandedConcepts, corpusIndex, { relaxed: true, fuzzyFallback: true, ...options });
  for (const c of fuzzy) {
    const prev = best.get(c.index);
    if (!prev || c.score > prev.score) best.set(c.index, c);
  }
  scored = Array.from(best.values()).sort((a, b) => b.score - a.score);

  return { scoredCandidates: scored, pass: scored.length > 0 ? "fuzzy" : "none" };
}

// ============================================================================
// MAIN RETRIEVAL ENGINE (PRIMARY ENTRY POINT)
// ============================================================================

function retrieveRelevantMessages(messages, question, limit = DEFAULT_LIMIT, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const emptyResult = [];
    emptyResult.confidence = 0.0;
    emptyResult.reason = "Empty or invalid messages array";
    emptyResult.messages = emptyResult;
    return emptyResult;
  }

  if (typeof question !== "string" || !question.trim()) {
    const emptyResult = [];
    emptyResult.confidence = 0.0;
    emptyResult.reason = "Empty or invalid question string";
    emptyResult.messages = emptyResult;
    return emptyResult;
  }

  const effectiveLimit = Math.max(1, Math.min(100, Number(limit) || DEFAULT_LIMIT));

  // 1. Index Corpus
  const corpusIndex = buildCorpusIndex(messages);

  // 2. Query Understanding & Entity Discovery
  const queryInfo = analyzeQuery(question, corpusIndex);

  // 3. Pronoun Resolution from Memory
  const memory = ensureCorpusScoping(loadRetrievalMemory(options.scope), corpusIndex.fingerprint);
  if (queryInfo.hasPronoun && queryInfo.resolvedSenders.length === 0) {
    const resolvedFromMem = resolvePronounFromMemory(queryInfo, memory);
    if (resolvedFromMem) {
      queryInfo.resolvedSenders.push(resolvedFromMem);
    }
  }

  // 4. Dynamic Concept Expansion (corpus co-occurrence + learned associations)
  const expandedConcepts = expandQueryConcepts(queryInfo, corpusIndex, memory);

  // 5. Multi-Pass Adaptive Scoring
  const { scoredCandidates, pass } = adaptiveRetrieve(messages, queryInfo, expandedConcepts, corpusIndex, options);

  // 6. Conversational Context Window Expansion + Q->A stitching
  const finalMessages = expandConversationalContext(scoredCandidates, messages, corpusIndex, effectiveLimit);

  // 7. Calibrated Confidence
  const { confidence, reason } = calculateConfidenceScore(scoredCandidates, queryInfo);

  // Attach metadata while preserving Array identity (backward compatible)
  finalMessages.confidence = confidence;
  finalMessages.reason = reason;
  finalMessages.intent = queryInfo.dominantIntent;
  finalMessages.entities = queryInfo.resolvedSenders;
  finalMessages.retrievalPass = pass;
  finalMessages.semanticUsed = Boolean(options.semanticScores && options.semanticScores.size > 0);
  finalMessages.messages = finalMessages;

  // 8. Self-Improvement: learn from this interaction
  learnQuery(question, finalMessages, {
    confidence,
    intent: queryInfo.dominantIntent,
    entities: queryInfo.resolvedSenders
  }, options.scope);

  return finalMessages;
}

// ============================================================================
// SELF-IMPROVING RETRIEVAL LEARNING SYSTEM
// ============================================================================

function learnQuery(question, retrievedMessages, feedback = {}, scope = "global") {
  if (!question || typeof question !== "string") return;
  if (!Array.isArray(retrievedMessages) || retrievedMessages.length === 0) return;

  try {
    const memory = loadRetrievalMemory(scope);
    const queryInfo = analyzeQuery(question, null);

    // Substantive retrieval -> reinforce associations between the query and
    // the language actually used in the evidence (personalized semantics).
    if ((feedback.confidence || 0) >= 0.5) {
      learnFromEvidence(memory, queryInfo, retrievedMessages);
    }

    const entry = {
      question: String(question).trim(),
      normalized: queryInfo.normalized,
      tokens: queryInfo.uniqueTokens,
      stems: queryInfo.uniqueStems,
      resolvedSenders: feedback.entities || queryInfo.resolvedSenders || [],
      dominantIntent: feedback.intent || queryInfo.dominantIntent,
      confidence: feedback.confidence || 0.5,
      timestamp: new Date().toISOString()
    };

    const existingIndex = memory.queries.findIndex(m => m.normalized === entry.normalized);
    if (existingIndex !== -1) {
      memory.queries.splice(existingIndex, 1);
    }

    memory.queries.push(entry);
    saveRetrievalMemory(memory, scope);
  } catch {
    // Fail silently
  }
}

// ============================================================================
// DEEP RETRIEVAL DIAGNOSTICS (DEBUG MODE)
// ============================================================================

function debugRetrieval(messages, question, limit = DEFAULT_LIMIT, options = {}) {
  const corpusIndex = buildCorpusIndex(messages);
  const queryInfo = analyzeQuery(question, corpusIndex);
  const memory = ensureCorpusScoping(loadRetrievalMemory(options.scope), corpusIndex.fingerprint);

  if (queryInfo.hasPronoun && queryInfo.resolvedSenders.length === 0) {
    const resolvedFromMem = resolvePronounFromMemory(queryInfo, memory);
    if (resolvedFromMem) {
      queryInfo.resolvedSenders.push(resolvedFromMem);
    }
  }

  const expandedConcepts = expandQueryConcepts(queryInfo, corpusIndex, memory);
  const { scoredCandidates, pass } = adaptiveRetrieve(messages, queryInfo, expandedConcepts, corpusIndex);
  const finalContext = expandConversationalContext(scoredCandidates, messages, corpusIndex, limit);
  const { confidence, reason } = calculateConfidenceScore(scoredCandidates, queryInfo);

  const topCandidates = scoredCandidates.slice(0, 15).map(c => ({
    index: c.index,
    sender: c.sender,
    date: c.date,
    time: c.time,
    message: c.message,
    totalScore: Number(c.score.toFixed(2)),
    breakdown: {
      phraseScore: c.phraseScore,
      bm25Score: Number(c.bm25Score.toFixed(2)),
      stemScore: Number(c.stemScore.toFixed(2)),
      conceptScore: Number(c.conceptScore.toFixed(2)),
      senderScore: c.senderScore,
      proximityScore: c.proximityScore,
      fuzzyScore: Number(c.fuzzyScore.toFixed(2)),
      polarity: c.polarity,
      quality: c.quality
    }
  }));

  const learnedAssocSample = (queryInfo.topicStems || [])
    .map(stem => ({ stem, associations: memory.termAssociations?.[stem] || null }))
    .filter(x => x.associations);

  const diagnostics = {
    question: String(question),
    normalizedQuery: queryInfo.normalized,
    queryTokens: queryInfo.uniqueTokens,
    queryStems: queryInfo.uniqueStems,
    detectedIntent: queryInfo.dominantIntent,
    detectedEntities: queryInfo.resolvedSenders,
    hasPronoun: queryInfo.hasPronoun,
    retrievalPass: pass,
    expandedConcepts: Array.from(expandedConcepts.entries()).map(([term, weight]) => ({
      concept: term,
      weight: Number(weight.toFixed(2))
    })),
    learnedAssociations: learnedAssocSample,
    dynamicWeights: { ...LEARNED_WEIGHTS },
    corpusStats: {
      totalMessages: corpusIndex.documentCount,
      avgDocLength: Number(corpusIndex.avgDocLength.toFixed(2)),
      uniqueSenders: corpusIndex.uniqueSenders
    },
    topScoredEvidence: topCandidates,
    retrievedCount: finalContext.length,
    confidence,
    reason,
    retrievedMessages: finalContext
  };

  return diagnostics;
}

// ============================================================================
// UNIVERSAL EXPORTS (CommonJS-safe; ESM handled by wrapper if needed)
// ============================================================================

const ChatScopeRetrieval = {
  retrieveRelevantMessages,
  learnQuery,
  recordFeedback,
  disposeRetrievalMemory,
  debugRetrieval,
  buildCorpusIndex,
  clearCorpusCache,
  analyzeQuery,
  tokenize,
  normalizeText,
  stemToken
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ChatScopeRetrieval;
}