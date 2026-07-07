"use client";

import React from "react";

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <img src="/images/logo.png" className={`${className} object-contain rounded-xl`} alt="LeadPluz Logo" />
  );
}
