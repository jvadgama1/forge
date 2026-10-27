// The Log tab's one-time line about a workout finished automatically (#45):
// "Sunday's workout was finished at 7:42 pm. 5 exercises, 18 sets."
import { MONTHS, countOf, pad2 } from "./screen.js";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * @param {object} finished
 * @param {string} finished.date The workout's local date, YYYY-MM-DD.
 * @param {number} finished.daysAgo Calendar days since that date.
 * @param {Date} finished.finishedAt
 * @param {number} finished.exercises
 * @param {number} finished.sets
 */
export function autoFinishedLine({
  date,
  daysAgo,
  finishedAt,
  exercises,
  sets,
}) {
  const [year, month, day] = date.split("-").map(Number);
  const dated = new Date(year, month - 1, day);
  const whose =
    daysAgo === 0
      ? "Today's workout"
      : daysAgo === 1
        ? "Yesterday's workout"
        : daysAgo > 1 && daysAgo < 7
          ? `${WEEKDAYS[dated.getDay()]}'s workout`
          : `Your ${day} ${MONTHS[month - 1]} workout`;
  return `${whose} was finished at ${clockTime(finishedAt)}. ${countOf(exercises, "exercise")}, ${countOf(sets, "set")}.`;
}

/**
 * "7:42 pm", "12:05 am".
 * @param {Date} time
 */
function clockTime(time) {
  const hour = time.getHours() % 12 || 12;
  return `${hour}:${pad2(time.getMinutes())} ${time.getHours() < 12 ? "am" : "pm"}`;
}
