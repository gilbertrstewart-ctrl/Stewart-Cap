import React from "react";
import { Outlet } from "react-router-dom";
import TickerTape from "@/components/TickerTape";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";

export default function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TickerTape />
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Outlet />
      </main>
      <AuthModal />
      <footer className="border-t border-border mt-16">
        <div className="max-w-[1500px] mx-auto px-6 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-num">STEWART CAP · Live data via Yahoo Finance · AI insights by Claude</span>
          <span>Informational only — not financial advice.</span>
        </div>
      </footer>
    </div>
  );
}
