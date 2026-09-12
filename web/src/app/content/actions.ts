"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ContentType } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  escapeHtml,
  generateContentPayload,
  renderTemplate,
} from "@/lib/content-engine";
import { formDataToRecord } from "@/lib/club-validation";
import { withOrganizationContext } from "@/lib/tenant-context";

const generateSchema = z.object({
  type: z.enum(ContentType),
  sourceId: z.string().min(1),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

export async function generateContentAsset(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("content:manage");
  const input = generateSchema.parse(formDataToRecord(formData));
  const { payload, template, job } = await withOrganizationContext(organizationId, async (tx) => {
    const payload = await generateContentPayload(input.type, input.sourceId, tx);
    const template =
      (payload.competitionId
        ? await tx.contentTemplate.findFirst({
            where: { organizationId, type: input.type, isActive: true, competitionId: payload.competitionId },
            orderBy: { version: "desc" },
          })
        : null) ??
      (await tx.contentTemplate.findFirst({
        where: { organizationId, type: input.type, isActive: true, competitionId: null },
        orderBy: { version: "desc" },
      }));
    if (!template) throw new Error("CONTENT_TEMPLATE_NOT_FOUND");

    const job = await tx.contentJob.create({
      data: {
        organizationId,
        templateId: template.id,
        requestedById: session.user.id,
        type: input.type,
        sourceType: payload.sourceType,
        sourceId: input.sourceId,
        status: "PROCESSING",
        startedAt: new Date(),
      },
    });
    return { payload, template, job };
  });
  let assetSlug: string;
  try {
    assetSlug = await withOrganizationContext(organizationId, async (tx) => {
      const textContent = renderTemplate(template.textTemplate, payload.variables);
      const htmlContent = renderTemplate(template.htmlTemplate, payload.variables, escapeHtml);
      const slug = `${slugify(payload.graphicData.title)}-${randomUUID().slice(0, 8)}`;
      const created = await tx.contentAsset.create({
        data: {
          organizationId,
          jobId: job.id,
          slug,
          title: payload.graphicData.title,
          textContent,
          htmlContent,
          graphicData: JSON.parse(JSON.stringify(payload.graphicData)) as Prisma.InputJsonObject,
        },
      });
      await tx.contentJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        action: "CONTENT_ASSET_GENERATED",
        entityType: "ContentAsset",
        entityId: created.id,
        details: { type: input.type, sourceType: payload.sourceType, sourceId: input.sourceId, slug },
      });
      return created.slug;
    });
  } catch (error) {
    await withOrganizationContext(organizationId, (tx) => tx.contentJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Generation failed",
        completedAt: new Date(),
      },
    }));
    throw error;
  }
  revalidatePath("/content");
  redirect(`/content/assets/${assetSlug}`);
}

const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  textTemplate: z.string().min(1).max(10000),
  htmlTemplate: z.string().min(1).max(20000),
});

export async function updateContentTemplate(
  templateId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("content:manage");
  const input = templateSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.contentTemplate.update({
      where: { id: templateId },
      data: input,
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "CONTENT_TEMPLATE_UPDATED",
      entityType: "ContentTemplate",
      entityId: templateId,
      details: { name: input.name },
    });
  });
  revalidatePath("/content/templates");
}
