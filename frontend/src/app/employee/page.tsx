"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Bare /employee → the dashboard. */
export default function EmployeeIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/employee/dashboard");
  }, [router]);
  return null;
}
