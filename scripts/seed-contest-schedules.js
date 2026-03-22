const path = require("path");
const fs = require("fs");
const { prisma } = require("../src/lib/prisma.js");

async function seedContestSchedules() {
  const jsonPath = path.join(__dirname, "../data/contest-schedules.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("[seed] contest-schedules.json not found, skipping");
    return;
  }

  const schedules = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  let upserted = 0;
  for (const schedule of schedules) {
    const eventDate = new Date(schedule.eventDate);
    if (Number.isNaN(eventDate.getTime())) continue;

    await prisma.contestSchedule.upsert({
      where: {
        contestName_eventDate: {
          contestName: schedule.contestName,
          eventDate,
        },
      },
      update: {
        venueName: schedule.venueName ?? null,
        nearestStation: schedule.nearestStation ?? null,
        address: schedule.address ?? null,
      },
      create: {
        eventDate,
        contestName: schedule.contestName,
        venueName: schedule.venueName ?? null,
        nearestStation: schedule.nearestStation ?? null,
        address: schedule.address ?? null,
      },
    });
    upserted++;
  }

  console.log(`[seed] contest schedules: ${upserted} upserted`);
}

module.exports = { seedContestSchedules };

// Run directly if called as a script
if (require.main === module) {
  seedContestSchedules()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    });
}
