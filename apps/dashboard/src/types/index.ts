import React from "react";

export type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export interface NavItemData {
  icon: IconType;
  label: string;
  id: string;
}

export type PageId = 
  | "overview" | "simulations" | "model" | "inspect"
  | "agents" | "tools" | "context" | "memory"
  | "apis" | "email" | "oauth" | "webhooks"
  | "traces" | "events"
  | "settings" | "docs";
