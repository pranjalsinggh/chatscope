const fs = require("fs");

/**
 * WhatsApp export formats supported:
 *
 *   23/08/25, 10:43 pm - Aditi: Hello
 *   23/08/2025, 22:43 - Aditi: Hello
 *   23/08/25, 10:43:15 pm - Aditi: Hello
 *   [23/08/25, 10:43:15 PM] Aditi: Hello
 *   23.08.25, 10:43 - Aditi: Hello        (dot-separated dates)
 *   23/08/25, 10:43 pm - Aditi Singh: Hello
 *
 * Lines that are not new messages (continuations, quotes, system notices
 * without a timestamp) are attached to the current message.
 */

// LTR mark / narrow nbsp / nbsp are treated as plain spaces everywhere.
function cleanLine(line) {
  return line.replace(/\u202f|\u00a0|\u200e|\u200f/g, " ");
}

const TIMESTAMP_SOURCE =
  "(\\d{1,2})[\\/\\.-](\\d{1,2})[\\/\\.-](\\d{2,4}),\\s*(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([ap]\\.?m\\.?)?";

const MESSAGE_LINE_REGEX = new RegExp(
  `^\\[?${TIMESTAMP_SOURCE}\\]?\\s*(?:-|\\u2013|\\u2014)?\\s*([^:]{1,60}?):\\s*([\\s\\S]*)$`,
  "i"
);

// ISO-style export (some locales): [2025-07-18, 22:12:34] Name: Hello
const ISO_TIMESTAMP_SOURCE =
  "(\\d{4})-(\\d{1,2})-(\\d{1,2})[,\\s]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([ap]\\.?m\\.?)?";

const ISO_MESSAGE_LINE_REGEX = new RegExp(
  `^\\[?${ISO_TIMESTAMP_SOURCE}\\]?\\s*(?:-|\\u2013|\\u2014)?\\s*([^:]{1,60}?):\\s*([\\s\\S]*)$`,
  "i"
);

// Timestamped lines that carry no "Sender:" part are system notifications.
const SYSTEM_LINE_REGEX = new RegExp(
  `^\\[?${TIMESTAMP_SOURCE}\\]?\\s*(?:-|\\u2013|\\u2014)?\\s*([^:].*)$`,
  "i"
);

const ISO_SYSTEM_LINE_REGEX = new RegExp(
  `^\\[?${ISO_TIMESTAMP_SOURCE}\\]?\\s*(?:-|\\u2013|\\u2014)?\\s*([^:].*)$`,
  "i"
);

const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created group|added|removed|left|joined|changed the subject|changed (this group|the group)|changed their phone number/i,
  /missed (voice|video) call/i,
  /(voice|video) call/i,
  /security code changed/i,
  /deleted this message|this message was deleted/i,
  /<media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|gif omitted/i,
  /chat is now protected|you blocked|unblocked/i,
];

const MEDIA_PATTERN = /<media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|gif omitted/i;
const DELETED_PATTERN = /this message was deleted|you deleted this message/i;
const LINK_PATTERN = /https?:\/\/[^\s]+/gi;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function to24Hour(hourText, minuteText, periodText) {
  let hour = parseInt(hourText, 10);
  const minute = parseInt(minuteText, 10);

  const period = periodText ? periodText.replace(/\./g, "").toLowerCase() : null;

  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  return { hour, minute };
}

// dd/mm/yyyy (WhatsApp default outside the US) with a 2-digit-year upgrade.
function buildDate(dayText, monthText, yearText) {
  let day = parseInt(dayText, 10);
  let month = parseInt(monthText, 10);
  let year = parseInt(yearText, 10);
  if (year < 100) year += 2000;

  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }

  return { day, month, year };
}

function buildTimestamp(date, clock) {
  const timestamp = new Date(
    date.year,
    date.month - 1,
    date.day,
    clock.hour,
    clock.minute,
    0,
    0
  );

  return isNaN(timestamp.getTime()) ? null : timestamp;
}

function formatClock(clock) {
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDate(date) {
  return `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}`;
}

function looksLikeSystemNotice(text) {
  return SYSTEM_PATTERNS.some((pattern) => pattern.test(text));
}

function parseWhatsAppChatText(content) {
  const lines = content.split(/\r?\n/);

  const messages = [];
  let current = null;

  const pushCurrent = () => {
    if (current) {
      current.message = current.message.trim();
      if (current.message.length > 0) messages.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    let match = line.match(MESSAGE_LINE_REGEX);

    // ISO-style export: rewrite the timestamp into dd/mm/yyyy shape so
    // the shared handling below applies unchanged.
    if (!match) {
      const isoMatch = line.match(ISO_MESSAGE_LINE_REGEX);
      if (isoMatch) {
        const [, y, m, d, hh, mm] = isoMatch;
        const rewritten = line.replace(
          isoMatch[0].split(isoMatch[8])[0],
          `${d}/${m}/${y}, ${hh}:${mm}${isoMatch[6] ? ":" + isoMatch[6] : ""} ${isoMatch[7] || ""} `
        );
        match = rewritten.match(MESSAGE_LINE_REGEX);
      }
    }

    if (match) {
      const [, d, m, y, hh, mm, , period, sender, body] = match;

      const date = buildDate(d, m, y);
      const clock = to24Hour(hh, mm, period);
      const timestamp = buildTimestamp(date, clock);

      pushCurrent();

      current = {
        date: formatDate(date),
        time: formatClock(clock),
        timestamp: timestamp ? timestamp.getTime() : null,
        sender: sender.trim(),
        message: body,
      };
      continue;
    }

    // Timestamped system line (no "Sender:" part)
    let systemMatch = SYSTEM_LINE_REGEX.test(line);

    if (!systemMatch) {
      const isoSystem = line.match(ISO_SYSTEM_LINE_REGEX);
      if (isoSystem) {
        const [, y, m, d, hh, mm] = isoSystem;
        const rewritten = `${d}/${m}/${y}, ${hh}:${mm}${isoSystem[6] ? ":" + isoSystem[6] : ""} ${isoSystem[7] || ""} ${isoSystem[8]}`;
        systemMatch = SYSTEM_LINE_REGEX.test(rewritten);
      }
    }

    if (systemMatch) {
      pushCurrent();
      continue;
    }

    // Continuation of the previous message (multiline body)
    if (current && line.trim() !== "") {
      current.message += "\n" + line.trim();
    }
  }

  pushCurrent();

  // Enrichment pass: stable ids + normalized flags
  return messages.map((msg, index) => {
    const text = msg.message || "";

    return {
      id: index,
      date: msg.date,
      time: msg.time,
      timestamp: msg.timestamp,
      sender: msg.sender,
      message: text,
      messageLength: text.length,
      emojis: text.match(EMOJI_PATTERN) || [],
      links: text.match(LINK_PATTERN) || [],
      isMedia: MEDIA_PATTERN.test(text),
      isDeleted: DELETED_PATTERN.test(text),
      isSystem: looksLikeSystemNotice(text),
    };
  });
}

function parseWhatsAppChat(filePath) {
  return parseWhatsAppChatText(fs.readFileSync(filePath, "utf-8"));
}

module.exports = { parseWhatsAppChatText, parseWhatsAppChat };
