import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Activity, Briefcase, Star, Radar, Building2, Moon, Sun, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/", label: "Portfolio", icon: Briefcase, testid: "nav-portfolio", end: true },
  { to: "/watchlist", label: "Watchlist", icon: Star, testid: "nav-watchlist" },
  { to: "/movers", label: "Movers", icon: Radar, testid: "nav-movers" },
  { to: "/brokers", label: "Brokers", icon: Building2, testid: "nav-brokers" },
];

export default function Navbar() {
  const { user, logout, openAuth } = useAuth();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("apex_theme");
    const isDark = stored ? stored === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("apex_theme", next ? "dark" : "light");
  };

  return (
    <nav
      data-testid="main-navbar"
      className="sticky top-9 z-40 border-b border-border bg-background/80 backdrop-blur-xl"
    >
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <NavLink to="/" data-testid="brand-logo" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary grid place-items-center shadow-lg shadow-primary/30">
              <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="leading-none">
              <div className="font-heading font-extrabold text-lg tracking-tight">STEWART CAP</div>
              <div className="text-[10px] font-num uppercase tracking-widest text-muted-foreground">US · TSX</div>
            </div>
          </NavLink>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={l.testid}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`
                }
              >
                <l.icon className="w-4 h-4" />
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="theme-toggle"
            className="text-muted-foreground"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="gap-2" data-testid="user-menu-trigger">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="logout-btn" className="text-rose-400">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" onClick={() => openAuth("login")} data-testid="nav-login-btn" className="hidden sm:inline-flex">
                Sign in
              </Button>
              <Button onClick={() => openAuth("register")} data-testid="nav-register-btn">
                Get started
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <l.icon className="w-3.5 h-3.5" />
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
