const { prisma } = require("../src/lib/prisma.js");
const {
  buildEventEntries,
  buildMemberProfile,
  buildMembershipPurchases,
  extractMembershipProfileAttributes
} = require("../src/lib/member-analytics.js");

function derivePrefectureFromAddress(addressJson) {
  if (!addressJson || typeof addressJson !== "object") {
    return null;
  }
  return addressJson.province ?? null;
}

async function rebuildMember(member) {
  const orders = await prisma.shopifyOrder.findMany({
    where: { customerId: member.shopifyCustomerId ?? undefined },
    orderBy: { orderedAt: "asc" },
    include: {
      items: {
        include: {
          product: {
            include: {
              classification: true
            }
          }
        }
      }
    }
  });

  const classifiedItems = orders.flatMap((order) =>
    order.items.map((item) => ({
      id: item.id,
      orderId: order.id,
      title: item.title,
      quantity: item.quantity,
      classification: item.product?.classification?.classification ?? "normal_product",
      eventName: item.product?.classification?.eventName ?? null,
      eventDate: item.product?.classification?.eventDate ?? null,
      eventCategory: item.product?.classification?.eventCategory ?? null,
      eventVenueName: item.product?.classification?.eventVenueName ?? null,
      eventAddress: item.product?.classification?.eventAddress ?? null,
      membershipPlanName: item.product?.classification?.membershipPlanName ?? null,
      customAttributes: item.rawJson?.customAttributes ?? []
    }))
  );

  const membershipPurchases = buildMembershipPurchases({
    memberId: member.id,
    orders,
    classifiedItems
  });

  const eventEntries = buildEventEntries({
    memberId: member.id,
    orders,
    classifiedItems
  });

  const overrides = member.attributeOverride ?? {};
  const membershipProfile = extractMembershipProfileAttributes(classifiedItems, orders);
  const customer = member.shopifyCustomer
    ? {
        id: member.shopifyCustomer.id,
        email: member.shopifyCustomer.email,
        firstName: member.shopifyCustomer.firstName,
        lastName: member.shopifyCustomer.lastName,
        gender: null,
        birthDate: null,
        prefecture: derivePrefectureFromAddress(member.shopifyCustomer.defaultAddressJson)
      }
    : null;

  const profile = buildMemberProfile(customer, membershipPurchases, overrides, membershipProfile);

  await prisma.$transaction(async (tx) => {
    await tx.membershipPurchase.deleteMany({
      where: { memberId: member.id }
    });
    await tx.eventEntry.deleteMany({
      where: { memberId: member.id }
    });

    if (membershipPurchases.length > 0) {
      await tx.membershipPurchase.createMany({
        data: membershipPurchases
      });
    }

    if (eventEntries.length > 0) {
      await tx.eventEntry.createMany({
        data: eventEntries
      });
    }

    await tx.memberProfile.update({
      where: { id: member.id },
      data: profile
    });
  }, { timeout: 60000, maxWait: 10000 });
}

async function main() {
  const customers = await prisma.shopifyCustomer.findMany({
    include: {
      memberProfiles: {
        include: {
          attributeOverride: true,
          shopifyCustomer: true
        }
      }
    }
  });

  let rebuilt = 0;

  for (const customer of customers) {
    const member =
      customer.memberProfiles[0] ??
      (await prisma.memberProfile.create({
        data: {
          shopifyCustomerId: customer.id,
          email: customer.email ?? null,
          fullName: [customer.lastName, customer.firstName].filter(Boolean).join(" ") || null
        },
        include: {
          attributeOverride: true,
          shopifyCustomer: true
        }
      }));

    await rebuildMember(member);
    rebuilt += 1;
  }

  console.log(`Analytics rebuild completed for ${rebuilt} members.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
