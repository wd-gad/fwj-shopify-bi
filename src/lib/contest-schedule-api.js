const { prisma } = require("./prisma.js");

async function listContestSchedules(filters = {}) {
  const where = {};

  if (filters.year) {
    const year = Number(filters.year);
    where.eventDate = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1))
    };
  }

  if (filters.status) {
    where.status = filters.status;
  }

  const schedules = await prisma.contestSchedule.findMany({
    where,
    orderBy: { eventDate: "asc" }
  });

  return schedules;
}

async function getContestSchedule(id) {
  return prisma.contestSchedule.findUnique({ where: { id } });
}

async function createContestSchedule(data) {
  return prisma.contestSchedule.create({
    data: {
      eventDate: new Date(data.eventDate),
      contestName: data.contestName,
      venueName: data.venueName || null,
      nearestStation: data.nearestStation || null,
      address: data.address || null,
      phoneNumber: data.phoneNumber || null,
      oneWayFare: data.oneWayFare || null,
      travelMode: data.travelMode || null,
      travelTime: data.travelTime || null,
      requiresHotel: data.requiresHotel ?? null,
      preTravelDate: data.preTravelDate ? new Date(data.preTravelDate) : null,
      travelDescription: data.travelDescription || null,
      status: data.status || "confirmed",
      source: data.source || "admin-manual"
    }
  });
}

async function updateContestSchedule(id, data) {
  const existing = await prisma.contestSchedule.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  const update = {};

  if (data.eventDate !== undefined) {
    update.eventDate = new Date(data.eventDate);
  }
  if (data.contestName !== undefined) {
    update.contestName = data.contestName;
  }
  if (data.venueName !== undefined) {
    update.venueName = data.venueName || null;
  }
  if (data.nearestStation !== undefined) {
    update.nearestStation = data.nearestStation || null;
  }
  if (data.address !== undefined) {
    update.address = data.address || null;
  }
  if (data.phoneNumber !== undefined) {
    update.phoneNumber = data.phoneNumber || null;
  }
  if (data.oneWayFare !== undefined) {
    update.oneWayFare = data.oneWayFare || null;
  }
  if (data.travelMode !== undefined) {
    update.travelMode = data.travelMode || null;
  }
  if (data.travelTime !== undefined) {
    update.travelTime = data.travelTime || null;
  }
  if (data.requiresHotel !== undefined) {
    update.requiresHotel = data.requiresHotel;
  }
  if (data.preTravelDate !== undefined) {
    update.preTravelDate = data.preTravelDate ? new Date(data.preTravelDate) : null;
  }
  if (data.travelDescription !== undefined) {
    update.travelDescription = data.travelDescription || null;
  }
  if (data.status !== undefined) {
    update.status = data.status;
  }

  // Auto-confirm draft records when date is changed from placeholder
  const effectiveStatus = update.status ?? existing.status;
  if (effectiveStatus === "draft" && update.eventDate) {
    const isPlaceholder =
      existing.eventDate.getUTCMonth() === 0 && existing.eventDate.getUTCDate() === 1;
    if (isPlaceholder) {
      update.status = "confirmed";
    }
  }

  return prisma.contestSchedule.update({ where: { id }, data: update });
}

async function deleteContestSchedule(id) {
  const existing = await prisma.contestSchedule.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }
  await prisma.contestSchedule.delete({ where: { id } });
  return existing;
}

module.exports = {
  listContestSchedules,
  getContestSchedule,
  createContestSchedule,
  updateContestSchedule,
  deleteContestSchedule
};
