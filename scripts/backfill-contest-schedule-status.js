/**
 * One-time backfill script: sets status and source on existing ContestSchedule rows.
 *
 * - Records with venue/address and non-Jan-1 dates → confirmed / json-seed
 * - Records with Jan-1 placeholder dates → draft / shopify-auto
 * - Already-set records are skipped
 */
const { prisma } = require("../src/lib/prisma.js");

async function main() {
  const schedules = await prisma.contestSchedule.findMany();
  let confirmed = 0;
  let drafted = 0;

  for (const schedule of schedules) {
    // Skip if already has source set (already backfilled)
    if (schedule.source) continue;

    const isPlaceholder =
      schedule.eventDate.getUTCMonth() === 0 && schedule.eventDate.getUTCDate() === 1;

    if (isPlaceholder) {
      await prisma.contestSchedule.update({
        where: { id: schedule.id },
        data: { status: "draft", source: "shopify-auto" }
      });
      drafted++;
    } else {
      await prisma.contestSchedule.update({
        where: { id: schedule.id },
        data: { status: "confirmed", source: "json-seed" }
      });
      confirmed++;
    }
  }

  console.log(`Backfill complete: ${confirmed} confirmed, ${drafted} draft`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
