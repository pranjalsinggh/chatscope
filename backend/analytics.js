// Common function words (English + common Hinglish chat fillers) that
// should not dominate the "most used words" list.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
  "did", "does", "that", "this", "with", "have", "from", "they", "will",
  "would", "there", "their", "what", "about", "just", "like", "when",
  "then", "than", "your", "been", "were", "some", "them", "other", "over",
  "such", "into", "only", "also", "most", "much", "very", "should", "could",
  "hai", "hain", "nahi", "nhi", "kya", "kyun", "karan", "hoga", "hoki",
  "tha", "thi", "the", "ho", "ka", "ke", "ki", "ko", "me", "mera", "meri",
  "tum", "tumhara", "acha", "accha", "theek", "haan", "han", "matlab",
  "bhai", "yaar", "nah", "okay", "ok", "hmm", "yeah", "yes", "bro", "dude",
  "will", "wanna", "gonna", "really", "actually", "maybe", "right", "going",
  "know", "good", "want", "need", "make", "made", "come", "came", "take",
  "took", "give", "gave", "look", "looking", "thing", "things", "stuff",
]);

function calculateAnalytics(messages) {
  const totalMessages = messages.length;

  const participants = [
    ...new Set(messages.map((msg) => msg.sender)),
  ];

  const messagesPerPerson = {};

  const messagesByDate = {};
  const messagesByHour = {};
  const messagesByDay = {};

  let totalCharacters = 0;
  let longestMessage = null;

  let totalLinks = 0;
  let mediaMessages = 0;
  let deletedMessages = 0;

  const emojiCounts = {};
  const emojiCountsByPerson = {};
  const wordCounts = {};
  let totalWords = 0;

  // Response time data
  const responseTimes = {};
  let fastestResponse = null;

  // Conversation starter data
  const conversationStarters = {};
  let totalConversations = 0;

  // Message length data
  const messageLengthByPerson = {};

  // Directed reply pairs: "A -> B" counted when B responds to A within a
  // conversation window (same 120-minute gap rule as conversation starters)
  const pairCounts = {};

  // Per-person meaningful word counts
  const wordCountsByPerson = {};

  // Sorted per-person response durations (for median)
  const responseDurationsByPerson = {};

  // Date range
  let firstDateTime = null;
  let lastDateTime = null;

  /*
    Convert WhatsApp date + time into a JavaScript Date.
  */
  function parseDateTime(dateString, timeString) {
    try {
      const dateParts = dateString.split("/");

      if (dateParts.length !== 3) {
        return null;
      }

      let [day, month, year] = dateParts;

      day = parseInt(day);
      month = parseInt(month);
      year = parseInt(year);

      if (year < 100) {
        year += 2000;
      }

      // Normalize special spaces
      const normalizedTime = timeString
        .replace(/\u202f/g, " ")
        .replace(/\u00a0/g, " ")
        .trim()
        .toLowerCase();

      const timeMatch = normalizedTime.match(
        /^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/
      );

      if (!timeMatch) {
        return null;
      }

      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const period = timeMatch[3];

      if (period === "pm" && hour !== 12) {
        hour += 12;
      }

      if (period === "am" && hour === 12) {
        hour = 0;
      }

      return new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        0
      );
    } catch (error) {
      return null;
    }
  }

  const weekdayCache = new Map();

  /*
    Preferred Date for a message: the parser already computed the epoch
    timestamp, so reuse it instead of re-parsing the date/time strings
    for every message (O(n) Date constructions saved per analysis).
  */
  function messageDate(message) {
    if (typeof message?.timestamp === "number") {
      return new Date(message.timestamp);
    }
    return parseDateTime(message?.date, message?.time);
  }

  /*
    ------------------------------------------------
    CONVERSATION STARTERS
    ------------------------------------------------

    A new conversation starts when:
    - It is the first message in the chat, OR
    - There has been at least 2 hours of inactivity.

    The person who sends that message is considered
    the conversation starter.
  */

  const CONVERSATION_GAP_MINUTES = 120;

  for (let i = 0; i < messages.length; i++) {
    const currentMessage = messages[i];

    let isConversationStart = false;

    // First message always starts a conversation
    if (i === 0) {
      isConversationStart = true;
    } else {
      const previousMessage = messages[i - 1];

      const previousDateTime = messageDate(
        previousMessage
      );

      const currentDateTime = messageDate(
        currentMessage
      );

      if (previousDateTime && currentDateTime) {
        const differenceMinutes =
          (currentDateTime.getTime() -
            previousDateTime.getTime()) /
          (1000 * 60);

        if (
          differenceMinutes >=
          CONVERSATION_GAP_MINUTES
        ) {
          isConversationStart = true;
        }
      }
    }

    if (isConversationStart) {
      const sender = currentMessage.sender;

      conversationStarters[sender] =
        (conversationStarters[sender] || 0) + 1;

      totalConversations++;
    }
  }

  /*
    ------------------------------------------------
    RESPONSE TIME
    ------------------------------------------------
  */

  for (let i = 1; i < messages.length; i++) {
    const previousMessage = messages[i - 1];
    const currentMessage = messages[i];

    if (
      previousMessage.sender === currentMessage.sender
    ) {
      continue;
    }

    const previousDateTime = messageDate(
      previousMessage
    );

    const currentDateTime = messageDate(
      currentMessage
    );

    if (!previousDateTime || !currentDateTime) {
      continue;
    }

    const differenceMs =
      currentDateTime.getTime() -
      previousDateTime.getTime();

    const differenceMinutes =
      differenceMs / (1000 * 60);

    // Ignore invalid or extremely long gaps.
    if (
      differenceMinutes < 0 ||
      differenceMinutes > 24 * 60
    ) {
      continue;
    }

    const responder = currentMessage.sender;

    // Directed reply pair (A answered by B within a conversation window)
    if (differenceMinutes <= CONVERSATION_GAP_MINUTES) {
      const pairKey = `${previousMessage.sender}|||${responder}`;
      pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
    }

    if (!responseDurationsByPerson[responder]) {
      responseDurationsByPerson[responder] = [];
    }
    responseDurationsByPerson[responder].push(differenceMinutes);

    if (!responseTimes[responder]) {
      responseTimes[responder] = {
        totalResponses: 0,
        totalResponseMinutes: 0,
        averageResponseMinutes: 0,
        fastestResponseMinutes: null,
      };
    }

    responseTimes[responder].totalResponses++;

    responseTimes[responder].totalResponseMinutes +=
      differenceMinutes;

    if (
      responseTimes[responder].fastestResponseMinutes ===
        null ||
      differenceMinutes <
        responseTimes[responder].fastestResponseMinutes
    ) {
      responseTimes[responder].fastestResponseMinutes =
        differenceMinutes;
    }

    if (
      !fastestResponse ||
      differenceMinutes <
        fastestResponse.responseMinutes
    ) {
      fastestResponse = {
        responder,
        responseMinutes: differenceMinutes,
        previousSender: previousMessage.sender,
        previousMessage: previousMessage.message,
        responseMessage: currentMessage.message,
        date: currentMessage.date,
        time: currentMessage.time,
      };
    }
  }

  // Calculate average response times
  for (const person of Object.keys(responseTimes)) {
    const data = responseTimes[person];

    data.averageResponseMinutes =
      data.totalResponses > 0
        ? Math.round(
            (data.totalResponseMinutes /
              data.totalResponses) *
              10
          ) / 10
        : 0;

    data.fastestResponseMinutes =
      data.fastestResponseMinutes !== null
        ? Math.round(
            data.fastestResponseMinutes * 10
          ) / 10
        : null;

    // Median is robust against a few very slow replies skewing the mean
    const durations = (
      responseDurationsByPerson[person] || []
    ).slice().sort((a, b) => a - b);

    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      const median =
        durations.length % 2 === 0
          ? (durations[mid - 1] + durations[mid]) / 2
          : durations[mid];
      data.medianResponseMinutes =
        Math.round(median * 10) / 10;
    } else {
      data.medianResponseMinutes = null;
    }

    delete data.totalResponseMinutes;
  }

  /*
    ------------------------------------------------
    MAIN ANALYTICS LOOP
    ------------------------------------------------
  */

  for (const msg of messages) {
    const text = msg.message || "";
    const sender = msg.sender;

    // Date range
    const msgDateTime =
      typeof msg.timestamp === "number"
        ? new Date(msg.timestamp)
        : parseDateTime(msg.date, msg.time);

    if (msgDateTime) {
      if (!firstDateTime || msgDateTime < firstDateTime) {
        firstDateTime = msgDateTime;
      }
      if (!lastDateTime || msgDateTime > lastDateTime) {
        lastDateTime = msgDateTime;
      }
    }

    // Messages per person
    messagesPerPerson[sender] =
      (messagesPerPerson[sender] || 0) + 1;

    /*
      Message length by person
    */
    if (!messageLengthByPerson[sender]) {
      messageLengthByPerson[sender] = {
        totalMessages: 0,
        totalCharacters: 0,
        averageMessageLength: 0,
        longestMessageLength: 0,
      };
    }

    const messageLength = text.length;

    messageLengthByPerson[sender].totalMessages++;

    messageLengthByPerson[sender].totalCharacters +=
      messageLength;

    if (
      messageLength >
      messageLengthByPerson[sender]
        .longestMessageLength
    ) {
      messageLengthByPerson[sender].longestMessageLength =
        messageLength;
    }

    // Total characters
    totalCharacters += messageLength;

    // Longest message
    if (
      !longestMessage ||
      messageLength > longestMessage.message.length
    ) {
      longestMessage = msg;
    }

    // Messages by date
    messagesByDate[msg.date] =
      (messagesByDate[msg.date] || 0) + 1;

    // Normalize time
    const normalizedTime = msg.time
      .replace(/\u202f/g, " ")
      .replace(/\u00a0/g, " ");

    // Messages by hour
    const hourMatch = normalizedTime.match(
      /^(\d{1,2}):/
    );

    if (hourMatch) {
      let hour = parseInt(hourMatch[1]);

      if (
        normalizedTime.toLowerCase().includes("pm") &&
        hour !== 12
      ) {
        hour += 12;
      }

      if (
        normalizedTime.toLowerCase().includes("am") &&
        hour === 12
      ) {
        hour = 0;
      }

      messagesByHour[hour] =
        (messagesByHour[hour] || 0) + 1;
    }

    // Messages by day (weekday cached per unique date string — chats
    // repeat the same date thousands of times)
    const dateTime = messageDate(msg);

    if (dateTime) {
      let dayName = weekdayCache.get(msg.date);

      if (!dayName) {
        dayName = dateTime.toLocaleDateString("en-US", {
          weekday: "long",
        });
        weekdayCache.set(msg.date, dayName);
      }

      messagesByDay[dayName] =
        (messagesByDay[dayName] || 0) + 1;
    }

    // Links
    const links = text.match(
      /https?:\/\/[^\s]+/gi
    );

    if (links) {
      totalLinks += links.length;
    }

    // Media
    if (
      text.includes("<Media omitted>") ||
      text.includes("image omitted") ||
      text.includes("video omitted") ||
      text.includes("audio omitted")
    ) {
      mediaMessages++;
    }

    // Deleted messages
    if (
      text
        .toLowerCase()
        .includes("this message was deleted")
    ) {
      deletedMessages++;
    }

    // Emoji counting (global + per person)
    for (const char of text) {
      if (
        /\p{Extended_Pictographic}/u.test(char)
      ) {
        emojiCounts[char] =
          (emojiCounts[char] || 0) + 1;

        if (!emojiCountsByPerson[sender]) {
          emojiCountsByPerson[sender] = 0;
        }
        emojiCountsByPerson[sender]++;
      }
    }

    // Word counting with stop-word filtering
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2 && !STOP_WORDS.has(word)
      );

    totalWords += words.length;

    if (!wordCountsByPerson[sender]) {
      wordCountsByPerson[sender] = {};
    }
    const personWords = wordCountsByPerson[sender];

    for (const word of words) {
      wordCounts[word] =
        (wordCounts[word] || 0) + 1;
      personWords[word] =
        (personWords[word] || 0) + 1;
    }
  }

  /*
    ------------------------------------------------
    MESSAGE LENGTH SUMMARY
    ------------------------------------------------
  */

  for (const person of Object.keys(
    messageLengthByPerson
  )) {
    const data = messageLengthByPerson[person];

    data.averageMessageLength =
      data.totalMessages > 0
        ? Math.round(
            data.totalCharacters /
              data.totalMessages
          )
        : 0;
  }

  const messageLengthEntries = Object.entries(
    messageLengthByPerson
  );

  const sortedMessageLengths =
    messageLengthEntries
      .sort(
        (a, b) =>
          b[1].averageMessageLength -
          a[1].averageMessageLength
      )
      .map(([person, data]) => ({
        person,
        totalMessages: data.totalMessages,
        totalCharacters: data.totalCharacters,
        averageMessageLength:
          data.averageMessageLength,
        longestMessageLength:
          data.longestMessageLength,
      }));

  const longestAverageMessageSender =
    sortedMessageLengths.length > 0
      ? sortedMessageLengths[0]
      : null;

  /*
    ------------------------------------------------
    SORTED RESULTS
    ------------------------------------------------
  */

  const topEmojis = Object.entries(emojiCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({
      emoji,
      count,
    }));

  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({
      word,
      count,
    }));

  /*
    ------------------------------------------------
    CONVERSATION STARTER SUMMARY
    ------------------------------------------------
  */

  const starterEntries = Object.entries(
    conversationStarters
  );

  const sortedConversationStarters =
    starterEntries
      .sort((a, b) => b[1] - a[1])
      .map(([person, count]) => ({
        person,
        count,
        percentage:
          totalConversations > 0
            ? Math.round(
                (count / totalConversations) * 100
              )
            : 0,
      }));

  const topConversationStarter =
    sortedConversationStarters.length > 0
      ? sortedConversationStarters[0]
      : null;

  /*
    ------------------------------------------------
    AVERAGE MESSAGE LENGTH
    ------------------------------------------------
  */

  const averageMessageLength =
    totalMessages > 0
      ? Math.round(
          totalCharacters / totalMessages
        )
      : 0;

  /*
    ------------------------------------------------
    INTERACTIONS / MONTHLY TRENDS / PER-PERSON WORDS
    ------------------------------------------------
  */

  const topInteractions = Object.entries(pairCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pair, count]) => {
      const [from, to] = pair.split("|||");
      return { from, to, count };
    });

  const monthlyTrends = Object.entries(messagesByDate)
    .map(([dateKey, count]) => {
      const parts = dateKey.split("/");
      if (parts.length !== 3) return null;
      const monthKey = `${parts[2]}-${String(parts[1]).padStart(2, "0")}`;
      return { monthKey, count };
    })
    .filter(Boolean)
    .reduce((acc, { monthKey, count }) => {
      acc[monthKey] = (acc[monthKey] || 0) + count;
      return acc;
    }, {});

  const monthlyTrendList = Object.entries(monthlyTrends)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));

  const wordsByPerson = {};
  for (const person of Object.keys(wordCountsByPerson)) {
    wordsByPerson[person] = Object.entries(wordCountsByPerson[person])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }

  /*
    ------------------------------------------------
    RETURN ANALYTICS
    ------------------------------------------------
  */

  const durationMs =
    firstDateTime && lastDateTime
      ? lastDateTime.getTime() - firstDateTime.getTime()
      : 0;

  return {
    overview: {
      totalMessages,
      totalParticipants: participants.length,
      participants,
      averageMessageLength,
      totalCharacters,
      totalWords,
      totalLinks,
      mediaMessages,
      deletedMessages,
      dateRange: {
        firstDate: firstDateTime
          ? firstDateTime.toLocaleDateString("en-GB")
          : null,
        lastDate: lastDateTime
          ? lastDateTime.toLocaleDateString("en-GB")
          : null,
        durationDays: Math.round(durationMs / (1000 * 60 * 60 * 24)),
      },
    },

    messagesPerPerson,

    activity: {
      messagesByDate,
      messagesByHour,
      messagesByDay,
    },

    responseTime: {
      byPerson: responseTimes,
      fastestResponse,
    },

    conversationStarters: {
      totalConversations,
      byPerson: sortedConversationStarters,
      topStarter: topConversationStarter,
    },

    messageLength: {
      byPerson: sortedMessageLengths,
      longestAverageMessageSender,
    },

    longestMessage,

    topEmojis,
    topWords,
    emojisPerPerson: emojiCountsByPerson,

    interactions: {
      topPairs: topInteractions,
    },

    monthlyTrends: monthlyTrendList,

    wordsByPerson,
  };
}

module.exports = calculateAnalytics;