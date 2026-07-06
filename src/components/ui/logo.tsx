"use client";

import React from "react";

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <img src="/images/logo.svg" className={`${className} object-contain`} alt="LeadPluz Logo" />
  );
}
