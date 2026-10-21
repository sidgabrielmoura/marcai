import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import catalogData from "@/infrastructure/templates/catalog-data.json";
import { reusableTemplateDraftSchema } from "@/domain/rules/reusable-template-definition";

export const DEFAULT_BUSINESS_SEGMENTS = [
  {
    name: "Restaurante e Alimentação",
    slug: "restaurante",
    description: "Restaurantes, bares, lanchonetes, padarias e operações de alimentação.",
    catalogJobKey: "FOOD",
  },
  {
    name: "Loja de Calçados",
    slug: "loja-de-calcados",
    description: "Lojas de calçados, calçadistas e acessórios de vestuário.",
    catalogJobKey: "RETAIL",
  },
  {
    name: "Varejo e Comércio",
    slug: "varejo",
    description: "Comércio varejista geral, supermercados e lojas físicas.",
    catalogJobKey: "RETAIL",
  },
  {
    name: "Limpeza e Facilities",
    slug: "limpeza-e-facilities",
    description: "Serviços de limpeza, higienização de ambientes e conservação predial.",
    catalogJobKey: "FACILITIES",
  },
  {
    name: "Estoque e Logística",
    slug: "estoque-e-logistica",
    description: "Armazenamento, expedição, conferência de carga e logística de distribuição.",
    catalogJobKey: "LOGISTICS",
  },
  {
    name: "Manutenção e Serviços",
    slug: "manutencao-e-servicos",
    description: "Manutenção preventiva e corretiva de equipamentos, infraestrutura e instalações.",
    catalogJobKey: "MAINTENANCE",
  },
] as const;

export function slugifySegment(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const businessSegmentInputSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const platformTemplateInputSchema = z.object({
  segmentId: z.string().min(1, "Segmento obrigatório."),
  name: z.string().trim().min(2, "Nome do template deve ter pelo menos 2 caracteres.").max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  tasks: z.array(z.any()).min(1, "Adicione pelo menos 1 etapa ao template."),
  teamSlots: z.array(z.any()).default([{ id: "team-1", label: "Operação" }]),
  memberSlots: z.array(z.any()).default([{ id: "approver-1", label: "Gestor", kind: "APPROVER" }]),
  schedule: z.any().nullable().default(null),
});

export type BusinessSegmentWithCounts = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    templates: number;
    organizations: number;
  };
};

export type PlatformTemplateModel = {
  id: string;
  segmentId: string;
  segmentName?: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  definition: any;
  createdAt: string;
  updatedAt: string;
};

/**
 * Garante que os segmentos padrão e templates iniciais estejam populados no banco de dados.
 */
export async function ensureDefaultSegmentsAndTemplates(): Promise<void> {
  const count = await prisma.platformBusinessSegment.count();
  if (count > 0) return;

  for (const def of DEFAULT_BUSINESS_SEGMENTS) {
    const segment = await prisma.platformBusinessSegment.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        name: def.name,
        slug: def.slug,
        description: def.description,
        status: "ACTIVE",
      },
    });

    // Encontrar templates do catalog-data para associar a este segmento
    const matchingTemplates = catalogData.filter(
      (item) => item.definition && (item.definition as any).jobKey === def.catalogJobKey
    );

    for (const item of matchingTemplates) {
      const parsedDef = (item.definition as any) || {};
      const templateName = parsedDef.name || "Template";
      await prisma.platformTemplate.create({
        data: {
          segmentId: segment.id,
          name: templateName,
          description: parsedDef.description || null,
          definition: item.definition as any,
          version: item.version || 1,
          status: "ACTIVE",
        },
      });
    }
  }
}

/**
 * Lista todos os segmentos com suas contagens.
 */
export async function listPlatformBusinessSegments(includeInactive = false): Promise<BusinessSegmentWithCounts[]> {
  await ensureDefaultSegmentsAndTemplates();

  const rows = await prisma.platformBusinessSegment.findMany({
    where: includeInactive ? {} : { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          templates: { where: { status: "ACTIVE" } },
          organizations: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    _count: r._count,
  }));
}

/**
 * Lista templates de um segmento específico.
 */
export async function listPlatformTemplatesBySegment(
  segmentId: string,
  includeInactive = false
): Promise<PlatformTemplateModel[]> {
  const rows = await prisma.platformTemplate.findMany({
    where: {
      segmentId,
      ...(includeInactive ? {} : { status: "ACTIVE" }),
    },
    include: {
      segment: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    segmentId: r.segmentId,
    segmentName: r.segment.name,
    name: r.name,
    description: r.description,
    version: r.version,
    status: r.status,
    definition: r.definition,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
