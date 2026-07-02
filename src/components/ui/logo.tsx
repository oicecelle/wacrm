"use client";

import React from "react";

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 108 108" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* L shape */}
      <path
        d="M 38 22 L 38 70 A 16 16 0 0 0 54 86 L 78 86"
        stroke="#2585fc"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Plus Sign */}
      {/* Horizontal: x=60 to x=92 (width 32), y=42 to y=54 (height 12, rx 6) */}
      <rect x="60" y="42" width="32" height="12" rx="6" fill="#2585fc" />
      {/* Top Cap: x=70 to x=82 (width 12), y=24 to y=42 */}
      <path d="M 70 42 L 70 30 A 6 6 0 0 1 82 30 L 82 42 Z" fill="#003bbd" />
      {/* Bottom Cap: x=70 to x=82 (width 12), y=54 to y=72 */}
      <path d="M 70 54 L 70 66 A 6 6 0 0 0 82 66 L 82 54 Z" fill="#003bbd" />
    </svg>
  );
}
