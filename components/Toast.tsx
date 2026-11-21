"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useUI } from "@/store/ui";

export function Toast() {
  const toast = useUI((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useUI.setState({ toast: null }), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center pt-safe">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-full border border-line bg-elevated/95 px-4 py-2 text-sm shadow-xl backdrop-blur"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
