import { PrismaClient } from '../src/generated/prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create Mailers
  const salma = await prisma.mailer.create({ data: { name: 'Salma EL KARTIT' } });
  const jaafar = await prisma.mailer.create({ data: { name: 'Jaafar LAAKEL HEMDANOU' } });
  const ayoub = await prisma.mailer.create({ data: { name: 'Ayoub GHAILAN' } });
  const inssaf = await prisma.mailer.create({ data: { name: 'Inssaf EL HAOUASS' } });
  const reda = await prisma.mailer.create({ data: { name: 'Reda' } });

  // Create some revenues for this month
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  await prisma.revenue.create({ data: { amount: 3059.00, date: startOfMonth, mailerId: salma.id } });
  await prisma.revenue.create({ data: { amount: 2662.00, date: startOfMonth, mailerId: jaafar.id } });
  await prisma.revenue.create({ data: { amount: 2068.50, date: startOfMonth, mailerId: ayoub.id } });
  
  // Create a today revenue for Inssaf to make today's revenue match the image ($450)
  // Wait, Inssaf total is 1927. Let's split it: 1477 earlier this month, 450 today
  await prisma.revenue.create({ data: { amount: 1477.00, date: startOfMonth, mailerId: inssaf.id } });
  await prisma.revenue.create({ data: { amount: 450.00, date: today, mailerId: inssaf.id } });

  console.log('Database seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
