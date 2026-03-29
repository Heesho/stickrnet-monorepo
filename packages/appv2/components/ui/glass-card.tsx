"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export default function GlassCard({ children, className, delay = 0 }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className={cn(
        "rounded-[var(--radius)] border border-[hsl(var(--foreground)/0.1)] bg-[hsl(var(--surface)/0.6)] backdrop-blur-[20px] p-8 md:p-10",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
