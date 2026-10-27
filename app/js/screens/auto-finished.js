// The Log tab's one-time line about a workout finished automatically (#45):
// "Sunday's workout was finished at 7:42 pm. 5 exercises, 18 sets."
import { countOf } from "./screen.js";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * @param {object} finished
 * @param {string} finished.date The workout's local date, YYYY-MM-DD.
 * @param {Date} finished.finishedAt
 * @param {number} finished.exercises
 * @param {number} finished.sets
 * @param {Date} finished.now
 */
export function autoFinishedLine({ date, finishedAt, exercises, sets, now }) {
  const [year, month, day] = date.split("-").map(Number);
  const dated = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Calendar days apart; rounding absorbs a daylight-saving hour.
  const daysAgo = Math.round((today.getTime() - dated.getTime()) / 86_400_000);
  const whose =
    daysAgo === 0
      ? "Today's workout"
      : daysAgo === 1
        ? "Yesterday's workout"
        : daysAgo < 7
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
  const minute = String(time.getMinutes()).padStart(2, "0");
  return `${hour}:${minute} ${time.getHours() < 12 ? "am" : "pm"}`;
}
