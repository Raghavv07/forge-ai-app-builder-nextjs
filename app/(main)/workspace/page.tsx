import { WorkspaceClient } from "@/components/WorkspaceClient";
import { getWorkspaceUser, getWorkspaceById } from "@/actions/workspace";
import type { Metadata } from "next";

interface WorkspacePageProps {
  searchParams: Promise<{ prompt?: string; id?: string }>;
}

export async function generateMetadata({
  searchParams,
}: WorkspacePageProps): Promise<Metadata> {
  const { prompt } = await searchParams;
  if (prompt) {
    return {
      title: `Building: ${prompt.slice(0, 30)}…`,
      description: "Live AI app generation and editing workspace.",
    };
  }
  return {
    title: "Workspace",
    description: "Interactive React sandbox, code editor, and AI chat.",
  };
}

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  const { prompt, id } = await searchParams;

  const user = await getWorkspaceUser();

  let workspace = null;
  if (id) {
    workspace = await getWorkspaceById(id, user.id);
  }

  return (
    <WorkspaceClient
      initialPrompt={prompt ?? null}
      workspace={workspace}
      userId={user.id}
    />
  );
}
