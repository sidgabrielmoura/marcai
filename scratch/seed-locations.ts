import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  console.log("Atualizando unidades com endereços reais brasileiros...");

  // 1. Alpha Varejo
  const alpha = await prisma.organization.findUnique({
    where: { slug: "alpha-varejo" },
    include: { locations: true },
  });
  if (alpha) {
    if (alpha.locations[0]) {
      await prisma.location.update({
        where: { id: alpha.locations[0].id },
        data: {
          name: "Matriz - Av. Paulista",
          address: "Av. Paulista, 1000 - Bela Vista, São Paulo/SP",
        },
      });
    }
    if (alpha.locations[1]) {
      await prisma.location.update({
        where: { id: alpha.locations[1].id },
        data: {
          name: "Filial 02 - Shopping Iguatemi",
          address: "Av. Faria Lima, 2232 - Jardim Paulistano, São Paulo/SP",
        },
      });
    }
    if (alpha.locations.length < 3) {
      await prisma.location.create({
        data: {
          organizationId: alpha.id,
          name: "Filial 03 - Shopping Campinas",
          address: "Av. Iguatemi, 777 - Vila Brandina, Campinas/SP",
          status: "ACTIVE",
          timezone: "America/Sao_Paulo",
        },
      });
    }
  }

  // 2. Beta Serviços
  const beta = await prisma.organization.findUnique({
    where: { slug: "beta-servicos" },
    include: { locations: true },
  });
  if (beta && beta.locations.length === 0) {
    await prisma.location.create({
      data: {
        organizationId: beta.id,
        name: "Matriz - Centro Empresarial RJ",
        address: "Av. Rio Branco, 156 - Centro, Rio de Janeiro/RJ",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });
    await prisma.location.create({
      data: {
        organizationId: beta.id,
        name: "Filial Niterói Icaraí",
        address: "R. Cel. Moreira César, 229 - Icaraí, Niterói/RJ",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });
  }

  // 3. Empresa Piloto
  const piloto = await prisma.organization.findFirst({
    where: { slug: { contains: "trial" } },
    include: { locations: true },
  });
  if (piloto) {
    if (piloto.locations[0]) {
      await prisma.location.update({
        where: { id: piloto.locations[0].id },
        data: {
          name: "Matriz Curitiba XV",
          address: "R. XV de Novembro, 700 - Centro, Curitiba/PR",
        },
      });
    }
    if (piloto.locations.length < 2) {
      await prisma.location.create({
        data: {
          organizationId: piloto.id,
          name: "Filial Batel Prime",
          address: "Av. do Batel, 1868 - Batel, Curitiba/PR",
          status: "ACTIVE",
          timezone: "America/Sao_Paulo",
        },
      });
    }
  }

  // 4. Org Retenção 1
  const r1 = await prisma.organization.findFirst({
    where: { slug: "org-retencao-mv6typz2" },
    include: { locations: true },
  });
  if (r1 && r1.locations.length === 0) {
    await prisma.location.create({
      data: {
        organizationId: r1.id,
        name: "Sede Operacional Savassi",
        address: "Av. Afonso Pena, 1500 - Savassi, Belo Horizonte/MG",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });
  }

  // 5. Org Retenção 2
  const r2 = await prisma.organization.findFirst({
    where: { slug: "org-retencao-mv6u2tb3" },
    include: { locations: true },
  });
  if (r2 && r2.locations.length === 0) {
    await prisma.location.create({
      data: {
        organizationId: r2.id,
        name: "Unidade Beira-Mar",
        address: "Av. Beira-Mar Norte, 2000 - Centro, Florianópolis/SC",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });
  }

  // 6. Org Retenção 3
  const r3 = await prisma.organization.findFirst({
    where: { slug: "org-retencao-mv6u610c" },
    include: { locations: true },
  });
  if (r3 && r3.locations.length === 0) {
    await prisma.location.create({
      data: {
        organizationId: r3.id,
        name: "Unidade Moinhos & Praia de Belas",
        address: "Av. Borges de Medeiros, 1501 - Praia de Belas, Porto Alegre/RS",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });
  }

  console.log("Unidades e endereços cadastrados e persistidos com sucesso!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
