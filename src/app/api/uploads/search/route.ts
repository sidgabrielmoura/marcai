import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { getOptimizedCloudinaryUrl } from "@/infrastructure/cloudinary/cloudinary-service";

const searchSchema = z.object({
  taskId: z.string().optional(),
  q: z.string().optional(),
  type: z.enum(["PHOTO", "VIDEO", "FILE", "SIGNATURE", "ALL"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: Request) {
  const c = await getAuthenticatedContext(false);
  if (!c) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  try {
    const params = searchSchema.parse(queryParams);
    const skip = (params.page - 1) * params.limit;

    const whereClause: any = {
      validationStatus: "VALID",
      requirement: {
        task: {
          ...taskScope(c),
          deletedAt: null,
          ...(params.taskId ? { id: params.taskId } : {}),
        },
        ...(params.type !== "ALL" ? { type: params.type } : {}),
      },
      OR: [
        { fileUrl: { not: null } },
        { storageKey: { not: null } },
      ],
    };

    if (params.q && params.q.trim()) {
      whereClause.value = {
        contains: params.q.trim(),
        mode: "insensitive",
      };
    }

    const [total, submissions] = await Promise.all([
      prisma.evidenceSubmission.count({ where: whereClause }),
      prisma.evidenceSubmission.findMany({
        where: whereClause,
        include: {
          requirement: {
            select: {
              id: true,
              type: true,
              task: {
                select: {
                  id: true,
                  title: true,
                  location: { select: { id: true, name: true } },
                },
              },
            },
          },
          submitter: {
            select: {
              id: true,
              user: { select: { name: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: params.limit,
      }),
    ]);

    const items = submissions.map((sub) => {
      const meta = (sub.metadata || {}) as Record<string, any>;
      // Resolve a URL de consumo
      const directUrl = sub.fileUrl || (sub.storageKey?.startsWith("http") ? sub.storageKey : `/api/evidence/${sub.id}`);
      const isCloudinary = directUrl.startsWith("http://") || directUrl.startsWith("https://");
      
      const thumbnailUrl = isCloudinary
        ? getOptimizedCloudinaryUrl(directUrl, { width: 300, height: 300, crop: "fill", quality: "auto" })
        : null;

      return {
        id: sub.id,
        taskId: sub.requirement.task.id,
        taskTitle: sub.requirement.task.title,
        locationName: sub.requirement.task.location?.name || null,
        requirementType: sub.requirement.type,
        fileUrl: directUrl,
        thumbnailUrl,
        fileName: sub.value || meta.name || "arquivo",
        fileSize: meta.size || null,
        mimeType: meta.mime || null,
        submittedBy: sub.submitter?.user?.name || "Colaborador",
        createdAt: sub.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: items,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Parâmetros de busca inválidos." }, { status: 400 });
    }
    console.error("Erro na busca de uploads:", err);
    return NextResponse.json({ error: "Erro interno ao buscar conteúdos." }, { status: 500 });
  }
}
