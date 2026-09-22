// ------------------------------------------------
// DETERMINISTIC ANALYTICS ANSWERING
// ------------------------------------------------
// Simple statistical / comparative questions are answered directly from
// analytics — no Gemini call, no retrieval, exact numbers.
// Patterns are generic (English + Hinglish phrasing); participants and
// values always come from the uploaded chat.
// ------------------------------------------------

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "N/A";
  }
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

function sortedEntries(record) {
  return Object.entries(record || {}).sort((a, b) => b[1] - a[1]);
}

function answerFromAnalytics(question, analytics) {
  if (!analytics) return null;
  const q = question.toLowerCase().trim();

  const ranked = (obj) =>
    sortedEntries(obj).filter(([, v]) => v > 0);

  const answerRanking = (entries, unit, verbPhrase) => {
    if (entries.length === 0) return "Not enough data to determine that.";
    const [top, second] = entries;
    let text = `${top[0]} ${verbPhrase} — ${top[1].toLocaleString()} ${unit}`;
    if (second) {
      text += `\n${second[0]}: ${second[1].toLocaleString()} ${unit}`;
    }
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    if (total > 0) {
      text += ` (${Math.round((top[1] / total) * 100)}% of all)`;
    }
    return text;
  };

  // Who sends longer messages — must be checked BEFORE the generic
  // "who talks/messages" pattern, which would otherwise swallow it.
  if (/(who|kaun).*(longer|long|lambi|lmba).*message/i.test(q) || /longer messages|message length|verbose/i.test(q)) {
    const entries = (analytics.messageLength?.byPerson || []).filter(
      (p) => p.averageMessageLength > 0
    );
    if (entries.length === 0) return null;
    const [top, second] = entries;
    let text = `${top.person} writes the longest messages — ${top.averageMessageLength} characters on average`;
    if (second) {
      text += `\n${second.person}: ${second.averageMessageLength} characters on average`;
    }
    return { answer: text };
  }

  // Who talks more / most messages
  if (
    /(who|kaun|kis).*(talk|message|text|speak|baat|msg)/i.test(q) ||
    /zyada (baat|message|msg)/i.test(q) ||
    /(most|sabse zyada) (messages?|msgs?|texts?)/i.test(q)
  ) {
    const entries = ranked(analytics.messagesPerPerson);
    if (entries.length === 0) return null;
    return {
      answer: answerRanking(entries, "messages", "sends the most messages"),
    };
  }

  // Total message count
  if (/how many (total )?messages/i.test(q) || /(kitne|total) message/i.test(q)) {
    return {
      answer: `This conversation contains ${analytics.overview.totalMessages.toLocaleString()} messages${
        analytics.overview.dateRange?.durationDays != null
          ? ` across ${analytics.overview.dateRange.durationDays} days`
          : ""
      }.`,
    };
  }

  // Participants
  if (/who (are|is) (the )?participants?|how many participants|participants in/i.test(q)) {
    return {
      answer: `There ${analytics.overview.participants.length === 1 ? "is" : "are"} ${
        analytics.overview.totalParticipants
      } participant${analytics.overview.totalParticipants === 1 ? "" : "s"}: ${analytics.overview.participants.join(
        ", "
      )}.`,
    };
  }

  // Who replies faster
  if (/(who|kaun).*(repl|respond|jaldi)/i.test(q) || /replies? faster|responds? faster|response time/i.test(q)) {
    const entries = Object.entries(analytics.responseTime?.byPerson || {})
      .filter(([, d]) => Number.isFinite(d.medianResponseMinutes ?? d.averageResponseMinutes))
      .sort(
        (a, b) =>
          (a[1].medianResponseMinutes ?? a[1].averageResponseMinutes) -
          (b[1].medianResponseMinutes ?? b[1].averageResponseMinutes)
      );
    if (entries.length === 0) return null;
    const [top, second] = entries;
    let text = `${top[0]} typically replies fastest — median ${formatMinutes(
      top[1].medianResponseMinutes ?? top[1].averageResponseMinutes
    )}`;
    if (second) {
      text += `\n${second[0]}: median ${formatMinutes(
        second[1].medianResponseMinutes ?? second[1].averageResponseMinutes
      )}`;
    }
    return { answer: text };
  }

  // Who starts conversations
  if (/(who|kaun).*(start|begin|shuru|pehle)/i.test(q) || /conversation starter/i.test(q)) {
    const entries = (analytics.conversationStarters?.byPerson || []).filter((p) => p.count > 0);
    if (entries.length === 0) return null;
    const [top, second] = entries;
    let text = `${top.person} starts most conversations — ${top.count} of ${
      analytics.conversationStarters.totalConversations
    } (${top.percentage}%)`;
    if (second) {
      text += `\n${second.person}: ${second.count} (${second.percentage}%)`;
    }
    return { answer: text };
  }

  // Who uses more emojis
  if (/(who|kaun).*(emoji|smiley)/i.test(q) || /more emojis?/i.test(q)) {
    const entries = ranked(analytics.emojisPerPerson);
    if (entries.length === 0) return null;
    return { answer: answerRanking(entries, "emojis", "uses the most emojis") };
  }

  // Busiest day of week
  if (/(busiest|most active|sabse active) (day|weekday)/i.test(q)) {
    const entries = ranked(analytics.activity?.messagesByDay);
    if (entries.length === 0) return null;
    return {
      answer: `${entries[0][0]} is the busiest day — ${entries[0][1].toLocaleString()} messages.`,
    };
  }

  // Most active hour
  if (/(busiest|most active|sabse active) (hour|time)/i.test(q)) {
    const entries = ranked(analytics.activity?.messagesByHour);
    if (entries.length === 0) return null;
    return {
      answer: `The chat is most active around ${entries[0][0]}:00 — ${entries[0][1].toLocaleString()} messages.`,
    };
  }

  // Most used emoji
  if (/most (used|common) emoji|top emoji/i.test(q)) {
    const top = (analytics.topEmojis || [])[0];
    if (!top) return null;
    return { answer: `${top.emoji} is the most-used emoji — ${top.count.toLocaleString()} times.` };
  }

  // No deterministic match — let retrieval + Gemini handle it
  return null;
}

/**
 * Build suggested questions from the actual chat: generic templates filled
 * with real participant names and real activity, so suggestions are always
 * relevant without any hard-coded topics.
 */
function buildSuggestions(analytics) {
  if (!analytics) return [];

  const participants = analytics.overview?.participants || [];
  const [first, second] = participants;

  const suggestions = [];

  if (first) {
    suggestions.push(`What does ${first} like?`);
  }
  if (second) {
    suggestions.push(`What does ${second} talk about most?`);
  }
  suggestions.push("Who talks more?");
  suggestions.push("Who replies faster?");
  suggestions.push("What are the main topics?");
  suggestions.push("What interesting patterns can you find?");

  return suggestions.slice(0, 6);
}

module.exports = { answerFromAnalytics, formatMinutes, buildSuggestions };
