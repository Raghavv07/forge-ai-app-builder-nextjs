"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth-helper";
import type { ProjectSummary } from "@/types/project";
import {
  isMessage,
  importWorkspaceSchema,
  type Message,
} from "@/types/workspace";

export type { ProjectSummary } from "@/types/project";

// ─── Get all workspaces for the current user ──────────────────────────────────

export async function getUserProjects(): Promise<ProjectSummary[]> {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/");

  const workspaces = await db.workspace.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return workspaces.map((w) => {
    const msgs = Array.isArray(w.messages) ? w.messages : [];
    const firstUserMsg = msgs.find(
      (m): m is Message => isMessage(m) && m.role === "user"
    );

    return {
      id: w.id,
      title: w.title,
      firstPrompt: firstUserMsg?.content?.slice(0, 120) ?? null,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      messageCount: Array.isArray(w.messages) ? w.messages.length : 0,
    };
  });
}

// ─── Import a workspace as a new project ──────────────────────────────────────

export async function importWorkspace(fileContent: string): Promise<string> {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/");

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(fileContent);
  } catch {
    throw new Error("Invalid workspace file: Invalid JSON structure.");
  }

  const result = importWorkspaceSchema.safeParse(rawJson);
  if (!result.success) {
    throw new Error(
      `Invalid workspace format: ${z.prettifyError(result.error)}`
    );
  }

  const { title, messages, fileData } = result.data;

  const workspace = await db.workspace.create({
    data: {
      userId: user.id,
      title: title ?? null,
      messages: messages as unknown as Prisma.InputJsonValue,
      fileData: (fileData ?? null) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  revalidatePath("/projects");

  return workspace.id;
}


// ─── Delete a workspace ───────────────────────────────────────────────────────

export async function deleteProject(workspaceId: string): Promise<void> {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/");

  await db.workspace.deleteMany({
    where: { id: workspaceId, userId: user.id },
  });

  revalidatePath("/projects");
}
