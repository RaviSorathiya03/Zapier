import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create a user
  const user = await prisma.user.create({
    data: {
      name: "John Doe",
      email: "johndoe@example.com",
      password: "securepassword",
    },
  });

  // Create Available Trigger
  const availableTrigger = await prisma.availableTrigger.create({
    data: {
      name: "New Email Received",
      image: "trigger-image-url",
    },
  });

  // Create Available Action
  const availableAction = await prisma.availableAction.create({
    data: {
      name: "Send Slack Message",
      image: "action-image-url",
    },
  });

  // Create a Zap
  const zap = await prisma.zap.create({
    data: {
      userId: user.id,
      triggerId: availableTrigger.id,
    },
  });

  // Create a Trigger
  const trigger = await prisma.trigger.create({
    data: {
      zapId: zap.id,
      triggerId: availableTrigger.id,
      metadata: {},
    },
  });

  // Create an Action
  const action = await prisma.action.create({
    data: {
      zapId: zap.id,
      actionId: availableAction.id,
      metadata: {},
      sortingOrder: 1,
    },
  });

  // Create a ZapRun
  const zapRun = await prisma.zapRun.create({
    data: {
      zapId: zap.id,
      metadata: { status: "pending" },
    },
  });

  // Create a ZapRunOutbox
  await prisma.zapRunOutbox.create({
    data: {
      zapRunId: zapRun.id,
    },
  });

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
