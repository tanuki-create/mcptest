import { calendar_v3 } from 'googleapis';

interface TimeInterval {
  start: Date;
  end: Date;
}

// Scheduling Constants (adjust as needed)
const WORK_DAY_START_HOUR = 9;
const WORK_DAY_END_HOUR = 17;
const BUFFER_MINUTES = 15;
const MAX_SCHEDULE_DAYS = 7; // Look for slots within the next 7 days

/**
 * Checks if a given date falls within working hours (Mon-Fri, 9am-5pm).
 * @param date The date to check.
 * @param startHour Work start hour.
 * @param endHour Work end hour.
 * @returns True if within working hours, false otherwise.
 */
function isWithinWorkingHours(date: Date, startHour: number, endHour: number): boolean {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = date.getHours();
  return day >= 1 && day <= 5 && hour >= startHour && hour < endHour;
}

/**
 * Finds the earliest available time slot for a task.
 * @param searchStartTime The time from which to start searching.
 * @param durationMinutes The duration of the task in minutes.
 * @param busyTimes An array of busy time intervals.
 * @param workStartHour Start hour of the working day.
 * @param workEndHour End hour of the working day.
 * @param bufferMinutes Buffer time to add after the task.
 * @param searchEndDate The latest possible end time for the task.
 * @returns A TimeInterval object if a slot is found, otherwise null.
 */
export function findEarliestFitSlot(
  searchStartTime: Date,
  durationMinutes: number,
  busyTimes: TimeInterval[],
  workStartHour: number = WORK_DAY_START_HOUR,
  workEndHour: number = WORK_DAY_END_HOUR,
  bufferMinutes: number = BUFFER_MINUTES,
  searchEndDate: Date
): TimeInterval | null {
  let currentTryTime = new Date(searchStartTime.getTime());
  const totalDurationMs = (durationMinutes + bufferMinutes) * 60000;

  while (currentTryTime < searchEndDate) {
    const potentialEndTime = new Date(currentTryTime.getTime() + totalDurationMs);

    // 1. Check if potential slot is within the search end date
    if (potentialEndTime > searchEndDate) {
      return null; // No slot found within the search range
    }

    // 2. Check if the *entire* slot is within working hours
    // Check start time
    if (!isWithinWorkingHours(currentTryTime, workStartHour, workEndHour)) {
      // Move to the start of the next working day
      currentTryTime.setHours(workStartHour, 0, 0, 0);
      if (currentTryTime.getDay() === 5) { // If Friday, move to Monday
        currentTryTime.setDate(currentTryTime.getDate() + 3);
      } else if (currentTryTime.getDay() === 6) { // If Saturday, move to Monday
        currentTryTime.setDate(currentTryTime.getDate() + 2);
      } else { // Otherwise, just move to the next day
        currentTryTime.setDate(currentTryTime.getDate() + 1);
      }
      continue; // Re-evaluate from the start of the next working day
    }
     // Check end time (must end before workEndHour)
    if (potentialEndTime.getHours() > workEndHour || 
        (potentialEndTime.getHours() === workEndHour && potentialEndTime.getMinutes() > 0) ||
         potentialEndTime.getDate() !== currentTryTime.getDate() ) { // Must end on the same day it starts (within working hours)
      // Move to the start of the next working day (logic same as above)
      currentTryTime.setHours(workStartHour, 0, 0, 0);
      if (currentTryTime.getDay() === 5) { currentTryTime.setDate(currentTryTime.getDate() + 3); }
      else if (currentTryTime.getDay() === 6) { currentTryTime.setDate(currentTryTime.getDate() + 2); }
      else { currentTryTime.setDate(currentTryTime.getDate() + 1); }
      continue;
    }


    // 3. Check for conflicts with busy times
    let conflict = false;
    for (const busySlot of busyTimes) {
      // Check for overlap: (BusyStart < PotentialEnd) && (BusyEnd > PotentialStart)
      if (busySlot.start < potentialEndTime && busySlot.end > currentTryTime) {
        conflict = true;
        // Move the try time to the end of the conflicting busy slot
        currentTryTime = new Date(busySlot.end.getTime());
        break; // Re-evaluate from the new currentTryTime
      }
    }

    if (!conflict) {
      // Found a slot!
      return {
        start: currentTryTime,
        // End time excludes the buffer for the actual event duration
        end: new Date(currentTryTime.getTime() + durationMinutes * 60000),
      };
    }

    // If conflict, the loop continues from the updated currentTryTime
  }

  return null; // No suitable slot found
} 