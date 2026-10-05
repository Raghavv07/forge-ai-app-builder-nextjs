import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account",
  description: "Sign in or create an account for Forge.",
};

const AuthLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return <div className="flex justify-center pt-40">{children}</div>;
};

export default AuthLayout;
