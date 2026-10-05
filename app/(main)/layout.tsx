import React from "react";
import { getCurrentAuthUser } from "@/lib/auth-helper";
import { redirect } from "next/navigation";

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/");

  return <div className="mt-16">{children}</div>;
}
