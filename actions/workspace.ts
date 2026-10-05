"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth-helper";
import type { WorkspaceUser, WorkspaceData } from "@/types/workspace";

export type { WorkspaceUser, WorkspaceData } from "@/types/workspace";

// ─── Get the current authenticated user ──────────────────────────────────────

export async function getWorkspaceUser(): Promise<WorkspaceUser> {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/");

  return {
    id: user.id,
    credits: 0,
    plan: "free",
  };
}

// ─── Get a workspace by id (must belong to the current user) ─────────────────

export async function getWorkspaceById(
  workspaceId: string,
  userId: string
): Promise<WorkspaceData> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, userId },
    select: {
      id: true,
      title: true,
      messages: true,
      fileData: true,
    },
  });

  if (!workspace) redirect("/");

  return workspace;
}

// ─── Export a workspace by id (must belong to the current user) ──────────────

export async function exportWorkspace(
  workspaceId: string,
  userId: string
): Promise<WorkspaceData | null> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, userId },
    select: {
      id: true,
      title: true,
      messages: true,
      fileData: true,
    },
  });

  return workspace;
}
